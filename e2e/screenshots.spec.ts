import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { chooseMotion, asReturningVisitor, driveTo, skipFloorLines, emptyFloorPoint, hoverTarget, interactablesOf, padsOf, PHONE_SAFE, snapshot, targetPoint, visibleTarget, waitForCameraSettle, waitForFloor, waitForHQ, waitForPhase, waitForRoom, waitForSceneLive } from "./hq";
import en from "../messages/en.json";
import { heroPod } from "./routes";
import { stationOf } from "../src/experience/floors/lobby/hallLayout";
import { highlightRoom } from "../src/experience/floors/lobby/stations";

/** Opt-in (SCREENSHOTS=1): captures PR screenshots into screenshots/. WebGL runs on SwiftShader. */
type Viewport = { name: string; width: number; height: number; tier: "full" | "lite"; touch: boolean };

const VIEWPORTS: readonly Viewport[] = [
  { name: "desktop", width: 1440, height: 900, tier: "full", touch: false },
  { name: "tablet", width: 1024, height: 1366, tier: "full", touch: true },
  { name: "mobile", width: 390, height: 844, tier: "lite", touch: true },
];

/** L4 Writing at the sizes its concepts were reviewed in (1440x900, 834x1112, 390x844). */
const L4_VIEWPORTS: readonly Viewport[] = [VIEWPORTS[0], { name: "tablet", width: 834, height: 1112, tier: "full", touch: true }, VIEWPORTS[2]];

const PAGES = [
  { name: "lobby", path: "/en" },
  { name: "quick", path: "/en/quick" },
  { name: "journey", path: "/en/journey" },
  { name: `labs-${heroPod.slug}`, path: `/en/labs/${heroPod.slug}` },
];

test.skip(!process.env.SCREENSHOTS, "Set SCREENSHOTS=1 to capture screenshots");
test.describe.configure({ timeout: 120_000 });

const shot = (name: string, v: Viewport) => `screenshots/${name}-${v.width}x${v.height}.png`;

async function open3D(browser: Browser, v: Viewport) {
  const context = await browser.newContext({
    viewport: { width: v.width, height: v.height },
    deviceScaleFactor: 1,
    hasTouch: v.touch,
    isMobile: v.name === "mobile",
  });
  const page = await context.newPage();
  await asReturningVisitor(page);
  await page.goto(`/en?tier=${v.tier}`);
  await waitForHQ(page);
  await waitForPhase(page, "explore");
  await page.evaluate(() => document.fonts.ready);
  return { context, page };
}

/** Deep links a floor route (the intro already played this session). */
async function open3DAt(browser: Browser, v: Viewport, path: string) {
  const context = await browser.newContext({
    viewport: { width: v.width, height: v.height },
    deviceScaleFactor: 1,
    hasTouch: v.touch,
    isMobile: v.name === "mobile",
  });
  const page = await context.newPage();
  await asReturningVisitor(page);
  await page.goto(`${path}?tier=${v.tier}`);
  await waitForHQ(page);
  await waitForPhase(page, "explore");
  await page.evaluate(() => document.fonts.ready);
  return { context, page };
}

/**
 * The Corners HUD (phones and tablets) keeps Classic site, Ask Rover and (on phones) search in the menu
 * sheet: opens it and returns it, or returns the HUD itself on desktops.
 */
async function hudActions(page: Page) {
  const menu = page.getByTestId("hud").getByTestId("hud-menu");
  if (!(await menu.isVisible())) return page.getByTestId("hud");
  await menu.click();
  const sheet = page.getByTestId("menu-sheet");
  await expect(sheet).toBeVisible();
  return sheet;
}

/** Opens search from the top bar (desktops and tablets) or the menu sheet (phones). */
async function openSearch(page: Page) {
  const launcher = page.getByTestId("hud").getByRole("button", { name: /open search/i });
  if (await launcher.isVisible()) await launcher.click();
  else await (await hudActions(page)).getByRole("button", { name: en.hud.launcher.search, exact: true }).click();
}

/** Opens a room through the command palette (drive and open), like a visitor would. */
async function openRoomFromPalette(page: Page, query: string, room: string) {
  await openSearch(page);
  await expect(page.getByRole("dialog", { name: "Command palette" }).getByRole("combobox")).toBeFocused();
  await page.keyboard.type(query);
  await page.keyboard.press("Enter");
  await waitForRoom(page, room, 90_000);
}

const FLOOR_SHOTS = [
  { name: "hq-rf-roof", path: "/en/contact" },
  { name: "hq-rf-comms", path: "/en/contact", query: "Comms station", room: "RF:contact" },
] as const;

for (const viewport of VIEWPORTS) {
  for (const floor of FLOOR_SHOTS) {
    test(`3D ${floor.name} @ ${viewport.width}x${viewport.height}`, async ({ browser }) => {
      test.setTimeout(180_000);
      const { context, page } = await open3DAt(browser, viewport, floor.path);
      // Floor content mounts behind Suspense once its fonts are ready. On lite, wait until it draws; the full
      // tier renders through the bloom composer, whose final pass is a single draw call, so give it time instead.
      if (viewport.tier === "lite") {
        await page.waitForFunction(() => (window as unknown as { __hq: { rover: { drawCalls: number } } }).__hq.rover.drawCalls > 35, null, { timeout: 90_000 });
      } else await page.waitForTimeout(8000);
      if ("room" in floor) await openRoomFromPalette(page, floor.query, floor.room);
      await page.waitForTimeout(3000);
      await page.screenshot({ path: shot(floor.name, viewport) });
      await context.close();
    });
  }
}

