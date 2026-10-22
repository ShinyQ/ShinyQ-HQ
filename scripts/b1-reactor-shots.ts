#!/usr/bin/env bun
/**
 * B1-2 reactor hall captures for the owner's review: the arrival, the aisle mid-way, each of the seven bays from its
 * door pad, the reactor from its door with live data, a deploy flash and the reactor drawer, at 1440x900, 820x1180 and
 * 390x844, each on full and lite, on a served export unlocked with the dev and test flag. `/api/office?v=4` is mocked
 * with the busy pipeline (`OFFICE_FIXTURES_V4.busy`, shifted to now, a production deploy a second old on every poll) and
 * `/api/stats` with `STATS_FIXTURE`. SwiftShader WebGL. Station drawers: `scripts/b1-shots.ts`.
 *
 *   bun scripts/serve-static.ts --port 4300 --dir out &
 *   bun scripts/b1-reactor-shots.ts --base http://127.0.0.1:4300 --out screenshots/b1-2 [--only 1440x900-full,390x844-lite] [--bays 1440x900-full,390x844-lite] [--shots 04-reactor,05-reactor-flash]
 *
 * `--shots` saves only the named shots (the drive still runs); `--bays none` skips every bay.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "@playwright/test";
import { B1_QUERY } from "../e2e/b1";
import { ENGINE, ENGINE_STATIONS } from "../src/experience/floors/engine/layout";
import { OFFICE_FIXTURE_NOW, OFFICE_FIXTURES_V4 } from "../src/lib/office/fixtures";
import { STATS_FIXTURE } from "../src/lib/stats/fixtures";

const RUNS = [1440, 820, 390].flatMap((w) =>
  (["full", "lite"] as const).map((tier) => ({ width: w, height: w === 1440 ? 900 : w === 820 ? 1180 : 844, tier, key: `${w}x${w === 1440 ? 900 : w === 820 ? 1180 : 844}-${tier}` })),
);

type Reactor = { started: () => boolean; poll: () => void; state: () => { state: { live: boolean; lanes: string[]; sparks: number } | null; segments: number; sparks: number; flash: number } };
type HQ = {
  store: { getState: () => { floor: string; ride: unknown; phase: string; goToFloor: (f: string) => void; openRoom: (r: string) => void; closeRoom: () => void } };
  rover: { x: number; z: number; speed: number; driving: boolean; drawCalls: number; autopilot: { point: { x: number; z: number }; state: string } | null };
  camera: () => [number, number, number];
  layouts: Record<string, { doors?: { room: string; at: { x: number; z: number } }[] }>;
  reactor: () => Reactor | null;
};

let base = "http://127.0.0.1:4300";
let out = "screenshots/b1-2";
let only: string[] | null = null;
/** Runs that also capture the seven bays (default: every run). */
let bays: string[] | null = null;
/** Shot names to save (default: every shot). */
let shots: string[] | null = null;
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--base") base = argv[++i];
  else if (argv[i] === "--out") out = argv[++i];
  else if (argv[i] === "--only") only = argv[++i].split(",");
  else if (argv[i] === "--bays") bays = argv[++i].split(",");
  else if (argv[i] === "--shots") shots = argv[++i].split(",");
}
mkdirSync(out, { recursive: true });

/** Shifts every fixture time (epoch ms near `OFFICE_FIXTURE_NOW`) by `delta`, keeping the busy office's shape. */
function shift<T>(value: T, delta: number): T {
  if (typeof value === "number") return (Math.abs(value - OFFICE_FIXTURE_NOW) < 3 * 86_400_000 ? value + delta : value) as T;
  if (Array.isArray(value)) return value.map((v) => shift(v, delta)) as T;
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shift(v, delta)])) as T;
  return value;
}

/** The busy office as of now, its production deploy a second old (so a later poll brings a newer deploy: a flash). */
function officeNow(): unknown {
  const now = Date.now();
  const snap = shift(OFFICE_FIXTURES_V4.busy, now - OFFICE_FIXTURE_NOW) as { pipeline: { ships: { kind: string; status: string; at: number }[] } };
  for (const s of snap.pipeline.ships) if (s.kind === "deploy" && s.status === "success") s.at = now - 1_000;
  return snap;
}

/** Rendered animation frames (state that changes per frame, not per millisecond; SwiftShader can stall for seconds). */
const frames = (page: Page, count: number) =>
  page.evaluate(
    (n) =>
      new Promise<void>((resolve) => {
        let seen = 0;
        const tick = () => (++seen >= n ? resolve() : requestAnimationFrame(tick));
        requestAnimationFrame(tick);
      }),
    count,
  );

/** Waits for no ride, a parked rover and a follow camera that holds still over 12 frames. */
async function settle(page: Page) {
  await page.waitForFunction(
    () => {
      const h = (window as unknown as { __hq: HQ }).__hq;
      const s = h.store.getState();
      return s.ride === null && s.phase !== "elevator" && !h.rover.driving && h.rover.speed < 0.2;
    },
    null,
    { timeout: 120_000, polling: 250 },
  );
  for (let i = 0; i < 40; i++) {
    const a = await page.evaluate(() => (window as unknown as { __hq: HQ }).__hq.camera());
    await frames(page, 12);
    const b = await page.evaluate(() => (window as unknown as { __hq: HQ }).__hq.camera());
    if (Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 0.03) return;
  }
}

