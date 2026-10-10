import { expect, test, type Page } from "@playwright/test";
import { asHumanBrowser, collectErrors } from "./hq";

test.describe.configure({ timeout: 90_000 });

/**
 * Samples every animation frame from document creation (before the inline head script runs) and
 * records frames where the Page View shell is visible while the 3D HQ is not mounted yet.
 */
async function recordShellFlash(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __flash: string[]; __frames: number };
    w.__flash = [];
    w.__frames = 0;
    const tick = () => {
      w.__frames++;
      const shell = document.getElementById("site-shell");
      if (shell && !document.querySelector("[data-testid='hq']") && getComputedStyle(shell).visibility !== "hidden") {
        w.__flash.push(`${Math.round(performance.now())}ms`);
      }
      if (w.__frames < 2000) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

test("3D-capable visit never shows the Page View before the HQ", async ({ page }) => {
  const errors = collectErrors(page);
  await recordShellFlash(page);
  await page.goto("/en?tier=lite", { waitUntil: "commit" });
  await page.waitForSelector("#hq-boot-cover", { state: "attached" });
  expect(await page.locator("html").getAttribute("data-hq-boot")).toBe("1");
  await expect(page.locator("#site-shell")).toBeHidden();
  await expect(page.getByTestId("boot-cover")).toBeVisible();
  await expect(page.getByTestId("hq")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("html")).not.toHaveAttribute("data-hq-boot", "1", { timeout: 30_000 });
  await expect(page.locator("html")).toHaveAttribute("data-hq-boot-released", "ready");
  await expect(page.getByTestId("boot-cover")).toBeHidden();
  // The 3D boot overlay takes over with the same card.
  await expect(page.getByTestId("boot")).toBeVisible();
  const flash = await page.evaluate(() => (window as unknown as { __flash: string[] }).__flash);
  expect(flash).toEqual([]);
  expect(errors).toEqual([]);
});

test("static tier and stored page view show the page immediately", async ({ page }) => {
  await page.goto("/en?tier=static", { waitUntil: "domcontentloaded" });
  expect(await page.locator("html").getAttribute("data-hq-boot")).toBeNull();
  await expect(page.locator("#site-shell")).toBeVisible();
  await page.evaluate(() => sessionStorage.setItem("hq:view", "page"));
  await page.goto("/en", { waitUntil: "domcontentloaded" });
  expect(await page.locator("html").getAttribute("data-hq-boot")).toBeNull();
  await expect(page.locator("#site-shell")).toBeVisible();
  await expect(page.getByTestId("boot-cover")).toBeHidden();
});

test("a software renderer falls back to the page once the tier is known", async ({ page }) => {
  // No ?tier= override: SwiftShader maps to the static tier, so the probe releases the cover.
  await asHumanBrowser(page);
  await page.goto("/en", { waitUntil: "commit" });
  await page.waitForSelector("#hq-boot-cover", { state: "attached" });
  await expect(page.locator("#site-shell")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("html")).toHaveAttribute("data-hq-boot-released", "static");
  await expect(page.getByTestId("hq")).toHaveCount(0);
  // The verdict is remembered for the session: the next page shows at once, without the cover.
  await page.goto("/en/labs", { waitUntil: "domcontentloaded" });
  expect(await page.locator("html").getAttribute("data-hq-boot")).toBeNull();
  await expect(page.locator("#site-shell")).toBeVisible();
});

test("crawlers and Lighthouse get the page without the cover", async ({ browser }) => {
  const context = await browser.newContext({ userAgent: "Mozilla/5.0 (Linux; Android 11) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36 Chrome-Lighthouse" });
  const page = await context.newPage();
  await page.goto("/en?tier=lite", { waitUntil: "domcontentloaded" });
  expect(await page.locator("html").getAttribute("data-hq-boot")).toBeNull();
  await expect(page.locator("#site-shell")).toBeVisible();
  await context.close();
});

test("a crawler never gets the 3D HQ, even with a tier override", async ({ browser }) => {
  const context = await browser.newContext({ userAgent: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" });
  const page = await context.newPage();
  await page.goto("/en?tier=lite", { waitUntil: "domcontentloaded" });
  expect(await page.locator("html").getAttribute("data-hq-boot")).toBeNull();
  await expect(page.locator("#site-shell")).toBeVisible();
  await page.waitForTimeout(3000);
  await expect(page.getByTestId("hq")).toHaveCount(0);
  expect(await page.evaluate(() => "__hq" in window)).toBe(false);
  await context.close();
});

test("automation without a tier override stays on the page; with one it gets 3D", async ({ page }) => {
  // navigator.webdriver is true under Playwright, as under Lighthouse 12.
  await page.goto("/en", { waitUntil: "domcontentloaded" });
  expect(await page.locator("html").getAttribute("data-hq-boot")).toBeNull();
  await expect(page.locator("#site-shell")).toBeVisible();
  await page.waitForTimeout(2000);
  await expect(page.getByTestId("hq")).toHaveCount(0);
  await page.goto("/en?tier=lite", { waitUntil: "commit" });
  await expect(page.getByTestId("hq")).toBeVisible({ timeout: 30_000 });
});

test("non-gated pages are unaffected", async ({ page }) => {
  await page.goto("/en/quick", { waitUntil: "domcontentloaded" });
  expect(await page.locator("html").getAttribute("data-hq-boot")).toBeNull();
  await expect(page.locator("#site-shell")).toBeVisible();
});
