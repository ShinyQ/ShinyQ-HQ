import { mkdirSync } from "node:fs";
import { chromium, type Browser } from "@playwright/test";

/**
 * Captures the dev-only L4 concepts prototype (/{locale}/dev/library) for the owner's pick: every
 * concept in the rover view, top-down and on the first stop of "Read my writing" (drawer open), at
 * 1440x900, 834x1112 and 390x844. WebGL runs on SwiftShader with a normal desktop user agent.
 *
 *   bun run dev                       # in another terminal (dev pages only exist under next dev)
 *   bun scripts/dev-shots.ts          # BASE_URL=http://localhost:3000 by default
 *
 * Output: screenshots/l4-concepts/<concept>-<shot>-<w>x<h>.png (gitignored). Narrow a run with
 * CONCEPTS=atrium,newsroom  SHOTS=rover,top,walk  WIDTHS=1440,834,390.
 */

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = "screenshots/l4-concepts";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const VIEWPORTS = [
  { width: 1440, height: 900, touch: false, tier: "full" },
  { width: 834, height: 1112, touch: true, tier: "full" },
  { width: 390, height: 844, touch: true, tier: "lite" },
] as const;
const CONCEPTS = (process.env.CONCEPTS ?? "atrium,newsroom,constellation").split(",");
const ALL_SHOTS = [
  { name: "rover", query: "view=rover", walk: false },
  { name: "top", query: "view=top", walk: false },
  { name: "walk", query: "view=rover", walk: true },
] as const;
const SHOTS = ALL_SHOTS.filter((s) => (process.env.SHOTS ?? "rover,top,walk").split(",").includes(s.name));
const WIDTHS = (process.env.WIDTHS ?? "1440,834,390").split(",").map(Number);

async function capture(browser: Browser, concept: string, shot: (typeof ALL_SHOTS)[number], v: (typeof VIEWPORTS)[number]) {
  const context = await browser.newContext({ viewport: { width: v.width, height: v.height }, deviceScaleFactor: 1, hasTouch: v.touch, userAgent: UA });
  const page = await context.newPage();
  await page.goto(`${BASE}/en/dev/library?concept=${concept}&${shot.query}&tier=${v.tier}`, { timeout: 180_000 });
  await page.waitForSelector("[data-testid='library-prototype'][data-ready]", { timeout: 180_000 });
  await page.evaluate(() => document.fonts.ready);
  if (shot.walk) {
    await page.getByTestId("walk-prompt").getByRole("button", { name: "Read my writing" }).click();
    await page.waitForSelector("[data-testid='walk-bar'][data-status='arrived']", { timeout: 120_000 });
    await page.waitForSelector("[data-testid='room-drawer']", { timeout: 60_000 });
  }
  // Troika text builds its glyphs slowly on SwiftShader.
  await page.waitForTimeout(5000);
  const budget = await page.getByTestId("library-prototype").evaluate((el) => `${el.dataset.calls} calls, ${el.dataset.triangles} triangles`);
  const file = `${OUT}/${concept}-${shot.name}-${v.width}x${v.height}.png`;
  await page.screenshot({ path: file });
  console.log(`${file}  (${budget})`);
  await context.close();
}

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
for (const concept of CONCEPTS) for (const shot of SHOTS) for (const v of VIEWPORTS.filter((vp) => WIDTHS.includes(vp.width))) await capture(browser, concept, shot, v);
await browser.close();
