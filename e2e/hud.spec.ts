import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";
import { enterHQ } from "./hq";

/**
 * 3D HUD layout (owner round R3-B): the top bar (no Quick view, a highlighted Page view with Ask AI
 * on its right), the bottom band (hint and walk pill at the bottom, clear of the joystick, boost and
 * view controls) and the room drawer footer (cross-floor link right of the primary action).
 */
test.describe.configure({ timeout: 150_000 });

type Box = { x: number; y: number; width: number; height: number };
const box = async (locator: Locator): Promise<Box> => (await locator.boundingBox())!;

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
