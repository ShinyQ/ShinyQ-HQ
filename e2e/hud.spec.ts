import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";
import en from "../messages/en.json";
import id from "../messages/id.json";
import { asReturningVisitor, enterHQ, skipFloorLines, waitForHQ, waitForPhase, waitForRoom, waitForSceneLive, fastAnimations } from "./hq";

// Rides, drives, camera eases and the intro at the test-only animation speed (render-peak windows measure at real speed).
test.beforeEach(({ context }) => fastAnimations(context));

/**
 * 3D HUD layout (owner round R3-B, Corners in Round 8 I): the desktop top bar (no Quick view, a
 * highlighted Classic site with Ask AI on its right), the Corners top corners on phones and tablets,
 * the bottom band (the hint at the bottom, clear of the joystick, the reset button and Ask AI) and the
 * room drawer footer (cross-floor link right of the primary action).
 */
test.describe.configure({ timeout: 150_000 });

type Box = { x: number; y: number; width: number; height: number };
const box = async (locator: Locator): Promise<Box> => (await locator.boundingBox())!;
const overlaps = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** Ask the HQ enabled (the pill only shows then), teaser already seen. */
async function mockAsk(page: Page) {
  await page.route("**/api/ask", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ enabled: true, turnstileSiteKey: null, asOf: "2026-10-11", maxLength: 300 }) }),
  );
  await page.addInitScript(() => sessionStorage.setItem("hq:ask-teaser", "1"));
}

async function newPage(browser: Browser, vp: { width: number; height: number; touch: boolean }) {
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: vp.touch, isMobile: vp.touch, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await mockAsk(page);
  return { context, page };
}

const DESKTOP = { name: "desktop", width: 1440, height: 900, touch: false } as const;
const CORNERS = [
  { name: "tablet", width: 834, height: 1112, touch: true },
  { name: "phone", width: 390, height: 844, touch: true },
] as const;

