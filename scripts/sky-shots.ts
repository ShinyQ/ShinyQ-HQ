#!/usr/bin/env bun
/**
 * Day and night review captures: L1 and L3 at the four sky phases (night, dawn, day, dusk) on desktop
 * (full tier, 1440x900) and phone (lite tier, 390x844 touch), from a dev server or the served export.
 * Each shot pins the phase with `?sky=<phase>` and lands in explore (intro already seen this session).
 *
 *   bun scripts/sky-shots.ts --base http://localhost:3000 --out screenshots/sky
 *   PHASES=night,day FLOORS=L1 DEVICES=desktop bun scripts/sky-shots.ts
 *
 * Writes <floor>-<phase>-<device>.png and metrics.json (scene calls, triangles, programs per shot).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "@playwright/test";

const args = process.argv.slice(2);
const flag = (name: string, fallback: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
};
const BASE = flag("--base", "http://localhost:3000");
const OUT = flag("--out", "screenshots/sky");
const SETTLE = Number(flag("--settle", "2500"));
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const PHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

const ALL_DEVICES = [
  { id: "desktop", viewport: { width: 1440, height: 900 }, touch: false, tier: "full", ua: UA },
  { id: "phone", viewport: { width: 390, height: 844 }, touch: true, tier: "lite", ua: PHONE_UA },
] as const;
const ALL_FLOORS = [
  { id: "L1", path: "/en" },
  { id: "L3", path: "/en/labs" },
] as const;
const pick = <T extends { id: string }>(list: readonly T[], env: string | undefined) => (env ? list.filter((x) => env.split(",").includes(x.id)) : list);
const DEVICES = pick(ALL_DEVICES, process.env.DEVICES);
const FLOORS = pick(ALL_FLOORS, process.env.FLOORS);
const PHASES = (process.env.PHASES ?? "night,dawn,day,dusk").split(",");

type Probe = { __hq?: { store: { getState(): { phase: string } }; rover: { drawCalls: number; triangles: number }; render?: { programs(): number } } };

/** The rover idle is only infinite by default under webdriver, which this script hides: stop it for the shots (a pointer move restarts the wait with the new delay). */
async function noIdle(page: Page) {
  await page.evaluate(() => {
    (window as unknown as { __hq: { rover: { idleDelay: number } } }).__hq.rover.idleDelay = Number.POSITIVE_INFINITY;
    document.dispatchEvent(new Event("pointermove"));
  });
}

mkdirSync(OUT, { recursive: true });
const metrics: Record<string, unknown> = {};
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
try {
  for (const d of DEVICES) {
    const context = await browser.newContext({ viewport: d.viewport, deviceScaleFactor: 1, hasTouch: d.touch, isMobile: d.touch, userAgent: d.ua });
    await context.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, "webdriver", { get: () => false, configurable: true });
      sessionStorage.setItem("hq:intro", "seen");
      localStorage.setItem("hq:terminal-seen", "1");
      localStorage.setItem("hq:onboarded", "done");
      localStorage.setItem("hq:hints", "off");
      localStorage.setItem("hq:floor-intro", JSON.stringify(["L1", "L2", "L3", "L4", "RF"]));
    });
    const page = await context.newPage();
    for (const f of FLOORS) {
      for (const phase of PHASES) {
        const name = `${f.id}-${phase}-${d.id}`;
        const sep = f.path.includes("?") ? "&" : "?";
        const query = phase === "base" ? "" : `&sky=${phase}`;
        await page.goto(`${BASE}${f.path}${sep}tier=${d.tier}${query}`);
        await page.waitForFunction(
          () => {
            const hq = (window as unknown as Probe).__hq;
            return !!hq && hq.store.getState().phase === "explore" && hq.rover.drawCalls > 20;
          },
          null,
          { timeout: 240_000 },
        );
        await noIdle(page);
        await page.waitForTimeout(SETTLE);
        const m = await page.evaluate(() => {
          const hq = (window as unknown as Probe).__hq!;
          return { drawCalls: hq.rover.drawCalls, triangles: hq.rover.triangles, programs: hq.render?.programs() ?? null };
        });
        metrics[name] = m;
        await page.screenshot({ path: join(OUT, `${name}.png`) });
        console.log(`${name}.png`, JSON.stringify(m));
      }
    }
    await context.close();
  }
} finally {
  await browser.close();
  writeFileSync(join(OUT, "metrics.json"), `${JSON.stringify(metrics, null, 2)}\n`);
}
