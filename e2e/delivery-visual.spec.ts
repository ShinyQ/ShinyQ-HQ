import { mkdirSync } from "node:fs";
import path from "node:path";
import { test } from "@playwright/test";
import { chooseMotion, asHumanBrowser, asReturningVisitor, waitForCameraSettle, waitForHQ, waitForPhase, waitForSceneLive } from "./hq";

/** Opt-in (SCREENSHOTS=1): captures for the round 5 P1 before/after diff (scripts/shot-diff.ts). */
test.skip(!process.env.SCREENSHOTS, "Set SCREENSHOTS=1 to capture screenshots");
// Generous waits: SwiftShader at 2560x1440 on the full tier is slow, more so on a shared machine.
test.describe.configure({ timeout: 420_000 });

const DIR = path.join("screenshots", "delivery", process.env.SHOT_LABEL ?? "after");
const FLOORS = [
  ["L1", "/en"],
  ["L2", "/en/journey"],
  ["L3", "/en/labs"],
  ["L4", "/en/library"],
  ["RF", "/en/contact"],
] as const;
const WORLD = [
  { name: "desktop-1440", viewport: { width: 1440, height: 900 }, tier: "full", mobile: false },
  { name: "desktop-2560", viewport: { width: 2560, height: 1440 }, tier: "full", mobile: false },
  { name: "phone-390", viewport: { width: 390, height: 844 }, tier: "lite", mobile: true },
] as const;
const PAGES = [
  { width: 1440, height: 900 },
  { width: 1999, height: 1129 },
  { width: 834, height: 1112 },
  { width: 390, height: 844 },
] as const;

const SLICE = 4000;

const shot = (name: string) => {
  mkdirSync(DIR, { recursive: true });
  return path.join(DIR, `${name}.png`);
};

for (const v of WORLD) {
  for (const [floor, route] of FLOORS) {
    test(`3D ${floor} ${v.name}`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: v.viewport, deviceScaleFactor: 1, reducedMotion: "reduce", isMobile: v.mobile, hasTouch: v.mobile });
      await chooseMotion(context, "system");
      const page = await context.newPage();
      await asReturningVisitor(page);
      await page.goto(`${route}?tier=${v.tier}&walk=off`);
      await waitForHQ(page);
      await waitForPhase(page, "explore", 180_000);
      await waitForSceneLive(page, 180_000);
      await waitForCameraSettle(page, { timeout: 180_000 });
      await page.screenshot({ path: shot(`3d-${floor}-${v.name}`) });
      await context.close();
    });
  }
}

for (const v of PAGES) {
  // Own browser without SwiftShader (much faster for a static page), captured in 4000 px slices
  // (page-<w>x<h>-<n>.png): one full-page capture of the taller tablet and phone pages fails.
  test(`Page View /en ${v.width}x${v.height}`, async ({ playwright, baseURL }) => {
    const browser = await playwright.chromium.launch();
    const context = await browser.newContext({ baseURL, viewport: v, deviceScaleFactor: 1, reducedMotion: "reduce" });
    await chooseMotion(context, "system");
    const page = await context.newPage();
    await page.goto("/en?tier=static");
    await page.waitForSelector("html[data-hydrated]");
    await page.evaluate(async () => {
      for (const img of Array.from(document.images)) img.loading = "eager";
      await Promise.all(Array.from(document.images).map((img) => (img.complete ? null : img.decode().catch(() => null))));
    });
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0, n = 1; y < height; y += SLICE, n++) {
      const clip = { x: 0, y, width: v.width, height: Math.min(SLICE, height - y) };
      await page.screenshot({ path: shot(`page-${v.width}x${v.height}-${n}`), fullPage: true, clip });
    }
    await browser.close();
  });

  test(`boot card ${v.width}x${v.height}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: v, deviceScaleFactor: 1, reducedMotion: "reduce" });
    await chooseMotion(context, "system");
    const page = await context.newPage();
    await asHumanBrowser(page);
    // Keeps the cover up: no Next.js chunk, so nothing releases it before the capture.
    await page.route("**/_next/static/chunks/**/*.js", (route) => route.abort());
    await page.goto("/en?tier=lite", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1600); // the CSS log stagger ends at about 1.47 s
    await page.screenshot({ path: shot(`boot-${v.width}x${v.height}`) });
    await context.close();
  });
}
