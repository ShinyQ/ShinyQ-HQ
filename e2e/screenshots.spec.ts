import { expect, test } from "@playwright/test";
import { heroPod } from "./routes";

/** Opt-in (SCREENSHOTS=1): captures PR screenshots into screenshots/. */
const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
] as const;

const PAGES = [
  { name: "lobby", path: "/en" },
  { name: "quick", path: "/en/quick" },
  { name: `labs-${heroPod.slug}`, path: `/en/labs/${heroPod.slug}` },
];

test.skip(!process.env.SCREENSHOTS, "Set SCREENSHOTS=1 to capture screenshots");

for (const viewport of VIEWPORTS) {
  for (const page of PAGES) {
    test(`${page.name} @ ${viewport.width}x${viewport.height}`, async ({ browser }) => {
      const context = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: "reduce" });
      const tab = await context.newPage();
      await tab.goto(page.path, { waitUntil: "networkidle" });
      await tab.evaluate(() => document.fonts.ready);
      await expect(tab.locator("h1").first()).toBeVisible();
      await tab.screenshot({ path: `screenshots/${page.name}-${viewport.width}x${viewport.height}.png`, fullPage: false });
      await context.close();
    });
  }
}