for (const viewport of VIEWPORTS) {
  for (const page of PAGES) {
    test(`${page.name} (HTML) @ ${viewport.width}x${viewport.height}`, async ({ browser }) => {
      const context = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: "reduce" });
      await chooseMotion(context, "system");
      const tab = await context.newPage();
      await tab.addInitScript(() => {
        localStorage.setItem("hq:terminal-seen", "1");
        localStorage.setItem("hq:onboarded", "done");
      });
      await tab.goto(`${page.path}?tier=static`, { waitUntil: "networkidle" });
      await tab.evaluate(() => document.fonts.ready);
      await expect(tab.locator("h1").first()).toBeVisible();
      await tab.screenshot({ path: shot(page.name, viewport), fullPage: false });
      await context.close();
    });
  }

  test(`3D lobby @ ${viewport.width}x${viewport.height}`, async ({ browser }) => {
    const { context, page } = await open3D(browser, viewport);
    await page.waitForTimeout(3000);
    await page.screenshot({ path: shot("hq-lobby", viewport) });
    await context.close();
  });

  test(`3D boot @ ${viewport.width}x${viewport.height}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    await page.goto(`/en?tier=${viewport.tier}`);
    await waitForHQ(page);
    // Scoped to the overlay: the released SSR boot cover keeps the same log lines in the DOM.
    await expect(page.getByTestId("boot").getByText("rover ready ^_^")).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: shot("hq-boot", viewport) });
    await context.close();
  });

  test(`classic site with Back to 3D @ ${viewport.width}x${viewport.height}`, async ({ browser }) => {
    const { context, page } = await open3D(browser, viewport);
    await (await hudActions(page)).getByRole("button", { name: "Classic site" }).click();
    await expect(page.getByRole("button", { name: "Back to 3D" })).toBeInViewport({ timeout: 30_000 });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: shot("page-view", viewport) });
    await context.close();
  });
}

type HQState = { __hq: { store: { getState: () => { phase: string; rover: { x: number; z: number } } } } };

/** Opens an L2 route in 3D (floor routes skip boot and intro) and waits for the corridor to draw. */
async function openL2(browser: Browser, v: Viewport, path: string, phase: "explore" | "room") {
  const context = await browser.newContext({ viewport: { width: v.width, height: v.height }, deviceScaleFactor: 1, hasTouch: v.touch, isMobile: v.name === "mobile" });
  const page = await context.newPage();
  await asReturningVisitor(page);
  await page.goto(`${path}?tier=${v.tier}`);
  await waitForHQ(page);
  await waitForPhase(page, phase);
  await page.evaluate(() => document.fonts.ready);
  // In-world text (troika) builds its glyphs slowly on SwiftShader (draw call counts are not reliable with bloom).
  await page.waitForTimeout(6000);
  return { context, page };
}

const roverPast = (page: Page, x: number) =>
  page.waitForFunction((min) => (window as unknown as HQState).__hq.store.getState().rover.x > min, x, { timeout: 150_000 });

/** L2 Career Road on the rail camera, a career room's drawer, and the Workshop annex. */
for (const viewport of VIEWPORTS) {
  test(`3D L2 corridor @ ${viewport.width}x${viewport.height}`, async ({ browser }) => {
    test.setTimeout(240_000);
    const { context, page } = await openL2(browser, viewport, "/en/journey", "explore");
    await page.keyboard.down("d");
    await roverPast(page, -8);
    await page.keyboard.up("d");
    await page.waitForTimeout(4000);
    await page.screenshot({ path: shot("hq-l2-corridor", viewport) });
    await context.close();
  });

  test(`3D L2 room @ ${viewport.width}x${viewport.height}`, async ({ browser }) => {
    test.setTimeout(240_000);
    const { context, page } = await openL2(browser, viewport, "/en/journey/jenius-2024", "room");
    await expect(page.getByTestId("room-drawer")).toBeVisible();
    await page.waitForTimeout(6000);
    await page.screenshot({ path: shot("hq-l2-room", viewport) });
    await context.close();
  });

  test(`3D L2 annex @ ${viewport.width}x${viewport.height}`, async ({ browser }) => {
    test.setTimeout(300_000);
    // From the 2026 room on the north side, back onto the road (S), then east along it into the annex.
    const { context, page } = await openL2(browser, viewport, "/en/journey/metrodata-2026", "room");
    await page.keyboard.press("Escape");
    await waitForPhase(page, "explore");
    await page.keyboard.down("s");
    await page.waitForFunction(() => (window as unknown as HQState).__hq.store.getState().rover.z > -9, null, { timeout: 60_000 });
    await page.keyboard.up("s");
    await page.keyboard.down("d");
    await roverPast(page, 340);
    await page.keyboard.up("d");
    await page.waitForTimeout(5000);
    await page.screenshot({ path: shot("hq-l2-annex", viewport) });
    await context.close();
  });
}

/** L4 Writing: the floor with the first-visit floor line and the Research drawer. */
for (const viewport of L4_VIEWPORTS) {
  test(`3D hq-l4 @ ${viewport.width}x${viewport.height}`, async ({ browser }) => {
    test.setTimeout(300_000);
    const { context, page } = await open3DAt(browser, viewport, "/en/library");
    // In-world text (troika) builds its glyphs slowly on SwiftShader.
    await page.waitForTimeout(8000);
    const line = page.getByTestId("dialog-box");
    await expect(line).toHaveAttribute("data-dialog", "floor:L4");
    await expect(line).toHaveAttribute("data-typing", "false", { timeout: 15_000 });
    await page.screenshot({ path: shot("hq-l4-writing", viewport) });
    await page.keyboard.press("Enter");
    await expect(line).toHaveCount(0);
    await openRoomFromPalette(page, "Research shelf", "L4:research");
    await page.waitForTimeout(3000);
    await page.screenshot({ path: shot("hq-l4-research", viewport) });
    await context.close();
  });
}

/** L3 with the drawer open and the hologram view (deep links skip boot and intro). */
for (const viewport of VIEWPORTS) {
  for (const view of [
    { name: "hq-l3-drawer", query: "", phase: "room" },
    { name: "hq-l3-hologram", query: "&view=architecture", phase: "hologram" },
  ]) {
    test(`3D ${view.name} @ ${viewport.width}x${viewport.height}`, async ({ browser }) => {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 1,
        hasTouch: viewport.touch,
        isMobile: viewport.name === "mobile",
      });
      const page = await context.newPage();
      await asReturningVisitor(page);
      await page.goto(`/en/labs/${heroPod.slug}?tier=${viewport.tier}${view.query}`);
      await waitForHQ(page);
      await waitForPhase(page, view.phase);
      await page.evaluate(() => document.fonts.ready);
      // In-world text (troika) builds its glyphs slowly on SwiftShader.
      await page.waitForTimeout(8000);
      await page.screenshot({ path: shot(view.name, viewport) });
      await context.close();
    });
  }
}

const OVERLAYS = [
  { name: "terminal", open: (tab: Page) => tab.getByRole("button", { name: "Ask Rover", exact: true }).click() },
  {
    name: "palette",
    open: async (tab: Page) => {
      await tab.getByRole("button", { name: /open search/i }).click();
      await tab.keyboard.type("azure");
    },
  },
];

for (const viewport of VIEWPORTS) {
  for (const overlay of OVERLAYS) {
    test(`${overlay.name} @ ${viewport.width}x${viewport.height}`, async ({ browser }) => {
      const context = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: "reduce" });
      await chooseMotion(context, "system");
      const tab = await context.newPage();
      await tab.addInitScript(() => {
        localStorage.setItem("hq:terminal-seen", "1");
        localStorage.setItem("hq:onboarded", "done");
      });
      await tab.goto("/en?tier=static", { waitUntil: "networkidle" });
      await tab.evaluate(() => document.fonts.ready);
      await overlay.open(tab);
      await expect(tab.getByRole("dialog")).toBeVisible();
      await tab.screenshot({ path: shot(overlay.name, viewport), fullPage: false });
      await context.close();
    });
  }
}

/**
 * `ogAt`: where the share card still is taken when the start spot does not show the floor's centerpiece
 * (L1 spawns at the Ask Rover kiosk, so its still drives in front of the rover mark hologram).
 */
const FLOOR_THUMBS: readonly { id: string; path: string; ogAt?: { x: number; z: number } }[] = [
  { id: "L1", path: "/en", ogAt: { x: 5, z: -8 } },
  { id: "L2", path: "/en/journey" },
  { id: "L3", path: "/en/labs" },
  { id: "L4", path: "/en/library" },
  { id: "RF", path: "/en/contact" },
];

/** Elevator picker thumbnails: each floor from its start spot with the HUD hidden (`bun run floor:thumbs` converts them to public/floors/*.webp). */
for (const floor of FLOOR_THUMBS) {
  test(`floor thumbnail ${floor.id}`, async ({ browser }) => {
    test.setTimeout(180_000);
    const context = await browser.newContext({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    await asReturningVisitor(page);
    await skipFloorLines(page);
    await page.goto(`${floor.path}?tier=full`);
    await waitForHQ(page);
    await waitForPhase(page, "explore");
    await page.evaluate(() => document.fonts.ready);
    await page.addStyleTag({ content: "[data-testid='hud'], [data-testid^='ask-'] { display: none !important; }" });
    // The full tier renders through the bloom composer: give the floor time to mount and settle.
    await page.waitForTimeout(8000);
    await page.screenshot({ path: `screenshots/floor-thumbs/${floor.id}.png` });
    await context.close();
  });
}

/** L1 at the owner's review sizes: the plaza (title under the top bar), the view into the Highlights Hall, and the projects station with its drawer. */
for (const viewport of L4_VIEWPORTS) {
  test(`3D hq-l1-hall @ ${viewport.width}x${viewport.height}`, async ({ browser }) => {
    test.setTimeout(240_000);
    const { context, page } = await open3D(browser, viewport);
    await page.waitForTimeout(2500);
    await page.screenshot({ path: shot("hq-l1-plaza", viewport) });
    await driveTo(page, { x: 34, z: 13 });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: shot("hq-l1-hall", viewport) });
    await driveTo(page, stationOf("projects").pad);
    await waitForRoom(page, highlightRoom("projects"));
    await page.waitForTimeout(1500);
    await page.screenshot({ path: shot("hq-l1-projects", viewport) });
    await context.close();
  });
}

/** The L1 Ask Rover kiosk from its point-and-go stop, at the owner's review sizes (`hq-l1-kiosk-*`). */
for (const viewport of L4_VIEWPORTS) {
  test(`3D hq-l1-kiosk @ ${viewport.width}x${viewport.height}`, async ({ browser }) => {
    test.setTimeout(180_000);
    const { context, page } = await open3D(browser, viewport);
    await expect.poll(async () => (await interactablesOf(page)).some((i) => i.id === "L1:kiosk:ask-rover"), { timeout: 30_000 }).toBe(true);
    const kiosk = (await interactablesOf(page)).find((i) => i.id === "L1:kiosk:ask-rover")!;
    await driveTo(page, kiosk.at);
    await page.waitForTimeout(2500);
    await page.screenshot({ path: shot("hq-l1-kiosk", viewport) });
    await context.close();
  });
}

for (const viewport of VIEWPORTS) {
  test(`3D pad pickers @ ${viewport.width}x${viewport.height}`, async ({ browser }) => {
    test.setTimeout(240_000);
    const { context, page } = await open3DAt(browser, viewport, "/en/journey");
    const pads = await padsOf(page, "L2");
    const lift = pads.find((p) => p.kind === "elevator")!;
    const teleport = pads.find((p) => p.kind === "teleport")!;
    const picker = page.getByTestId("pad-picker");

    await driveTo(page, { x: lift.at.x + 10, z: lift.at.z });
    await driveTo(page, lift.at);
    await expect(picker).toBeVisible();
    await page.waitForTimeout(800);
    await page.screenshot({ path: shot("hq-pad-floors", viewport) });
    await page.keyboard.press("Escape");

    await driveTo(page, teleport.at);
    await expect(picker).toBeVisible();
    await page.waitForTimeout(800);
    await page.screenshot({ path: shot("hq-pad-years", viewport) });
    await page.keyboard.press("Escape");
    await expect(picker).toHaveCount(0);

    // The rover parked on the 2019 teleporter, with the pad glow and the floating icons.
    await page.waitForTimeout(1500);
    await page.screenshot({ path: shot("hq-pad-teleporter", viewport) });
    await context.close();
  });
}

test.describe("HUD layout (bottom band, top bar, drawer footer)", () => {
  for (const vp of [
    { width: 834, height: 1112 },
    { width: 390, height: 844 },
  ] as const) {
    test(`bottom band on L3 @ ${vp.width}x${vp.height}`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
      const page = await context.newPage();
      await asReturningVisitor(page);
      await skipFloorLines(page);
      await page.goto("/en/labs?tier=lite");
      await waitForHQ(page);
      await waitForPhase(page, "explore");
      await page.evaluate(() => document.fonts.ready);
      // In-world text (troika) builds its glyphs slowly on SwiftShader.
      await page.waitForTimeout(3000);
      await page.screenshot({ path: `screenshots/hq-bottom-band-${vp.width}x${vp.height}.png` });
      await context.close();
    });
  }

  for (const vp of [
    { width: 1440, height: 900, touch: false },
    { width: 390, height: 844, touch: true },
  ] as const) {
    test(`drawer footer on L2 @ ${vp.width}x${vp.height}`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1, hasTouch: vp.touch, isMobile: vp.touch });
      const page = await context.newPage();
      await asReturningVisitor(page);
      await page.goto("/en/journey/jenius-2024?tier=lite");
      await waitForHQ(page);
      await waitForRoom(page, "L2:jenius-2024");
      await expect(page.getByTestId("drawer-footer")).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(3000);
      await page.screenshot({ path: `screenshots/hq-drawer-footer-${vp.width}x${vp.height}.png` });
      await context.close();
    });
  }
});

for (const vp of [
  { width: 1440, height: 900, touch: false },
  { width: 390, height: 844, touch: true },
] as const) {
  test(`live site link on the case study and in the L3 drawer @ ${vp.width}x${vp.height}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1, hasTouch: vp.touch, isMobile: vp.touch });
    const page = await context.newPage();
    await page.goto("/en/labs/solutions-marketing-site?tier=static");
    await expect(page.locator("main [data-live-link]").first()).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `screenshots/live-link-page-${vp.width}x${vp.height}.png` });
    await asReturningVisitor(page);
    await page.goto("/en/labs/solutions-marketing-site?tier=lite");
    await waitForHQ(page);
    await waitForRoom(page, "L3:solutions-marketing-site");
    await expect(page.getByTestId("drawer-live-link")).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `screenshots/live-link-drawer-${vp.width}x${vp.height}.png` });
    await context.close();
  });
}