test.describe("3D top bar", () => {
  for (const vp of [DESKTOP]) {
    test(`${vp.name}: no Quick view, a highlighted Classic site and Ask AI on its right`, async ({ browser }) => {
      const { context, page } = await newPage(browser, vp);
      await enterHQ(page);
      const hud = page.getByTestId("hud");
      await expect(hud.getByRole("link", { name: "Quick view" })).toHaveCount(0);
      await expect(hud.getByRole("button", { name: en.hud.launcher.roverMenu, exact: true })).toBeVisible();
      const pageView = hud.getByTestId("page-view");
      const ask = hud.locator("[data-testid='ask-pill']:visible");
      await expect(pageView).toBeVisible();
      await expect(ask).toBeVisible({ timeout: 15_000 });
      expect(await pageView.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(34, 211, 238)");
      const p = await box(pageView);
      const a = await box(ask);
      // The icon sits at the left of the label, inside the button.
      const icon = await box(pageView.getByTestId("page-view-icon"));
      expect(icon.x).toBeGreaterThanOrEqual(p.x);
      expect(icon.x + icon.width).toBeLessThan(p.x + p.width / 2);
      await expect(pageView).toHaveAccessibleName(en.hud.pageView);
      await page.getByTestId("hud-topbar").screenshot({ path: test.info().outputPath(`topbar-${vp.name}.png`) });
      expect(a.x).toBeGreaterThanOrEqual(p.x + p.width);
      expect(Math.abs(a.y + a.height / 2 - (p.y + p.height / 2))).toBeLessThan(4);
      // Ask AI is the last control on the right edge.
      expect(vp.width - (a.x + a.width)).toBeLessThanOrEqual(24);
      await context.close();
    });
  }

  for (const vp of CORNERS) {
    test(`${vp.name}: Corners puts the floor chip top left, Ask AI and the menu top right`, async ({ browser }) => {
      const { context, page } = await newPage(browser, vp);
      await enterHQ(page);
      const hud = page.getByTestId("hud");
      await expect(hud.getByRole("link", { name: "Quick view" })).toHaveCount(0);
      await expect(hud.getByTestId("page-view")).toHaveCount(0);
      const chipLocator = hud.getByTestId("floor-chip");
      const askLocator = hud.getByTestId("ask-pill");
      const menuLocator = hud.getByTestId("hud-menu");
      await expect(chipLocator).toBeVisible();
      await expect(menuLocator).toBeVisible();
      await expect(askLocator).toBeVisible({ timeout: 15_000 });
      const chip = await box(chipLocator);
      const ask = await box(askLocator);
      const menu = await box(menuLocator);
      await page.getByTestId("hud-topbar").screenshot({ path: test.info().outputPath(`topbar-${vp.name}.png`) });
      // Within 24 px of the top and the side edges.
      expect(chip.x).toBeLessThanOrEqual(24);
      expect(chip.y).toBeLessThanOrEqual(24);
      expect(vp.width - (menu.x + menu.width)).toBeLessThanOrEqual(24);
      expect(menu.y).toBeLessThanOrEqual(24);
      // Ask AI left of the menu, on the same row, and clear of the chip.
      expect(ask.x + ask.width).toBeLessThanOrEqual(menu.x);
      expect(ask.x).toBeGreaterThanOrEqual(chip.x + chip.width);
      expect(Math.abs(ask.y + ask.height / 2 - (menu.y + menu.height / 2))).toBeLessThan(4);
      expect(overlaps(chip, ask)).toBe(false);
      await context.close();
    });
  }
});

/**
 * The search chip reads "⌘K" on Apple platforms and "Ctrl K" elsewhere (about 30 px wider), so the
 * platform is forced here instead of depending on the runner OS. Indonesian has the widest labels.
 */
const PLATFORMS = [
  { name: "Mac", platform: "MacIntel", chip: "⌘K" },
  { name: "Windows and Linux", platform: "Win32", chip: "Ctrl K" },
] as const;
const LOCALES = [
  { locale: "en", messages: en },
  { locale: "id", messages: id },
] as const;

test.describe("one-row top bar at 1024 px", () => {
  for (const os of PLATFORMS) {
    for (const { locale, messages } of LOCALES) {
      test(`${locale} on ${os.name}: the bar stays clear of the profile card`, async ({ browser }) => {
        const { context, page } = await newPage(browser, { width: 1024, height: 768, touch: false });
        await page.addInitScript((platform) => Object.defineProperty(Navigator.prototype, "platform", { get: () => platform, configurable: true }), os.platform);
        await enterHQ(page, { path: `/${locale}` });
        const hud = page.getByTestId("hud");
        await expect(hud.getByTestId("page-view")).toHaveAccessibleName(messages.hud.pageView);
        const search = hud.getByRole("button", { name: messages.hud.launcher.searchShortcut.replace("{shortcut}", os.chip) });
        await expect(search).toBeVisible();
        // The bar settles once fonts, the Ask pill and the profile photo have loaded: poll instead of measuring the first layout.
        await expect(hud.locator("[data-testid='ask-pill']:visible")).toBeVisible({ timeout: 15_000 });
        const measure = async () => ({ bar: await box(hud.getByTestId("hud-topbar")), card: await box(hud.getByRole("region", { name: messages.hud.profile })) });
        await expect.poll(async () => {
          const { bar, card } = await measure();
          return overlaps(bar, card);
        }).toBe(false);
        const { bar } = await measure();
        expect(bar.x + bar.width).toBeLessThanOrEqual(1024);
        // The chip shows on Apple platforms; "Ctrl K" hides at this width, the search button stays.
        await expect(search.locator("kbd")).toBeVisible({ visible: os.chip === "⌘K" });
        await context.close();
      });
    }
  }
});

test.describe("profile photo badge", () => {
  for (const vp of [DESKTOP, CORNERS[1]]) {
    test(`${vp.name}: the ${vp.touch ? "menu sheet" : "profile card"} shows the owner's round photo`, async ({ browser }) => {
      const { context, page } = await newPage(browser, vp);
      await enterHQ(page);
      // Corners has no profile card: the photo sits in the menu sheet's profile block.
      if (vp.touch) {
        await expect(page.getByTestId("hud").getByTestId("profile-photo")).toHaveCount(0);
        await page.getByTestId("hud").getByTestId("hud-menu").click();
      }
      const scope = vp.touch ? page.getByTestId("menu-sheet").getByTestId("menu-profile") : page.getByTestId("hud");
      const img = scope.getByTestId("profile-photo").locator("img");
      await expect(img).toBeVisible();
      await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
      const b = await box(img);
      expect(Math.abs(b.width - b.height)).toBeLessThan(1);
      expect(await img.evaluate((el) => getComputedStyle(el).borderRadius)).not.toBe("0px");
      await context.close();
    });
  }
});

test.describe("bottom band", () => {
  for (const vp of CORNERS) {
    test(`${vp.name}: the Boost button sits by the joystick; the hint ${vp.name === "phone" ? "is not shown" : "sits at the bottom, clear of the controls"}`, async ({ browser }) => {
      const { context, page } = await newPage(browser, vp);
      await asReturningVisitor(page);
      await skipFloorLines(page);
      await page.goto("/en/labs?tier=lite");
      await waitForHQ(page);
      await waitForPhase(page, "explore");
      await waitForSceneLive(page);
      const ask = page.locator("[data-testid='ask-pill']:visible");
      await expect(ask).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId("view-reset")).toBeVisible();
      await expect(page.getByTestId("boost")).toBeVisible();

      const controls = {
        joystick: await box(page.getByTestId("joystick")),
        boost: await box(page.getByTestId("boost")),
        reset: await box(page.getByTestId("view-reset")),
        ask: await box(ask),
      };
      for (const [a, b] of [["joystick", "boost"], ["joystick", "reset"], ["boost", "reset"]] as const) expect(overlaps(controls[a], controls[b]), `${a} x ${b}`).toBe(false);
      // Owner decision 2026-10-24: phones show no controls bar (the menu's Controls card has the list).
      if (vp.name === "phone") {
        await expect(page.getByTestId("hint")).toHaveCount(0);
        await context.close();
        return;
      }
      const hintLocator = page.getByTestId("hint");
      await expect(hintLocator).toBeVisible();
      const hint = await box(hintLocator);

      // At the bottom: the hint ends within 32 px of the viewport bottom (24 px band padding plus rounding).
      expect(vp.height - (hint.y + hint.height)).toBeLessThanOrEqual(32);
      expect(hint.x).toBeGreaterThanOrEqual(0);
      expect(hint.x + hint.width).toBeLessThanOrEqual(vp.width);
      for (const [name, control] of Object.entries(controls)) expect(overlaps(hint, control), `overlaps ${name}`).toBe(false);
      await context.close();
    });
  }
});

