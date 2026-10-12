import { expect, test } from "@playwright/test";
import { enterHQ, openPage, waitForCameraSettle, waitForFrames } from "../hq";

/**
 * Local look check (`bun run e2e:look`, never in CI): the same camera poses rendered by two builds
 * must match, so a measurement change can never change the look (round 5 rule). Write the baselines
 * from a main build, then compare the branch build:
 *
 *   E2E_DIR=out-main E2E_PORT=4433 bun run e2e:look --update-snapshots
 *   E2E_PORT=4433 bun run e2e:look
 *
 * Snapshots stay local (gitignored). Reduced motion holds every animation and snaps the camera, so a
 * pose is one still frame. Only the canvas is captured (the HUD is HTML and changes on its own).
 */
const POSES = [
  { name: "desktop-full-1440", tier: "full", viewport: { width: 1440, height: 900 }, mobile: false },
  { name: "desktop-full-2560", tier: "full", viewport: { width: 2560, height: 1440 }, mobile: false },
  { name: "phone-lite-390", tier: "lite", viewport: { width: 390, height: 844 }, mobile: true },
] as const;

const FLOORS = [
  { floor: "L1", path: "/en" },
  { floor: "L3", path: "/en/labs" },
] as const;

/** At most 0.1% of the pixels may differ by more than the per-pixel threshold (0.1 in YIQ space). */
const LOOK = { maxDiffPixelRatio: 0.001, threshold: 0.1 } as const;

/**
 * The Page View capture stops after this many CSS pixels of `#main`: SwiftShader cannot capture the
 * whole column (Quick view is over 20k px tall, "Unable to capture screenshot").
 */
const MAIN_CLIP_HEIGHT = 8000;

test.describe.configure({ timeout: 240_000 });

for (const pose of POSES) {
  for (const { floor, path } of FLOORS) {
    test(`${floor} ${pose.name} @look`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: pose.viewport, isMobile: pose.mobile, hasTouch: pose.mobile, reducedMotion: "reduce" });
      const page = await context.newPage();
      await enterHQ(page, { path, tier: pose.tier });
      await waitForCameraSettle(page);
      await waitForFrames(page, 30);
      const canvas = page.locator("[data-testid='hq-world'] canvas");
      expect(await canvas.screenshot()).toMatchSnapshot(`${floor}-${pose.name}.png`, LOOK);
      await context.close();
    });
  }
}

for (const width of [1440, 390]) {
  test(`Page View main column ${width} @look`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
    const page = await context.newPage();
    await openPage(page, "/en/quick?tier=static");
    await page.evaluate(() => document.fonts.ready);
    const main = await page.locator("#main").evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.x + window.scrollX, y: r.y + window.scrollY, width: r.width, height: r.height };
    });
    const clip = { ...main, height: Math.min(main.height, MAIN_CLIP_HEIGHT) };
    expect(await page.screenshot({ fullPage: true, clip })).toMatchSnapshot(`pageview-main-${width}.png`, LOOK);
    // The footer may change on purpose (Task 12); it is saved for review in the PR, not compared.
    await page.locator("footer").screenshot({ path: `screenshots/look/footer-${width}.png` });
    await context.close();
  });
}
