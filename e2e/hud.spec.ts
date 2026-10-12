import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";
import en from "../messages/en.json";
import { asReturningVisitor, enterHQ, waitForHQ, waitForPhase, waitForRoom, waitForSceneLive } from "./hq";

/**
 * 3D HUD layout (owner round R3-B): the top bar (no Quick view, a highlighted Page view with Ask AI
 * on its right), the bottom band (hint and walk pill at the bottom, clear of the joystick, boost and
 * view controls) and the room drawer footer (cross-floor link right of the primary action).
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

const TOP_BAR = [
  { name: "desktop", width: 1440, height: 900, touch: false },
  { name: "tablet", width: 834, height: 1112, touch: true },
  { name: "phone", width: 390, height: 844, touch: true },
] as const;

test.describe("3D top bar", () => {
  for (const vp of TOP_BAR) {
    test(`${vp.name}: no Quick view, a highlighted Page view and Ask AI on its right`, async ({ browser }) => {
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
      expect(a.x).toBeGreaterThanOrEqual(p.x + p.width);
      expect(Math.abs(a.y + a.height / 2 - (p.y + p.height / 2))).toBeLessThan(4);
      // Ask AI is the last control on the right edge.
      expect(vp.width - (a.x + a.width)).toBeLessThanOrEqual(24);
      await context.close();
    });
  }
});

const BOTTOM = [
  { name: "tablet", width: 834, height: 1112, touch: true },
  { name: "phone", width: 390, height: 844, touch: true },
] as const;

test.describe("bottom band", () => {
  for (const vp of BOTTOM) {
    test(`${vp.name}: the hint and the walk pill sit at the bottom, clear of the joystick, boost, view controls and Ask AI`, async ({ browser }) => {
      const { context, page } = await newPage(browser, vp);
      await asReturningVisitor(page);
      await page.goto("/en/labs?tier=lite&walk=on");
      await waitForHQ(page);
      await waitForPhase(page, "explore");
      await waitForSceneLive(page);
      await page.getByTestId("dialog-choices").getByRole("button", { name: en.walk.explore }).click();
      const launcher = page.getByTestId("walk-launcher");
      await expect(launcher.getByRole("button", { name: new RegExp(en.walk.projects.start) })).toBeVisible();
      const ask = page.locator("[data-testid='ask-pill']:visible");
      await expect(ask).toBeVisible({ timeout: 15_000 });
      await expect(page.getByTestId("boost")).toBeVisible();

      const controls = {
        joystick: await box(page.getByTestId("joystick")),
        boost: await box(page.getByTestId("boost")),
        view: await box(page.getByTestId("view-controls")),
        ask: await box(ask),
      };
      const pill = await box(launcher);
      // The hint auto-hides on phones after 6 s; measure it only while it shows.
      const hintLocator = page.getByTestId("hint");
      const hint = (await hintLocator.count()) ? await hintLocator.boundingBox({ timeout: 1000 }).catch(() => null) : null;
      const center = hint ? [pill, hint] : [pill];

      // At the bottom: the lowest center item ends within 32 px of the viewport bottom (24 px band
      // padding plus rounding), and the pill sits right on top of the hint when both show.
      expect(vp.height - Math.max(...center.map((b) => b.y + b.height))).toBeLessThanOrEqual(32);
      expect(vp.height - (pill.y + pill.height)).toBeLessThanOrEqual(32 + (hint ? hint.height + 8 : 0));
      for (const item of center) {
        expect(item.x).toBeGreaterThanOrEqual(0);
        expect(item.x + item.width).toBeLessThanOrEqual(vp.width);
        for (const [name, control] of Object.entries(controls)) expect(overlaps(item, control), `overlaps ${name}`).toBe(false);
      }
      expect(overlaps(controls.joystick, controls.boost)).toBe(false);
      expect(overlaps(controls.joystick, controls.view)).toBe(false);
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