test.describe("point and go", () => {
  test("hover label and outline on L3 @ 1440x900", async ({ browser }) => {
    test.setTimeout(240_000);
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    await asReturningVisitor(page);
    await skipFloorLines(page);
    await page.goto("/en/labs?tier=full");
    await waitForHQ(page);
    await waitForPhase(page, "explore");
    await page.evaluate(() => document.fonts.ready);
    // The full tier renders through the bloom composer: give the floor time to mount and settle.
    await page.waitForTimeout(6000);
    const pod = await visibleTarget(page, { kinds: ["door"] });
    await hoverTarget(page, pod.id);
    // Troika builds the label glyphs slowly on SwiftShader.
    await page.waitForTimeout(2500);
    await page.screenshot({ path: "screenshots/hq-point-hover-1440x900.png" });
    const empty = await emptyFloorPoint(page);
    await page.mouse.click(empty.x, empty.y);
    await expect(page.getByTestId("point-hint")).toBeVisible();
    await page.screenshot({ path: "screenshots/hq-point-hint-1440x900.png" });
    await context.close();
  });

  test("tap to select with the Go chip on L3 @ 390x844", async ({ browser }) => {
    test.setTimeout(240_000);
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    await asReturningVisitor(page);
    await skipFloorLines(page);
    await page.goto("/en/labs?tier=lite");
    await waitForHQ(page);
    await waitForPhase(page, "explore");
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(4000);
    const pod = await visibleTarget(page, { kinds: ["door"], safe: PHONE_SAFE });
    const point = await targetPoint(page, pod.id);
    await page.touchscreen.tap(point.x, point.y);
    await expect(page.getByTestId("interact-go")).toBeVisible();
    await page.waitForTimeout(2500);
    await page.screenshot({ path: "screenshots/hq-point-tap-390x844.png" });
    await context.close();
  });
});

