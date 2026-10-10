import { test } from "@playwright/test";
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
      await page.screenshot({ path: `screenshots/pageview/${p.name}-${v.width}x${v.height}.png`, fullPage: true });
    }
    await context.close();
  });
}