/**
 * No two HUD boxes overlap at common desktop, tablet and landscape phone sizes (owner fix 2026-10-21):
 * the desktop minimap once sat on the elevator rail's locked B1 row ("Visit all 5 floors") on short
 * screens. Desktops check the profile card, the top bar, the elevator rail, the minimap, the settings
 * gear and the view controls; Corners checks the floor chip, the top bar, the minimap, the joystick, the
 * Boost button and the reset button. Indonesian has the widest rail labels.
 */
const NO_OVERLAP_SIZES = [
  { width: 1024, height: 640, touch: false },
  { width: 1280, height: 720, touch: false },
  { width: 1366, height: 768, touch: false },
  { width: 1440, height: 900, touch: false },
  { width: 1920, height: 1080, touch: false },
  { width: 1180, height: 820, touch: true },
  { width: 820, height: 1180, touch: true },
  { width: 844, height: 390, touch: true },
] as const;
const DESKTOP_BOXES = ["hud-topbar", "elevator-panel", "minimap", "settings-open", "view-controls"] as const;
const CORNERS_BOXES = ["floor-chip", "hud-topbar", "minimap", "joystick", "boost", "view-controls"] as const;

/** Every pair that overlaps, plus any box that leaves the viewport. */
function clashes(all: Record<string, Box>, vp: { width: number; height: number }) {
  const names = Object.keys(all);
  const found: string[] = [];
  for (const [i, a] of names.entries()) {
    const b = all[a];
    if (b.x < 0 || b.y < 0 || b.x + b.width > vp.width + 0.5 || b.y + b.height > vp.height + 0.5) found.push(`${a} off screen`);
    for (const c of names.slice(i + 1)) if (overlaps(b, all[c])) found.push(`${a} x ${c}`);
  }
  return found;
}