test.describe("Rover dialog", () => {
  for (const viewport of VIEWPORTS) {
    test(`3D onboarding @ ${viewport.width}x${viewport.height}`, async ({ browser }) => {
      test.setTimeout(240_000);
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: 1,
        hasTouch: viewport.touch,
        isMobile: viewport.name === "mobile",
      });
      const page = await context.newPage();
      // The boot and intro already played this session, but this browser was never onboarded.
      await page.addInitScript(() => {
        sessionStorage.setItem("hq:intro", "seen");
        localStorage.setItem("hq:terminal-seen", "1");
        localStorage.setItem("hq:hints", "on");
      });
      await page.goto(`/en?tier=${viewport.tier}`);
      await waitForHQ(page);
      await waitForPhase(page, "explore");
      await page.evaluate(() => document.fonts.ready);
      const box = page.getByTestId("dialog-box");
      // The full tier compiles its shaders on SwiftShader first, which can hold the main thread (and the typewriter) for a while.
      await expect(box).toHaveAttribute("data-line", "welcome", { timeout: 30_000 });
      await expect(box).toHaveAttribute("data-typing", "false", { timeout: 60_000 });
      await page.waitForTimeout(1500);
      await page.screenshot({ path: shot("hq-onboarding-welcome", viewport) });

      /** One click once the line has typed out (a click on a choice line would pick its highlighted choice). */
      const advance = async () => {
        await expect(box).toHaveAttribute("data-typing", "false", { timeout: 60_000 });
        await box.click();
      };
      await page.getByTestId("dialog-choices").getByRole("button", { name: en.dialog.onboarding.start }).click();
      await expect(box).toHaveAttribute("data-line", "move");
      await advance();
      await expect(box).toHaveAttribute("data-line", "point-go");
      await page.getByTestId("dialog-choices").getByRole("button", { name: en.dialog.continue }).click({ timeout: 20_000 });
      await expect(box).toHaveAttribute("data-line", "moved");
      await advance();
      await expect(box).toHaveAttribute("data-line", "camera");
      await advance();
      await expect(box).toHaveAttribute("data-line", /^(highlights|elevator)$/, { timeout: 15_000 });
      if ((await box.getAttribute("data-line")) === "highlights") {
        await page.getByTestId("dialog-choices").getByRole("button", { name: en.dialog.onboarding.later }).click();
      }
      await expect(box).toHaveAttribute("data-line", "elevator");
      await expect(box).toHaveAttribute("data-typing", "false", { timeout: 60_000 });
      await page.waitForTimeout(800);
      await page.screenshot({ path: shot("hq-onboarding-spotlight", viewport) });
      await page.getByTestId("dialog-skip").click();
      await expect(box).toHaveAttribute("data-line", "skipped");
      await advance();
      await expect(box).toHaveCount(0);

      const lift = (await padsOf(page, "L1")).find((p) => p.kind === "elevator")!;
      await driveTo(page, { x: lift.at.x + 4, z: lift.at.z });
      await expect(page.getByTestId("hint-bubble")).toBeVisible({ timeout: 15_000 });
      await page.waitForTimeout(800);
      await page.screenshot({ path: shot("hq-hint-bubble", viewport) });
      await context.close();
    });

    test(`3D floor line @ ${viewport.width}x${viewport.height}`, async ({ browser }) => {
      test.setTimeout(180_000);
      const { context, page } = await open3DAt(browser, viewport, "/en/journey");
      const box = page.getByTestId("dialog-box");
      await expect(box).toHaveAttribute("data-dialog", "floor:L2", { timeout: 30_000 });
      await expect(box).toHaveAttribute("data-typing", "false", { timeout: 60_000 });
      // In-world text (troika) builds its glyphs slowly on SwiftShader.
      await page.waitForTimeout(3000);
      await page.screenshot({ path: shot("hq-floor-line", viewport) });
      await context.close();
    });
  }
});

