import { expect, test, type Browser } from "@playwright/test";
import { asReturningVisitor, waitForFloor, waitForHQ, waitForPhase } from "./hq";
import { heroPod } from "./routes";

/** Opt-in (SCREENSHOTS=1): captures PR screenshots into screenshots/. WebGL runs on SwiftShader. */
const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900, tier: "full", touch: false },
  { name: "tablet", width: 1024, height: 1366, tier: "full", touch: true },
  { name: "mobile", width: 390, height: 844, tier: "lite", touch: true },
] as const;

type Viewport = (typeof VIEWPORTS)[number];

const PAGES = [
  { name: "lobby", path: "/en" },
  { name: "quick", path: "/en/quick" },
  { name: `labs-${heroPod.slug}`, path: `/en/labs/${heroPod.slug}` },
];

test.skip(!process.env.SCREENSHOTS, "Set SCREENSHOTS=1 to capture screenshots");
test.describe.configure({ timeout: 120_000 });

const shot = (name: string, v: Viewport) => `screenshots/${name}-${v.width}x${v.height}.png`;

async function open3D(browser: Browser, v: Viewport) {
  const context = await browser.newContext({
    viewport: { width: v.width, height: v.height },
    deviceScaleFactor: 1,
    hasTouch: v.touch,
    isMobile: v.name === "mobile",
  });
  const page = await context.newPage();
  await asReturningVisitor(page);
  await page.goto(`/en?tier=${v.tier}`);
  await waitForHQ(page);
  await page.getByRole("button", { name: /Skip intro/ }).click();
  await waitForPhase(page, "explore");
  await page.evaluate(() => document.fonts.ready);
  return { context, page };
}

for (const viewport of VIEWPORTS) {
  for (const page of PAGES) {
    test(`${page.name} (HTML) @ ${viewport.width}x${viewport.height}`, async ({ browser }) => {
      const context = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: "reduce" });
      const tab = await context.newPage();
      await tab.goto(`${page.path}?tier=static`, { waitUntil: "networkidle" });
      await tab.evaluate(() => document.fonts.ready);
      await expect(tab.locator("h1").first()).toBeVisible();
      await tab.screenshot({ path: shot(page.name, viewport), fullPage: false });
      await context.close();
    });
  }

  test(`3D lobby @ ${viewport.width}x${viewport.height}`, async ({ browser }) => {
    const { context, page } = await open3D(browser, viewport);
    await page.waitForTimeout(3000);
    await page.screenshot({ path: shot("hq-lobby", viewport) });
    await context.close();
  });

  test(`3D boot @ ${viewport.width}x${viewport.height}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1 });
    const page = await context.newPage();
    await page.goto(`/en?tier=${viewport.tier}`);
    await waitForHQ(page);
    await expect(page.getByText("rover ready ^_^")).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: shot("hq-boot", viewport) });
    await context.close();
  });

  test(`3D L2 rail @ ${viewport.width}x${viewport.height}`, async ({ browser }) => {
    const { context, page } = await open3D(browser, viewport);
    await page.getByRole("navigation", { name: "Elevator" }).locator('[data-floor="L2"]').click();
    await waitForFloor(page, "L2");
    await page.keyboard.down("d");
    await page.waitForTimeout(1200);
    await page.keyboard.up("d");
    await page.waitForTimeout(1500);
    await page.screenshot({ path: shot("hq-l2-rail", viewport) });
    await context.close();
  });
}
