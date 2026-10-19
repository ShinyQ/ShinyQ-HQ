import AxeBuilder from "@axe-core/playwright";
import { writeFileSync } from "node:fs";
import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";
import en from "../messages/en.json";
import { asReturningVisitor, skipFloorLines, snapshot, waitForFloor, waitForHQ, waitForPhase, waitForRoverMove, waitForSceneLive, fastAnimations } from "./hq";

// Rides, drives, camera eases and the intro at the test-only animation speed (render-peak windows measure at real speed).
test.beforeEach(({ context }) => fastAnimations(context));

/**
 * Corners HUD (Round 8 I): phones and tablets show the floor chip top left, Ask AI and the menu top
 * right with the minimap under them, the joystick (double tap: boost) bottom left and one reset button
 * bottom right. Everything else (Classic site, search, the Rover menu, rotation, the map and every setting)
 * is two taps away in the menu sheet, and floors in the floor sheet. Desktops keep the top bar and the
 * elevator rail, with the minimap above the settings gear and the view controls.
 */
test.describe.configure({ timeout: 150_000 });

type Box = { x: number; y: number; width: number; height: number };
type Viewport = { name: string; width: number; height: number; touch: boolean };
const box = async (locator: Locator): Promise<Box> => (await locator.boundingBox())!;

const PHONE = { name: "phone", width: 390, height: 844, touch: true } as const;
const TABLET = { name: "tablet", width: 834, height: 1194, touch: true } as const;
const DESKTOP = { name: "desktop", width: 1440, height: 900, touch: false } as const;

const VIEWPORTS = [
  { ...PHONE, max: 5 },
  { ...TABLET, max: 9 },
  { name: "tablet-landscape", width: 1194, height: 834, touch: true, max: 9 },
] as const;

/** Ask the HQ enabled (the pill shows), the teaser already seen. */
async function mockAsk(page: Page) {
  await page.route("**/api/ask", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ enabled: true, turnstileSiteKey: null, asOf: "2026-10-11", maxLength: 300 }) }),
  );
  await page.addInitScript(() => sessionStorage.setItem("hq:ask-teaser", "1"));
}

/** A returning visitor with no floor lines on `path` (lite tier), once the scene handles input. */
async function openHQ(browser: Browser, vp: Viewport, path = "/en") {
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: vp.touch, isMobile: vp.touch, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await mockAsk(page);
  await asReturningVisitor(page);
  await skipFloorLines(page);
  await page.goto(`${path}?tier=lite`);
  await waitForHQ(page);
  await waitForPhase(page, "explore");
  await waitForSceneLive(page);
  return { context, page };
}

/**
 * Visible, enabled controls in the HUD (buttons, links, inputs, the joystick), minus the minimap, dialogs and the
 * Agent Office chips (world labels over the L1 Rovers, shown only at the office stop; not Corners controls).
 */
async function visibleControls(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const hud = document.querySelector("[data-testid='hud']");
    if (!hud) return [];
    const nodes = [...hud.querySelectorAll<HTMLElement>("button, a[href], input, [data-testid='joystick']")];
    return nodes
      .filter((el) => !el.closest("[data-testid='minimap'], [role='dialog'], [data-testid='office-chips']"))
      .filter((el) => !(el as HTMLButtonElement).disabled)
      .filter((el) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && r.bottom > 0 && r.top < innerHeight;
      })
      .map((el) => el.getAttribute("data-testid") ?? el.getAttribute("aria-label") ?? el.textContent?.trim() ?? el.tagName);
  });
}

