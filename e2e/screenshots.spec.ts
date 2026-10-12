import { expect, test, type Browser, type Page } from "@playwright/test";
import { asReturningVisitor, driveTo, emptyFloorPoint, hoverTarget, interactablesOf, padsOf, PHONE_SAFE, targetPoint, visibleTarget, waitForHQ, waitForPhase, waitForRoom } from "./hq";
import en from "../messages/en.json";
import { heroPod } from "./routes";

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

/** Opens a room through the command palette (drive and open), like a visitor would. */
async function openRoomFromPalette(page: Page, query: string, room: string) {
  await page.getByRole("button", { name: /Open search/ }).click();
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

  test(`page view with Back to 3D @ ${viewport.width}x${viewport.height}`, async ({ browser }) => {
    const { context, page } = await open3D(browser, viewport);
    await page.getByRole("button", { name: "Page view" }).click();
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

/** L4 Writing: the floor with the first-visit prompt, the first stop of "Read my writing" and the Research drawer. */
for (const viewport of L4_VIEWPORTS) {
  test(`3D hq-l4 @ ${viewport.width}x${viewport.height}`, async ({ browser }) => {
    test.setTimeout(300_000);
    const { context, page } = await open3DAt(browser, viewport, "/en/library");
    // In-world text (troika) builds its glyphs slowly on SwiftShader.
    await page.waitForTimeout(8000);
    const prompt = page.getByTestId("dialog-choices");
    await expect(prompt).toBeVisible();
    await page.screenshot({ path: shot("hq-l4-writing", viewport) });
    await prompt.getByRole("button", { name: "Read my writing" }).click();
    await expect(page.getByTestId("walk-bar")).toHaveAttribute("data-status", "arrived", { timeout: 120_000 });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: shot("hq-l4-walk", viewport) });
    await page.getByTestId("walk-bar").getByRole("button", { name: "End walk" }).first().click();
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
      await tab.getByRole("button", { name: /Open search/ }).click();
      await tab.keyboard.type("azure");
    },
  },
];

for (const viewport of VIEWPORTS) {
  for (const overlay of OVERLAYS) {
    test(`${overlay.name} @ ${viewport.width}x${viewport.height}`, async ({ browser }) => {
      const context = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: "reduce" });
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

const FLOOR_THUMBS = [
  { id: "L1", path: "/en" },
  { id: "L2", path: "/en/journey" },
  { id: "L3", path: "/en/labs" },
  { id: "L4", path: "/en/library" },
  { id: "RF", path: "/en/contact" },
] as const;

/** Elevator picker thumbnails: each floor from its start spot with the HUD hidden (`bun run floor:thumbs` converts them to public/floors/*.webp). */
for (const floor of FLOOR_THUMBS) {
  test(`floor thumbnail ${floor.id}`, async ({ browser }) => {
    test.setTimeout(180_000);
    const context = await browser.newContext({ viewport: { width: 640, height: 360 }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    await asReturningVisitor(page);
    await page.goto(`${floor.path}?tier=full&walk=off`);
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
      await page.goto("/en/labs?tier=lite&walk=on");
      await waitForHQ(page);
      await waitForPhase(page, "explore");
      await page.getByTestId("dialog-choices").getByRole("button", { name: "Explore freely" }).click();
      await expect(page.getByTestId("walk-launcher")).toBeVisible();
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
    await page.goto("/en/labs?tier=full&walk=off");
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
    await page.goto("/en/labs?tier=lite&walk=off");
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