async function driveTo(page: Page, point: { x: number; z: number }) {
  await page.evaluate((p) => ((window as unknown as { __hq: HQ }).__hq.rover.autopilot = { point: p, state: "pending" }), point);
  await page.waitForFunction(
    () => {
      const r = (window as unknown as { __hq: HQ }).__hq.rover;
      return r.autopilot?.state !== "pending" && r.autopilot?.state !== "driving" && r.speed < 0.5;
    },
    null,
    { timeout: 120_000, polling: 250 },
  );
  await settle(page);
}

/** A door pad opens its room's drawer on arrival: close it for the scene shot. */
async function closeDrawer(page: Page) {
  await page.evaluate(() => (window as unknown as { __hq: HQ }).__hq.store.getState().closeRoom());
  await page.locator('[data-testid="room-drawer"]').waitFor({ state: "hidden", timeout: 30_000 }).catch(() => undefined);
  await settle(page);
  await frames(page, 10);
}

const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const saved: string[] = [];
const skipped: string[] = [];
try {
  for (const run of RUNS) {
    if (only && !only.includes(run.key)) continue;
    const started = Date.now();
    const shot = async (page: Page, name: string) => {
      if (shots && !shots.includes(name)) return;
      const file = join(out, `${name}-${run.key}.png`);
      await page.screenshot({ path: file });
      saved.push(file);
      console.log(`  ${file}`);
    };
    const context = await browser.newContext({ viewport: { width: run.width, height: run.height }, deviceScaleFactor: 1, hasTouch: run.width < 1000, isMobile: run.width < 600 });
    await context.addInitScript(() => {
      localStorage.setItem("hq:terminal-seen", "1");
      localStorage.setItem("hq:onboarded", "done");
      localStorage.setItem("hq:hints", "off");
      localStorage.setItem("hq:floor-intro", JSON.stringify(["B1", "L1", "L2", "L3", "L4", "RF"]));
      sessionStorage.setItem("hq:intro", "seen");
    });
    await context.route(/\/api\/office\?v=4$/, (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(officeNow()) }));
    await context.route("**/api/stats", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...STATS_FIXTURE, updatedAt: new Date(Date.now() - 3_600_000).toISOString() }) }),
    );
    const page = await context.newPage();
    console.log(run.key);
    await page.goto(`${base}/en?tier=${run.tier}&${B1_QUERY}`);
    await page.waitForFunction(() => ((window as unknown as { __hq?: HQ }).__hq?.rover.drawCalls ?? 0) > 0 && !document.documentElement.hasAttribute("data-hq-boot"), null, { timeout: 180_000, polling: 250 });
    await settle(page);
    await page.evaluate(() => (window as unknown as { __hq: HQ }).__hq.store.getState().goToFloor("B1"));
    await page.waitForFunction(() => (window as unknown as { __hq: HQ }).__hq.store.getState().floor === "B1", null, { timeout: 120_000, polling: 250 });
    await settle(page);
    await shot(page, "01-arrival");
    await driveTo(page, { x: (ENGINE.arrival.x + ENGINE.aisle.endX) / 2, z: 0 });
    await shot(page, "02-aisle");
    const doors = await page.evaluate(() => (window as unknown as { __hq: HQ }).__hq.layouts.B1.doors ?? []);
    const door = (room: string) => {
      const d = doors.find((x) => x.room === room);
      if (!d) throw new Error(`No B1 door for ${room}`);
      return d.at;
    };
    if (!bays || bays.includes(run.key)) {
      for (const [i, id] of ENGINE_STATIONS.entries()) {
        await driveTo(page, door(`B1:${id}`));
        await closeDrawer(page);
        await shot(page, `03-bay-${i + 1}-${id}`);
      }
    } else skipped.push(`bays ${run.key}`);
    await driveTo(page, door("B1:reactor"));
    await closeDrawer(page);
    await page.waitForFunction(() => (window as unknown as { __hq: HQ }).__hq.reactor()?.state().state?.live === true, null, { timeout: 60_000, polling: 250 });
    await settle(page);
    await frames(page, 20);
    await shot(page, "04-reactor");
    // A newer deploy on the next poll flashes the core for 1.5 s: catch it if SwiftShader is quick enough.
    await page.evaluate(() => (window as unknown as { __hq: HQ }).__hq.reactor()?.poll());
    try {
      await page.waitForFunction(() => ((window as unknown as { __hq: HQ }).__hq.reactor()?.state().flash ?? 0) > 0.3, null, { timeout: 15_000, polling: "raf" });
      await shot(page, "05-reactor-flash");
    } catch {
      skipped.push(`flash ${run.key} (not caught)`);
    }
    await page.evaluate(() => (window as unknown as { __hq: HQ }).__hq.store.getState().openRoom("B1:reactor"));
    await page.locator('[data-testid="room-drawer"] [data-engine-station="reactor"] [data-reactor-live="true"]').waitFor({ timeout: 60_000 });
    await page.evaluate(() => document.fonts.ready);
    await frames(page, 20);
    await shot(page, "06-reactor-drawer");
    const probe = await page.evaluate(() => (window as unknown as { __hq: HQ }).__hq.reactor()?.state());
    console.log(`  reactor: ${JSON.stringify({ live: probe?.state?.live, lanes: probe?.state?.lanes, segments: probe?.segments, sparks: probe?.sparks })} in ${Math.round((Date.now() - started) / 1000)} s`);
    await context.close();
  }
} finally {
  await browser.close();
}
console.log(`saved ${saved.length}${skipped.length ? `, skipped: ${skipped.join("; ")}` : ""}`);