async function expectNoSeriousViolations(page: Page, selector: string) {
  const results = await new AxeBuilder({ page }).include(selector).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

const hudControl = (page: Page, id: string) => page.getByTestId("hud").getByTestId(id);

test.describe("Corners control counts", () => {
  for (const vp of VIEWPORTS) {
    test(`${vp.name} ${vp.width}x${vp.height}: at most ${vp.max} controls, the Corners set and no desktop rail`, async ({ browser }) => {
      const { context, page } = await openHQ(browser, vp);
      await expect(page.locator("html")).toHaveAttribute("data-hq-hud", vp.name === "phone" ? "phone" : "tablet");
      for (const id of ["floor-chip", "hud-menu", "minimap", "joystick", "view-reset"]) await expect(hudControl(page, id), id).toBeVisible();
      await expect(hudControl(page, "ask-pill")).toBeVisible({ timeout: 15_000 });
      for (const id of ["elevator-panel", "boost", "page-view"]) await expect(page.getByTestId("hud").getByTestId(id), id).toBeHidden();

      const controls = await visibleControls(page);
      const file = test.info().outputPath(`controls-${vp.name}.json`);
      writeFileSync(file, JSON.stringify({ viewport: `${vp.width}x${vp.height}`, count: controls.length, max: vp.max, controls }, null, 2));
      await test.info().attach(`controls-${vp.name}`, { path: file, contentType: "application/json" });
      await test.info().attach(`hud-${vp.name}`, { body: await page.screenshot(), contentType: "image/png" });
      expect(controls.length, controls.join(", ")).toBeLessThanOrEqual(vp.max);
      await context.close();
    });
  }
});

test.describe("Corners menu and floor sheet on a phone", () => {
  test("two taps reach every action, every setting and every floor; a floor pick closes the sheet and rides", async ({ browser }) => {
    const { context, page } = await openHQ(browser, PHONE);
    await hudControl(page, "hud-menu").tap();
    const sheet = page.getByTestId("menu-sheet");
    await expect(sheet).toBeVisible();
    await expect(sheet.getByTestId("menu-profile")).toBeVisible();
    const actions = sheet.getByTestId("menu-actions");
    for (const name of [en.hud.pageView, en.hud.launcher.search, en.hud.launcher.roverMenu, en.hud.view.rotateLeft, en.hud.view.rotateRight, en.hud.map.open]) {
      await expect(actions.getByRole("button", { name, exact: true }), name).toBeVisible();
    }
    for (const id of ["language", "open-links", "replay-tutorial", "hints", "motion", "quality", "day-night", "minimap", "sound", "effects", "music", "ambience", "music-volume"]) {
      const row = sheet.getByTestId(`setting-${id}`);
      await row.scrollIntoViewIfNeeded();
      await expect(row, id).toBeInViewport();
    }
    const hints = sheet.getByTestId("setting-hints").getByRole("switch", { name: en.hud.settings.hints.label });
    await expect(hints).not.toBeChecked();
    await hints.tap();
    await expect(hints).toBeChecked();
    await hints.tap();
    await expect(hints).not.toBeChecked();
    expect(await page.evaluate(() => localStorage.getItem("hq:hints"))).toBe("off");
    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0);
    await expect(hudControl(page, "hud-menu")).toBeFocused();

    await hudControl(page, "floor-chip").tap();
    const floors = page.getByTestId("floor-sheet");
    await expect(floors).toBeVisible();
    await expect(floors.locator("[data-floor]")).toHaveCount(6);
    await expect(floors.locator('[data-floor="B1"]')).toHaveAttribute("aria-disabled", "true");
    await expect(floors.locator('[data-floor="B1"]')).toHaveAccessibleName(/^B1 /);
    await floors.locator('[data-floor="B1"]').scrollIntoViewIfNeeded();
    for (const floor of ["RF", "L4", "L3", "L2", "L1", "B1"]) await expect(floors.locator(`[data-floor="${floor}"]`), floor).toBeInViewport();
    await floors.locator('[data-floor="L2"]').tap();
    await expect(floors).toHaveCount(0);
    await waitForFloor(page, "L2");
    await expect(hudControl(page, "floor-chip")).toContainText("L2");
    await context.close();
  });

  test("Classic site in the menu opens the Page View with Back to 3D", async ({ browser }) => {
    const { context, page } = await openHQ(browser, PHONE);
    await hudControl(page, "hud-menu").tap();
    await page.getByTestId("menu-sheet").getByTestId("page-view").tap();
    await expect(page.getByTestId("back-to-3d")).toBeVisible({ timeout: 30_000 });
    await context.close();
  });

  test("axe: the menu sheet and the floor sheet have no serious or critical violations", async ({ browser }) => {
    const { context, page } = await openHQ(browser, PHONE);
    await hudControl(page, "hud-menu").tap();
    await expect(page.getByTestId("menu-sheet")).toBeVisible();
    await expectNoSeriousViolations(page, "[data-testid='menu-sheet']");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("menu-sheet")).toHaveCount(0);
    await hudControl(page, "floor-chip").tap();
    await expect(page.getByTestId("floor-sheet")).toBeVisible();
    await expectNoSeriousViolations(page, "[data-testid='floor-sheet']");
    await context.close();
  });
});

