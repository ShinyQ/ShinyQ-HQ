#!/usr/bin/env bun
/**
 * Elevator arrival captures (Round 8 J): rides L1 to L2, L3, L4, RF and back to L1 on a served export
 * and screenshots each floor once the arrival has settled (and, with --mid, about halfway through the glide
 * out of the car). Four review sizes: 1440x900, 1194x834, 834x1194 and 390x844. SwiftShader WebGL.
 *
 *   bun scripts/serve-static.ts --port 4300 --dir out &
 *   bun scripts/arrival-shots.ts --base http://127.0.0.1:4300 --out screenshots/arrivals/after --mid
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "@playwright/test";

const VIEWPORTS = [
  { width: 1440, height: 900, tier: "full" },
  { width: 1194, height: 834, tier: "full" },
  { width: 834, height: 1194, tier: "full" },
  { width: 390, height: 844, tier: "lite" },
] as const;
let ORDER: readonly string[] = ["L2", "L3", "L4", "RF", "L1"];

type HQ = {
  store: { getState: () => { floor: string; ride: { stage: string } | null; phase: string; goToFloor: (f: string) => void } };
  motion?: () => { ride: { stage: string } | null };
  rover: { driving: boolean; cameraYaw: number; cameraRailYaw: number; cameraZoom: number; heading: number; x: number; z: number; drawCalls: number; triangles: number };
  camera: () => [number, number, number];
};
const hq = (page: Page) => page.evaluateHandle(() => (window as unknown as { __hq: HQ }).__hq);

let base = "http://127.0.0.1:4300";
let out = "screenshots/arrivals";
let mid = false;
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--base") base = argv[++i];
  else if (argv[i] === "--out") out = argv[++i];
  else if (argv[i] === "--mid") mid = true;
  // `--floors RF,L1`: ride only to these floors, in this order (starting from the Lobby).
  else if (argv[i] === "--floors") ORDER = argv[++i].split(",");
}
mkdirSync(out, { recursive: true });

async function settle(page: Page, atArrival = true) {
  // After a ride the rover rolls on to the floor's arrival point (`FloorLayout.arrival`): wait until it parks there.
  await page.waitForFunction((atArrival) => {
    const w = window as unknown as { __hq: HQ & { layouts?: Record<string, { arrival?: { x: number; z: number } }> } };
    const s = w.__hq.store.getState();
    if (s.ride !== null || s.phase !== "explore" || w.__hq.rover.driving) return false;
    const a = w.__hq.layouts?.[s.floor]?.arrival;
    return !atArrival || !a || Math.hypot(w.__hq.rover.x - a.x, w.__hq.rover.z - a.z) < 1;
  }, atArrival, { timeout: 120_000 });
  // The camera spring is slow on SwiftShader: wait for two equal camera reads 600 ms apart.
  for (let i = 0; i < 40; i++) {
    const a = await page.evaluate(() => (window as unknown as { __hq: HQ }).__hq.camera());
    await page.waitForTimeout(600);
    const b = await page.evaluate(() => (window as unknown as { __hq: HQ }).__hq.camera());
    if (Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 0.03) return;
  }
}

const metrics: Record<string, unknown> = {};
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
try {
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1, hasTouch: vp.width < 1000, isMobile: vp.width < 600 });
    await context.addInitScript(() => {
      localStorage.setItem("hq:terminal-seen", "1");
      localStorage.setItem("hq:onboarded", "done");
      localStorage.setItem("hq:hints", "off");
      localStorage.setItem("hq:floor-intro", JSON.stringify(["L1", "L2", "L3", "L4", "RF"]));
      sessionStorage.setItem("hq:intro", "seen");
      if (!localStorage.getItem("hq:v1")) localStorage.setItem("hq:v1", JSON.stringify({ state: { firstVisit: false, visited: [], locale: "en", sound: false, motion: "full" }, version: 3 }));
      // All five floors seen and B1 unlocked, so Rover's offer and chime never land in a capture.
      const raw = localStorage.getItem("hq:v1");
      const saved = raw ? JSON.parse(raw) : { state: { firstVisit: false, visited: [], locale: "en", motion: "full" }, version: 3 };
      localStorage.setItem("hq:v1", JSON.stringify({ ...saved, state: { ...saved.state, floorsSeen: ["L1", "L2", "L3", "L4", "RF"], b1Unlocked: true } }));
    });
    const page = await context.newPage();
    await page.goto(`${base}/en?tier=${vp.tier}`);
    await page.waitForFunction(() => ((window as unknown as { __hq?: HQ }).__hq?.rover.drawCalls ?? 0) > 0 && !document.documentElement.hasAttribute("data-hq-boot"), null, { timeout: 180_000 });
    await settle(page, false);
    for (const floor of ORDER) {
      await (await hq(page)).evaluate((h, f) => h.store.getState().goToFloor(f), floor);
      if (mid) {
        // Mid glide: about halfway out of the car (`roverRuntime.arrivalGlide`, eased progress 0 to 1).
        await page.waitForFunction(() => ((window as unknown as { __hq: { rover: { arrivalGlide?: number } } }).__hq.rover.arrivalGlide ?? -1) >= 0.4, null, { timeout: 120_000, polling: "raf" });
        await page.screenshot({ path: join(out, `${floor}-mid-${vp.width}x${vp.height}.png`) });
      }
      await page.waitForFunction((f) => (window as unknown as { __hq: HQ }).__hq.store.getState().floor === f, floor, { timeout: 120_000 });
      await settle(page);
      const file = `${floor}-${vp.width}x${vp.height}.png`;
      metrics[file] = await page.evaluate(() => {
        const r = (window as unknown as { __hq: HQ }).__hq.rover;
        return { x: r.x, z: r.z, heading: r.heading, yaw: r.cameraYaw, railYaw: r.cameraRailYaw, zoom: r.cameraZoom, drawCalls: r.drawCalls, triangles: r.triangles };
      });
      await page.screenshot({ path: join(out, file) });
      console.log(file, JSON.stringify(metrics[file]));
    }
    await context.close();
  }
} finally {
  await browser.close();
  writeFileSync(join(out, "metrics.json"), JSON.stringify(metrics, null, 2));
}