/**
 * Share card backgrounds (`bun run og:stills`, R5 P9): each floor from its start spot, like the floor
 * thumbnails, at 1200x630 rendered at 2x on the full tier (bloom on) with the HUD and Ask dock hidden.
 * At 2x on SwiftShader a frame takes seconds, so the test counts rendered frames to let the floor
 * settle, then stops the animation loop so the screenshot reads one finished frame.
 * scripts/og-stills.ts converts them to public/og-assets/floor-{id}.jpg.
 */
type OgLoop = { frames: number; stop: boolean; stopped: boolean };
const ogLoop = (page: Page) => page.evaluate(() => (window as unknown as { __ogLoop: OgLoop }).__ogLoop);

for (const floor of FLOOR_THUMBS) {
  test(`og still ${floor.id}`, async ({ browser }) => {
    test.setTimeout(600_000);
    const context = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 2 });
    const page = await context.newPage();
    await asReturningVisitor(page);
    await page.addInitScript(() => {
      const loop: OgLoop = { frames: 0, stop: false, stopped: false };
      (window as unknown as { __ogLoop: OgLoop }).__ogLoop = loop;
      const raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = (cb) =>
        raf((ts) => {
          if (loop.stop) {
            loop.stopped = true;
            return;
          }
          loop.frames++;
          cb(ts);
        });
    });
    await skipFloorLines(page);
    await page.goto(`${floor.path}?tier=full`);
    await waitForHQ(page);
    await waitForPhase(page, "explore", 240_000);
    if (floor.ogAt) {
      await waitForSceneLive(page, 240_000);
      await driveTo(page, floor.ogAt, 240_000);
      await waitForCameraSettle(page, { timeout: 240_000 });
    }
    await page.evaluate(() => document.fonts.ready);
    await page.addStyleTag({ content: "[data-testid='hud'], [data-testid^='ask-'] { display: none !important; }" });
    // Let the floor and its neighbours mount and the bloom settle, then freeze one finished frame.
    const start = (await ogLoop(page)).frames;
    await expect.poll(async () => (await ogLoop(page)).frames - start, { timeout: 420_000, intervals: [2000] }).toBeGreaterThanOrEqual(15);
    await page.evaluate(() => {
      (window as unknown as { __ogLoop: OgLoop }).__ogLoop.stop = true;
    });
    await expect.poll(async () => (await ogLoop(page)).stopped, { timeout: 60_000, intervals: [1000] }).toBe(true);
    mkdirSync("screenshots/og-stills", { recursive: true });
    await page.screenshot({ path: `screenshots/og-stills/${floor.id}.png`, timeout: 120_000 });
    await context.close();
  });
}