test.describe("HUD boxes never overlap", () => {
  for (const { locale, messages } of LOCALES) {
    for (const vp of NO_OVERLAP_SIZES) {
      test(`${locale} ${vp.width}x${vp.height}${vp.touch ? " touch" : ""}`, async ({ browser }) => {
        const { context, page } = await newPage(browser, vp);
        await enterHQ(page, { path: `/${locale}` });
        const hud = page.getByTestId("hud");
        await expect(hud.locator("[data-testid='ask-pill']:visible")).toBeVisible({ timeout: 15_000 });
        const desktop = (await page.evaluate(() => document.documentElement.dataset.hqHud)) === "desktop";
        const all: Record<string, Box> = {};
        for (const id of desktop ? DESKTOP_BOXES : CORNERS_BOXES) {
          const locator = hud.getByTestId(id).first();
          await expect(locator, id).toBeVisible();
          all[id] = await box(locator);
        }
        if (desktop) {
          // The locked B1 row carries the widest label ("Visit all 5 floors (0/5)"), the case the owner saw.
          await expect(hud.getByTestId("elevator-panel").locator("[data-floor='B1'][data-locked]")).toBeVisible();
          all.profile = await box(hud.getByRole("region", { name: messages.hud.profile }));
        }
        await page.screenshot({ path: test.info().outputPath(`hud-${locale}-${vp.width}x${vp.height}.png`) });
        expect(clashes(all, vp), JSON.stringify(all)).toEqual([]);
        await context.close();
      });
    }
  }
});

const DRAWER = [
  { name: "desktop", width: 1440, height: 900, touch: false },
  { name: "phone", width: 390, height: 844, touch: true },
] as const;
const CROSS_LINKS = [
  { path: "/en/journey/jenius-2024", room: "L2:jenius-2024", primary: en.drawer.openPage, link: en.drawer.seeOnL3 },
  { path: "/en/labs/digital-banking-integrations", room: "L3:digital-banking-integrations", primary: en.common.caseStudy, link: en.drawer.seeOnL2 },
] as const;

test.describe("room drawer footer", () => {
  for (const vp of DRAWER) {
    for (const target of CROSS_LINKS) {
      test(`${vp.name}: ${target.room} shows the cross-floor link right of the primary action`, async ({ browser }) => {
        const { context, page } = await newPage(browser, vp);
        // A room deep link opens the drawer at once (phase room, never explore), so no enterFloorRoute.
        await asReturningVisitor(page);
        await page.goto(`${target.path}?tier=lite`);
        await waitForHQ(page);
        await waitForRoom(page, target.room);
        const drawer = page.getByTestId("room-drawer");
        const footer = drawer.getByTestId("drawer-footer");
        const primary = footer.getByRole("link", { name: target.primary });
        const cross = footer.getByRole("button", { name: target.link });
        await expect(primary).toBeVisible();
        await expect(cross).toBeVisible();
        await expect(drawer.getByTestId("drawer-body").getByRole("button", { name: target.link })).toHaveCount(0);
        const p = await box(primary);
        const c = await box(cross);
        const f = await box(footer);
        const sameRow = Math.abs(p.y - c.y) < 4;
        if (vp.name === "desktop") expect(sameRow).toBe(true);
        // Right of the primary action, or wrapped onto the next row on narrow phones; never outside the footer.
        expect(sameRow ? c.x >= p.x + p.width : c.y >= p.y + p.height).toBe(true);
        expect(c.x + c.width).toBeLessThanOrEqual(f.x + f.width + 0.5);
        await context.close();
      });
    }
  }
});
