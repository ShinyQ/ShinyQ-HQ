#!/usr/bin/env bun
/**
 * Owner review captures: screenshots of dev-only routes (`bun run dev`) or of the served export
 * (`bun run serve`) at 1440x900, 834x1112 and 390x844, on SwiftShader WebGL with a normal desktop
 * user agent, after the page reports ready. Writes PNGs and metrics.json (draw calls and triangles
 * per shot) to --out.
 *
 *   bun scripts/capture-dev.ts --base http://localhost:3000 --out screenshots/cert-wall \
 *     'certs-30=/en/dev/certs?view=3d&n=30&tier=full'
 *
 * --ready takes a CSS selector (default: [data-ready='1']) or `hq` (waits for the 3D tower to draw).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 834, height: 1112 },
  { width: 390, height: 844 },
] as const;
const DESKTOP_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

interface Options {
  base: string;
  out: string;
  ready: string;
  settle: number;
  shots: { name: string; path: string }[];
}

function parseArgs(argv: string[]): Options {
  const opts: Options = { base: "http://localhost:3000", out: "screenshots/capture", ready: "[data-ready='1']", settle: 1500, shots: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--base") opts.base = argv[++i];
    else if (a === "--out") opts.out = argv[++i];
    else if (a === "--ready") opts.ready = argv[++i];
    else if (a === "--settle") opts.settle = Number(argv[++i]);
    else {
      const eq = a.indexOf("=");
      if (eq < 1) throw new Error(`expected name=/path, got ${a}`);
      opts.shots.push({ name: a.slice(0, eq), path: a.slice(eq + 1) });
    }
  }
  if (!opts.shots.length) throw new Error("no shots: pass name=/path?query pairs");
  return opts;
}

const opts = parseArgs(process.argv.slice(2));
mkdirSync(opts.out, { recursive: true });
const metrics: Record<string, { drawCalls: number | null; triangles: number | null }> = {};
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
try {
  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1, userAgent: DESKTOP_UA });
    // A real visitor: not webdriver (the tier gate treats webdriver as a bot), Rover Terminal already seen.
    await context.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, "webdriver", { get: () => false, configurable: true });
      localStorage.setItem("hq:terminal-seen", "1");
    });
    const page = await context.newPage();
    for (const shot of opts.shots) {
      const file = `${shot.name}-${viewport.width}x${viewport.height}.png`;
      await page.goto(new URL(shot.path, opts.base).toString());
      if (opts.ready === "hq") {
        await page.waitForFunction(() => ((window as unknown as { __hq?: { rover: { drawCalls: number } } }).__hq?.rover.drawCalls ?? 0) > 20, null, { timeout: 180_000 });
      } else await page.waitForSelector(opts.ready, { timeout: 180_000 });
      // The rover idle is only infinite by default under webdriver, which this script hides: stop it for the shots.
      await page.evaluate(() => {
        const hq = (window as unknown as { __hq?: { rover: { idleDelay: number } } }).__hq;
        if (!hq) return;
        hq.rover.idleDelay = Number.POSITIVE_INFINITY;
        document.dispatchEvent(new Event("pointermove"));
      });
      await page.waitForTimeout(opts.settle);
      const m = await page.evaluate(() => {
        const hq = (window as unknown as { __hq?: { rover: { drawCalls: number; triangles: number } } }).__hq;
        if (hq) return { drawCalls: hq.rover.drawCalls, triangles: hq.rover.triangles };
        const el = document.querySelector<HTMLElement>("[data-draw-calls]");
        const num = (v: string | undefined) => (v === undefined ? null : Number(v));
        return { drawCalls: num(el?.dataset.drawCalls), triangles: num(el?.dataset.triangles) };
      });
      metrics[file] = m;
      await page.screenshot({ path: join(opts.out, file) });
      console.log(`${file} drawCalls=${m.drawCalls} triangles=${m.triangles}`);
    }
    await context.close();
  }
} finally {
  await browser.close();
  writeFileSync(join(opts.out, "metrics.json"), `${JSON.stringify(metrics, null, 2)}\n`);
}