/**
 * Round 5 CV refresh review captures: the Page View pages that carry CV facts (full page), the L1
 * skills wall and an RF control pose at the round 5 sizes, reduced motion so 3D frames compare.
 * SHOT_DIR picks the folder (before and after runs); metrics.jsonl records draw calls per pose.
 *   SCREENSHOTS=1 SHOT_DIR=screenshots/r5-p5/before E2E_PORT=4434 bunx playwright test e2e/screenshots.spec.ts -g "CV refresh" --workers=1
 */
const CV_SHOT_DIR = process.env.SHOT_DIR ?? "screenshots/r5-p5";
const CV_VIEWPORTS: readonly Viewport[] = [
  { name: "desktop", width: 1440, height: 900, tier: "full", touch: false },
  { name: "desktop", width: 2560, height: 1440, tier: "full", touch: false },
  { name: "mobile", width: 390, height: 844, tier: "lite", touch: true },
];
const CV_PAGE_PATHS = ["/en", "/en/contact", "/en/cv", "/en/journey"] as const;

async function open3DStill(browser: Browser, v: Viewport, path: string) {
  const context = await browser.newContext({
    viewport: { width: v.width, height: v.height },
    deviceScaleFactor: 1,
    hasTouch: v.touch,
    isMobile: v.name === "mobile",
    reducedMotion: "reduce",
  });
  await chooseMotion(context, "system");
  const page = await context.newPage();
  await asReturningVisitor(page);
  await page.goto(`${path}?tier=${v.tier}`);
  await waitForHQ(page);
  await waitForPhase(page, "explore");
  await page.evaluate(() => document.fonts.ready);
  return { context, page };
}

/** Floor content mounts behind Suspense: lite waits until it draws; full (one composer pass) waits a fixed time. */
async function settleFloor(page: Page, v: Viewport) {
  if (v.tier === "lite") {
    await page.waitForFunction(() => (window as unknown as { __hq: { rover: { drawCalls: number } } }).__hq.rover.drawCalls > 35, null, { timeout: 90_000 });
  } else await page.waitForTimeout(8000);
}

/**
 * Chromium refuses one capture taller than its texture limit (about 16k px: /journey at 1440 wide, Home
 * at 2560), so tall pages are written in 8000 px slices (`-part1.png`, `-part2.png`, ...).
 */
async function fullPageShot(page: Page, base: string, width: number) {
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  const slice = 8000;
  if (height <= slice) {
    await page.screenshot({ path: `${base}.png`, fullPage: true, animations: "disabled" });
    return;
  }
  for (let y = 0, part = 1; y < height; y += slice, part += 1) {
    await page.screenshot({ path: `${base}-part${part}.png`, fullPage: true, animations: "disabled", clip: { x: 0, y, width, height: Math.min(slice, height - y) } });
  }
}

