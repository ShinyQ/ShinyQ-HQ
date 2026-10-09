import { expect, test, type Page } from "@playwright/test";
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
      await tab.addInitScript(() => localStorage.setItem("hq:terminal-seen", "1"));
      await tab.goto(page.path, { waitUntil: "networkidle" });
      await tab.evaluate(() => document.fonts.ready);
      await expect(tab.locator("h1").first()).toBeVisible();
      await tab.screenshot({ path: `screenshots/${page.name}-${viewport.width}x${viewport.height}.png`, fullPage: false });
      await context.close();
    });
  }
}

const OVERLAYS = [
  { name: "terminal", open: (tab: Page) => tab.getByRole("button", { name: "Missions" }).click() },
  { name: "palette", open: async (tab: Page) => {
    await tab.getByRole("button", { name: /Open search/ }).click();
    await tab.keyboard.type("azure");
  } },
];

for (const viewport of VIEWPORTS) {
  for (const overlay of OVERLAYS) {
    test(`${overlay.name} @ ${viewport.width}x${viewport.height}`, async ({ browser }) => {
      const context = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: "reduce" });
      const tab = await context.newPage();
      await tab.addInitScript(() => localStorage.setItem("hq:terminal-seen", "1"));
      await tab.goto("/en", { waitUntil: "networkidle" });
      await tab.evaluate(() => document.fonts.ready);
      await overlay.open(tab);
      await expect(tab.getByRole("dialog")).toBeVisible();
      await tab.screenshot({ path: `screenshots/${overlay.name}-${viewport.width}x${viewport.height}.png`, fullPage: false });
      await context.close();
    });
  }
}
