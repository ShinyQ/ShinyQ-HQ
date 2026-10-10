import { expect, test, type Browser, type Page } from "@playwright/test";
import { asReturningVisitor, waitForHQ, waitForPhase, waitForRoom } from "./hq";
import { heroPod } from "./routes";

/** Opt-in (SCREENSHOTS=1): captures PR screenshots into screenshots/. WebGL runs on SwiftShader. */
const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900, tier: "full", touch: false },
  { name: "tablet", width: 1024, height: 1366, tier: "full", touch: true },
  { name: "mobile", width: 390, height: 844, tier: "lite", touch: true },
] as const;

type Viewport = (typeof VIEWPORTS)[number];

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
  await page.getByRole("button", { name: /Skip intro/ }).click();
  await waitForPhase(page, "explore");
  await page.evaluate(() => document.fonts.ready);
  return { context, page };
}

/** Deep links a floor route (no intro). */
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
  { name: "hq-l4-library", path: "/en/library" },
  { name: "hq-rf-roof", path: "/en/contact" },
  { name: "hq-l4-post", path: "/en/library", query: "The Sun, The Moon", room: "L4:the-sun-the-moon-and-the-dark-sea" },
  { name: "hq-rf-comms", path: "/en/contact", query: "Comms terminals", room: "RF:contact" },
  { name: "hq-l4-research", path: "/en/library", query: "Research shelf", room: "L4:research" },
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
      await tab.addInitScript(() => localStorage.setItem("hq:terminal-seen", "1"));
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
    if (viewport.name === "mobile") await page.getByRole("button", { name: "Menu" }).click();
    await page.getByRole("button", { name: "Page view" }).click();
    await expect(page.getByRole("button", { name: "Back to 3D" })).toBeInViewport({ timeout: 30_000 });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: shot("page-view", viewport) });
    await context.close();
  });
}

type HQState = { __hq: { store: { getState: () => { phase: string; rover: { x: number } } } } };

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

/** L2 Career Archive: corridor on the rail camera, a career room's drawer, and the Workshop annex. */
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
    // From the 2026 room on the north side, east along z = -5 into the annex (its door zone opens the Workshop).
    const { context, page } = await openL2(browser, viewport, "/en/journey/metrodata-2026", "room");
    await page.keyboard.press("Escape");
    await waitForPhase(page, "explore");
    await page.keyboard.down("d");
    await roverPast(page, 100);
    await page.keyboard.up("d");
    await page.waitForTimeout(5000);
    await page.screenshot({ path: shot("hq-l2-annex", viewport) });
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
  { name: "terminal", open: (tab: Page) => tab.getByRole("button", { name: "Missions" }).click() },
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
      await tab.addInitScript(() => localStorage.setItem("hq:terminal-seen", "1"));
      await tab.goto("/en?tier=static", { waitUntil: "networkidle" });
      await tab.evaluate(() => document.fonts.ready);
      await overlay.open(tab);
      await expect(tab.getByRole("dialog")).toBeVisible();
      await tab.screenshot({ path: shot(overlay.name, viewport), fullPage: false });
      await context.close();
    });
  }
}