const cvDrawCalls = (page: Page) => page.evaluate(() => (window as unknown as { __hq: { rover: { drawCalls: number } } }).__hq.rover.drawCalls);

function recordCvMetric(entry: Record<string, unknown>) {
  mkdirSync(CV_SHOT_DIR, { recursive: true });
  appendFileSync(`${CV_SHOT_DIR}/metrics.jsonl`, `${JSON.stringify(entry)}\n`);
}

test.describe("CV refresh captures", () => {
  for (const v of CV_VIEWPORTS) {
    const size = `${v.width}x${v.height}`;
    // SwiftShader renders 2560x1440 at a few frames per second; drives take longer in wall time.
    const budget = v.width > 2000 ? 600_000 : 240_000;

    for (const path of CV_PAGE_PATHS) {
      const name = path === "/en" ? "home" : path.slice(4);
      test(`CV refresh page ${name} @ ${size}`, async ({ browser }) => {
        const context = await browser.newContext({ viewport: { width: v.width, height: v.height }, deviceScaleFactor: 1, reducedMotion: "reduce" });
        await chooseMotion(context, "system");
        const tab = await context.newPage();
        await tab.addInitScript(() => {
          localStorage.setItem("hq:terminal-seen", "1");
          localStorage.setItem("hq:onboarded", "done");
        });
        await tab.goto(`${path}?tier=static`, { waitUntil: "networkidle" });
        await tab.evaluate(() => document.fonts.ready);
        await expect(tab.locator("h1").first()).toBeVisible();
        await fullPageShot(tab, `${CV_SHOT_DIR}/page-${name}-${size}`, v.width);
        await context.close();
      });
    }

    test(`CV refresh 3D L1 skills wall @ ${size}`, async ({ browser }) => {
      test.setTimeout(budget);
      const { context, page } = await open3DStill(browser, v, "/en");
      await settleFloor(page, v);
      await openSearch(page);
      await expect(page.getByRole("dialog", { name: "Command palette" }).getByRole("combobox")).toBeFocused();
      await page.keyboard.type("Skills wall");
      await page.keyboard.press("Enter");
      await waitForRoom(page, "L1:skills", budget - 60_000);
      await page.keyboard.press("Escape");
      await waitForPhase(page, "explore", 60_000);
      await waitForCameraSettle(page, { timeout: 120_000 });
      // In-world text (troika) builds its glyphs slowly on SwiftShader.
      await page.waitForTimeout(3000);
      recordCvMetric({ view: "l1-skills-wall", size, tier: v.tier, drawCalls: await cvDrawCalls(page) });
      await page.screenshot({ path: `${CV_SHOT_DIR}/3d-l1-skills-wall-${size}.png` });
      await context.close();
    });

    test(`CV refresh 3D RF control @ ${size}`, async ({ browser }) => {
      test.setTimeout(budget);
      const { context, page } = await open3DStill(browser, v, "/en/contact");
      await settleFloor(page, v);
      await waitForCameraSettle(page, { timeout: 120_000 });
      await page.waitForTimeout(3000);
      recordCvMetric({ view: "rf-control", size, tier: v.tier, drawCalls: await cvDrawCalls(page) });
      await page.screenshot({ path: `${CV_SHOT_DIR}/3d-rf-control-${size}.png` });
      await context.close();
    });
  }
});

/**
 * R5 P6 review poses at the round 5 sizes, for before/after captures:
 * `SHOT_DIR=screenshots/before` on main, `SHOT_DIR=screenshots/after` on the branch.
 * l1-plaza and l3-arrival are diff-gated (must not change); topbar, profile (the floor chip on phones)
 * and l1-about are the intended changes (icon, photo badge, hall portrait) for owner review.
 */
const P6_VIEWPORTS: readonly Viewport[] = [VIEWPORTS[0], { name: "desktop-qhd", width: 2560, height: 1440, tier: "full", touch: false }, VIEWPORTS[2]];
const p6Shot = (name: string, v: Viewport) => `${process.env.SHOT_DIR ?? "screenshots"}/p6/${name}-${v.width}x${v.height}.png`;
/** SwiftShader renders these sizes at about 1 fps on a busy machine: fewer frames per check, a longer budget. */
const SETTLE = { frames: 6, timeout: 300_000 };
const HIDE_HUD = "[data-testid='hud'], [data-testid^='ask-'] { display: none !important; }";

