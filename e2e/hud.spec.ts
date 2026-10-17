import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";
import en from "../messages/en.json";
import id from "../messages/id.json";
import { asReturningVisitor, enterHQ, skipFloorLines, waitForHQ, waitForPhase, waitForRoom, waitForSceneLive } from "./hq";

/**
 * 3D HUD layout (owner round R3-B, Corners in Round 8 I): the desktop top bar (no Quick view, a
 * highlighted Classic site with Ask AI on its right), the Corners top corners on phones and tablets,
 * the bottom band (the hint at the bottom, clear of the joystick, the reset button and Ask AI) and the
 * room drawer footer (cross-floor link right of the primary action).
 */
test.describe.configure({ timeout: 150_000 });

type RoomWindow = { __hq: { store: { getState: () => { openRoom: (room: string) => void; closeRoom: () => void } } } };
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
      await expect(hud.getByRole("button", { name: "Ask Rover", exact: true })).toBeVisible();
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
    test(`${vp.name}: the hint sits at the bottom, clear of the joystick, the reset button and Ask AI`, async ({ browser }) => {
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
      await expect(page.getByTestId("boost")).toHaveCount(0);

      const controls = {
        joystick: await box(page.getByTestId("joystick")),
        reset: await box(page.getByTestId("view-reset")),
        ask: await box(ask),
      };
      // The hint auto-hides on phones 6 s after it mounts; a room opened and closed mounts it again.
      await page.evaluate(() => (window as unknown as RoomWindow).__hq.store.getState().openRoom("L3:reactor"));
      await waitForPhase(page, "room");
      await page.evaluate(() => (window as unknown as RoomWindow).__hq.store.getState().closeRoom());
      await waitForPhase(page, "explore");
      const hintLocator = page.getByTestId("hint");
      await expect(hintLocator).toBeVisible();
      const hint = await box(hintLocator);

      // At the bottom: the hint ends within 32 px of the viewport bottom (24 px band padding plus rounding).
      expect(vp.height - (hint.y + hint.height)).toBeLessThanOrEqual(32);
      expect(hint.x).toBeGreaterThanOrEqual(0);
      expect(hint.x + hint.width).toBeLessThanOrEqual(vp.width);
      for (const [name, control] of Object.entries(controls)) expect(overlaps(hint, control), `overlaps ${name}`).toBe(false);
      expect(overlaps(controls.joystick, controls.reset)).toBe(false);
      await context.close();
    });
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