test.describe("minimap overview", () => {
  test("phone: the minimap opens the overview; a place drives there and closes it", async ({ browser }) => {
    const { context, page } = await openHQ(browser, PHONE);
    await hudControl(page, "minimap").tap();
    const overview = page.getByTestId("map-overview");
    await expect(overview).toBeVisible();
    const rooms = overview.getByTestId("map-room");
    expect(await rooms.count()).toBeGreaterThanOrEqual(3);
    const from = (await snapshot(page)).rover;
    const room = overview.locator("[data-testid='map-room'][data-room]").first();
    await room.scrollIntoViewIfNeeded();
    await room.tap();
    await expect(overview).toHaveCount(0);
    await waitForRoverMove(page, from, 0.5);
    await context.close();
  });

  for (const vp of [PHONE, TABLET]) {
    for (const { floor, path } of [
      { floor: "L1", path: "/en" },
      { floor: "L3", path: "/en/labs" },
    ]) {
      test(`${vp.name} portrait, ${floor}: the overview map is drawn large enough to read`, async ({ browser }) => {
        const { context, page } = await openHQ(browser, vp, path);
        await expect(hudControl(page, "minimap")).toHaveAttribute("data-floor", floor);
        await hudControl(page, "minimap").tap();
        const svg = page.getByTestId("map-overview-svg");
        await expect(svg).toBeVisible();
        await expect.poll(async () => (await box(svg)).height).toBeGreaterThan(120);
        await test.info().attach(`overview-${vp.name}-${floor}`, { body: await page.screenshot(), contentType: "image/png" });
        await context.close();
      });
    }
  }
});

test.describe("settings persist and apply", () => {
  test("phone: Minimap off survives a reload, Motion Reduced applies at once, Music off is stored", async ({ browser }) => {
    const { context, page } = await openHQ(browser, PHONE);
    const sheet = page.getByTestId("menu-sheet");
    await hudControl(page, "hud-menu").tap();
    const minimap = sheet.getByTestId("setting-minimap").getByRole("switch", { name: en.hud.settings.minimap.label });
    await minimap.scrollIntoViewIfNeeded();
    await expect(minimap).toHaveAttribute("aria-checked", "true");
    await minimap.tap();
    await expect(minimap).toHaveAttribute("aria-checked", "false");
    expect(await page.evaluate(() => localStorage.getItem("hq:minimap"))).toBe("off");

    const motion = sheet.getByTestId("setting-motion");
    await motion.scrollIntoViewIfNeeded();
    await motion.getByText(en.hud.settings.motion.reduced, { exact: true }).tap();
    await expect(page.locator("html")).toHaveAttribute("data-motion", "reduced");

    const music = sheet.getByTestId("setting-music").getByRole("switch", { name: en.hud.settings.music.label });
    await music.scrollIntoViewIfNeeded();
    await expect(music).toHaveAttribute("aria-checked", "true");
    await music.tap();
    await expect(music).toHaveAttribute("aria-checked", "false");
    expect(await page.evaluate(() => localStorage.getItem("hq:music"))).toBe("off");

    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0);
    await expect(hudControl(page, "minimap")).toHaveCount(0);

    await page.reload();
    await waitForHQ(page);
    await waitForPhase(page, "explore");
    await waitForSceneLive(page);
    await expect(hudControl(page, "floor-chip")).toBeVisible();
    await expect(hudControl(page, "minimap")).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem("hq:minimap"))).toBe("off");
    await expect(page.locator("html")).toHaveAttribute("data-motion", "reduced");
    await context.close();
  });
});

test.describe("desktop corner", () => {
  test("1440x900: the top bar and elevator rail stay, the minimap sits above the view controls; N and comma open the overview and settings", async ({ browser }) => {
    const { context, page } = await openHQ(browser, DESKTOP);
    await expect(page.locator("html")).toHaveAttribute("data-hq-hud", "desktop");
    await expect(page.getByTestId("hud-topbar").getByTestId("page-view")).toBeVisible();
    await expect(hudControl(page, "elevator-panel")).toBeVisible();
    await expect(hudControl(page, "floor-chip")).toHaveCount(0);
    await expect(hudControl(page, "hud-menu")).toHaveCount(0);

    const minimap = await box(hudControl(page, "minimap"));
    const view = await box(hudControl(page, "view-controls"));
    // Bottom right, stacked: the minimap ends above the view controls and hugs the right edge like them.
    expect(minimap.y + minimap.height).toBeLessThanOrEqual(view.y);
    expect(minimap.x + minimap.width).toBeGreaterThan(DESKTOP.width - 48);
    expect(minimap.y).toBeGreaterThan(DESKTOP.height / 2);

    await page.keyboard.press(",");
    const settings = page.getByTestId("settings-sheet");
    await expect(settings).toBeVisible();
    await expect(settings.getByTestId("settings-panel")).toBeVisible();
    await expectNoSeriousViolations(page, "[data-testid='settings-sheet']");
    await page.keyboard.press("Escape");
    await expect(settings).toHaveCount(0);

    await page.keyboard.press("n");
    const overview = page.getByTestId("map-overview");
    await expect(overview).toBeVisible();
    await expect(overview.getByTestId("map-overview-svg")).toBeVisible();
    await expectNoSeriousViolations(page, "[data-testid='map-overview']");
    await page.keyboard.press("Escape");
    await expect(overview).toHaveCount(0);
    await context.close();
  });
});