for (const viewport of P6_VIEWPORTS) {
  test(`P6 review poses @ ${viewport.width}x${viewport.height}`, async ({ browser }) => {
    test.setTimeout(1_800_000);
    const { context, page } = await open3D(browser, viewport);
    await waitForCameraSettle(page, SETTLE);
    await page.getByTestId("hud-topbar").screenshot({ path: p6Shot("topbar", viewport) });
    // Phones (Corners HUD) show the floor chip top left where desktops show the profile card.
    const profile = viewport.name === "mobile" ? page.getByTestId("floor-chip") : page.getByRole("region", { name: en.hud.profile });
    await profile.screenshot({ path: p6Shot(viewport.name === "mobile" ? "floor-chip" : "profile", viewport) });
    const hide = await page.addStyleTag({ content: HIDE_HUD });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: p6Shot("l1-plaza", viewport) });
    const about = stationOf("about");
    await driveTo(page, { x: about.pad.x - about.facing.x * 2.5, z: about.pad.z - about.facing.z * 2.5 }, SETTLE.timeout);
    await waitForCameraSettle(page, SETTLE);
    await page.waitForTimeout(2500);
    await page.screenshot({ path: p6Shot("l1-about", viewport) });
    await hide.evaluate((el) => (el as Element).remove());
    if (viewport.name === "mobile") await page.getByTestId("floor-chip").click();
    // The desktop elevator rail, or the phone's floor sheet (both are navigation landmarks named Elevator).
    await page.getByRole("navigation", { name: "Elevator" }).locator('[data-floor="L3"]').click();
    await waitForFloor(page, "L3", SETTLE.timeout);
    await waitForCameraSettle(page, SETTLE);
    await page.addStyleTag({ content: HIDE_HUD });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: p6Shot("l3-arrival", viewport) });
    await context.close();
  });
}

/**
 * Round 5 P8 (L3 consolidation). `r5-p8 L3 review`: owner review captures of L3 (arrival, the end of each
 * wing road looking east, the Product Engineering directory stop) with draw calls and triangles per pose.
 * The former `r5-p8 unchanged` gate (L1, L2, L4, RF must not change during P8) is retired: P8 shipped, its
 * baselines were local only (never committed, so it failed in CI by construction), and later rounds
 * changed those floors on purpose. Use `bun scripts/visual-gate.ts` for a before/after diff instead.
 * P8_PHASE=before|after picks the output folder under screenshots/r5-p8/.
 */
const P8_VIEWPORTS: readonly Viewport[] = [VIEWPORTS[0], { name: "desktop", width: 2560, height: 1440, tier: "full", touch: false }, VIEWPORTS[2]];
const P8_PHASE = process.env.P8_PHASE === "after" ? "after" : "before";
/** Per-wait budget: SwiftShader at 2560x1440 on the full tier is slow, more so on a busy machine. */
const P8_WAIT = 180_000;
const p8Shot = (name: string, v: Viewport) => `screenshots/r5-p8/${P8_PHASE}/${name}-${v.width}x${v.height}.png`;

async function p8Open(browser: Browser, v: Viewport, path: string, reducedMotion: "reduce" | "no-preference") {
  const context = await browser.newContext({
    viewport: { width: v.width, height: v.height },
    deviceScaleFactor: 1,
    hasTouch: v.touch,
    isMobile: v.name === "mobile",
    reducedMotion,
  });
  await chooseMotion(context, "system");
  const page = await context.newPage();
  await asReturningVisitor(page);
  await skipFloorLines(page);
  await page.goto(`${path}?tier=${v.tier}`);
  await waitForHQ(page);
  await waitForPhase(page, "explore");
  await waitForSceneLive(page);
  await page.evaluate(() => document.fonts.ready);
  await waitForCameraSettle(page, { timeout: P8_WAIT });
  await page.waitForTimeout(1500);
  return { context, page };
}

async function p8Metrics(page: Page, name: string, v: Viewport) {
  const { drawCalls, triangles } = await snapshot(page);
  const file = `screenshots/r5-p8/${P8_PHASE}/metrics.jsonl`;
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, `${JSON.stringify({ name, viewport: `${v.width}x${v.height}`, tier: v.tier, drawCalls, triangles })}\n`);
}

type RoadsWindow = Window & { __hq: { layouts: { L3: { road: { roads: { id: string; points: { x: number; z: number }[] }[] } } } } };

/** Drives along a wing road to 14 u before its turn (the second to last point; the last enters the reactor ring), then turns the camera to look east at the road end (reset, then three 45 degree steps left). */
async function p8WingEnd(page: Page, wing: "software" | "ai") {
  const end = await page.evaluate((id) => (window as unknown as RoadsWindow).__hq.layouts.L3.road.roads.find((r) => r.id === id)!.points.at(-2)!, wing);
  await driveTo(page, { x: end.x - 14, z: end.z }, P8_WAIT);
  await page.getByRole("button", { name: en.hud.view.reset }).click();
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: en.hud.view.rotateLeft }).click();
  await waitForCameraSettle(page, { timeout: P8_WAIT });
  await page.waitForTimeout(1000);
}

for (const v of P8_VIEWPORTS) {
  test(`r5-p8 L3 review @ ${v.width}x${v.height}`, async ({ browser }) => {
    test.setTimeout(P8_WAIT * 6);
    const { context, page } = await p8Open(browser, v, "/en/labs", "no-preference");
    await page.screenshot({ path: p8Shot("l3-arrival", v) });
    await p8Metrics(page, "l3-arrival", v);
    for (const wing of ["software", "ai"] as const) {
      await p8WingEnd(page, wing);
      await page.screenshot({ path: p8Shot(`l3-end-${wing}`, v) });
      await p8Metrics(page, `l3-end-${wing}`, v);
    }
    const board = (await interactablesOf(page)).find((i) => i.id === "L3:board:software")!;
    await driveTo(page, board.at, P8_WAIT);
    await waitForCameraSettle(page, { timeout: P8_WAIT });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: p8Shot("l3-board-software", v) });
    await p8Metrics(page, "l3-board-software", v);
    await context.close();
  });
}
