import { expect, test } from "@playwright/test";
import { heroPod } from "./routes";

/** Opt-in (SCREENSHOTS=1): full-page Page View captures for PR review, static tier. */
const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1024, height: 1366 },
  { width: 390, height: 844 },
];

const PAGES = [
  { name: "home", path: "/en" },
  { name: "work", path: "/en/labs" },
  { name: "case", path: `/en/labs/${heroPod.slug}` },
  { name: "journey", path: "/en/journey" },
  { name: "writing", path: "/en/library" },
  { name: "about", path: "/en/contact" },
];

test.skip(!process.env.SCREENSHOTS, "Set SCREENSHOTS=1 to capture screenshots");
test.describe.configure({ timeout: 120_000 });

for (const v of VIEWPORTS) {
  test(`Page View at ${v.width}x${v.height}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: v, deviceScaleFactor: 1, reducedMotion: "reduce" });
    await context.addInitScript(() => localStorage.setItem("hq:terminal-seen", "1"));
    const page = await context.newPage();
    for (const p of PAGES) {
      await page.goto(`${p.path}?tier=static`, { waitUntil: "networkidle" });
      await page.evaluate(() => document.fonts.ready);
      // SwiftShader cannot capture very tall pages (the Journey), so full captures stop at 8000 px.
      const height = Math.min(await page.evaluate(() => document.documentElement.scrollHeight), 8_000);
      const file = `screenshots/pageview/${p.name}-${v.width}x${v.height}`;
      await page.screenshot({ path: `${file}.png`, fullPage: true, clip: { x: 0, y: 0, width: v.width, height } });
      await page.screenshot({ path: `${file}-fold.png` });
    }
    await context.close();
  });
}

/**
 * The landing as a 3D-capable visitor's Page View sees it (Enter the 3D HQ and Back to 3D shown), with
 * Ask on. Motion stays on (the default ticker row) and Playwright stills the animations at their first frame.
 */
const LANDING_VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 834, height: 1112 },
  { width: 390, height: 844 },
];

for (const v of LANDING_VIEWPORTS) {
  test(`Landing at ${v.width}x${v.height}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: v, deviceScaleFactor: 1, reducedMotion: "no-preference" });
    // Page view stored for the session: the gate stays on the page (no 3D chunk) but the tier is lite.
    await context.addInitScript(() => sessionStorage.setItem("hq:view", "page"));
    const page = await context.newPage();
    await page.route("**/api/ask", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ enabled: true, turnstileSiteKey: null, asOf: "2026-10-01", maxLength: 300 }) }),
    );
    await page.goto("/en?tier=lite", { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    await expect(page.getByTestId("enter-hq")).toBeVisible();
    await expect(page.getByTestId("back-to-3d")).toBeVisible({ timeout: 20_000 });
    // Load the lazy featured images before the full capture, then return to the top.
    await page.locator("#work").scrollIntoViewIfNeeded();
    await expect.poll(() => page.locator("#work img").evaluateAll((imgs) => imgs.every((img) => (img as HTMLImageElement).complete))).toBe(true);
    await page.evaluate(() => window.scrollTo(0, 0));
    const file = `screenshots/landing/home-${v.width}x${v.height}`;
    await page.screenshot({ path: `${file}-fold.png`, animations: "disabled" });
    const height = Math.min(await page.evaluate(() => document.documentElement.scrollHeight), 8_000);
    await page.screenshot({ path: `${file}.png`, fullPage: true, animations: "disabled", clip: { x: 0, y: 0, width: v.width, height } });
    await context.close();
  });
}
