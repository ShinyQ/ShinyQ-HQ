#!/usr/bin/env bun
/**
 * Highlights Hall captures for the owner's review (one gate and B4 premium, owner decision 2026-11-04): the gate from the
 * Lobby lead road, the walk in through the rings, a pinned overview into the hall, the office plaza (no road into the
 * hall), and each of the seven stations before the wake (the rover in front of its pad, the station's camera view) and
 * after it (the rover on the pad, the drawer closed again, the wake settled), at 1440x900 on the full tier and 390x844 on
 * lite by default. Never committed output; the waits follow the e2e helpers (state, never time).
 *
 *   bun run build && bun scripts/serve-static.ts --port 4482 --dir out &
 *   bun scripts/hall-shots.ts --base http://127.0.0.1:4482 --out <dir>
 *
 * `--only full-1440x900` limits the tier and viewport combos; `--shots gate,overview,about` limits the shots.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Page } from "@playwright/test";
import { asReturningVisitor, driveTo, skipFloorLines, turnCameraTo, waitForCameraSettle, waitForFrames, waitForHQ, waitForPhase, waitForSceneLive } from "../e2e/hq";
import { yawLooking } from "../src/experience/camera/look";
import { LOBBY } from "../src/experience/config";
import { HALL, stationOf } from "../src/experience/floors/lobby/hallLayout";
import { HIGHLIGHT_STATIONS, highlightRoom } from "../src/experience/floors/lobby/stations";

const COMBOS = [
  { tier: "full", width: 1440, height: 900, mobile: false },
  { tier: "lite", width: 390, height: 844, mobile: true },
] as const;

let base = "http://127.0.0.1:4482";
let out = "screenshots/hall";
let only: string[] | null = null;
let shots: string[] | null = null;
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--base") base = argv[++i];
  else if (argv[i] === "--out") out = argv[++i];
  else if (argv[i] === "--only") only = argv[++i].split(",");
  else if (argv[i] === "--shots") shots = argv[++i].split(",");
}
const wants = (shot: string) => !shots || shots.includes(shot);
mkdirSync(out, { recursive: true });

const SLOW = 120_000;
type HallWindow = Window & {
  __hq: {
    store: { getState: () => { phase: string; activeRoom: string | null; closeRoom: () => void } };
    rover: { x: number; z: number };
    probes: { hallPremium?: { state: string; wake: Record<string, number> } };
    hall?: { loadPremium(): Promise<unknown> };
  };
};

async function waitFor(what: string, check: () => Promise<boolean>, timeout = SLOW) {
  const end = Date.now() + timeout;
  while (!(await check())) {
    if (Date.now() > end) throw new Error(`hall shots: timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 250));
  }
}

async function settle(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  await waitForCameraSettle(page, { timeout: SLOW });
  await waitForFrames(page, 30);
}

/** Closes the drawer a pad opened, keeping the rover on the pad. */
async function closeDrawer(page: Page) {
  await page.evaluate(() => {
    const s = (window as unknown as HallWindow).__hq.store.getState();
    if (s.phase === "room") s.closeRoom();
  });
  await waitForPhase(page, "explore", SLOW);
}

/** Pins the drawn camera at `from` looking at `at` (the Director keeps writing its own pose; the pin wins). */
async function pinView(page: Page, from: [number, number, number], at: [number, number, number], fov = 50) {
  await page.evaluate(
    ({ from, at, fov }) => {
      type V = { set(x: number, y: number, z: number): V; copy(v: V): V };
      type Cam = { position: V; fov: number; lookAt(x: number, y: number, z: number): void; updateProjectionMatrix(): void };
      const w = window as unknown as { __hq: { render: { camera: Cam } }; __pin?: { copy: Cam["position"]["copy"]; lookAt: Cam["lookAt"] } };
      const cam = w.__hq.render.camera;
      // The first pin keeps the camera's own methods, so a second pin can move it again.
      w.__pin ??= { copy: cam.position.copy, lookAt: cam.lookAt };
      cam.position.copy = w.__pin.copy;
      cam.position.set(...from);
      w.__pin.lookAt.call(cam, ...at);
      cam.position.copy = function () {
        return this;
      };
      cam.lookAt = () => {};
      Object.defineProperty(cam, "fov", { get: () => fov, set: () => {}, configurable: true });
      cam.updateProjectionMatrix();
    },
    { from, at, fov },
  );
}

async function premiumReady(page: Page) {
  const has = await page.evaluate(() => Boolean((window as unknown as HallWindow).__hq.hall));
  if (!has) return;
  await page.evaluate(() => (window as unknown as HallWindow).__hq.hall!.loadPremium());
  await waitFor("the hall interiors", () => page.evaluate(() => (window as unknown as HallWindow).__hq.probes.hallPremium?.state === "ready"));
}

async function wakeOf(page: Page, station: string): Promise<number> {
  return page.evaluate((s) => (window as unknown as HallWindow).__hq.probes.hallPremium?.wake[s] ?? 1, station);
}

const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
for (const combo of COMBOS) {
  const key = `${combo.tier}-${combo.width}x${combo.height}`;
  if (only && !only.includes(key)) continue;
  const context = await browser.newContext({ viewport: { width: combo.width, height: combo.height }, deviceScaleFactor: 1, isMobile: combo.mobile, hasTouch: combo.mobile });
  const page = await context.newPage();
  page.on("pageerror", (e) => console.error(`[${key}] pageerror`, e.message));
  page.on("console", (m) => {
    if (m.type() === "error") console.error(`[${key}] console`, m.text());
  });
  await asReturningVisitor(page);
  await skipFloorLines(page);
  await page.goto(`${base}/en?tier=${combo.tier}`);
  await waitForHQ(page);
  await waitForPhase(page, "explore", SLOW);
  await waitForSceneLive(page, SLOW);
  const name = (shot: string) => join(out, `${shot}-${key}.png`);
  const lead = HALL.lead[0].z;

  if (wants("office")) {
    await driveTo(page, LOBBY.officeWing.stop, SLOW);
    await settle(page);
    await turnCameraTo(page, yawLooking({ x: 1, z: 0 }), SLOW);
    await waitForFrames(page, 20);
    await page.screenshot({ path: name("office-plaza-east") });
    await turnCameraTo(page, 0, SLOW);
  }
  if (wants("gate")) {
    await driveTo(page, { x: HALL.lead[0].x, z: lead }, SLOW);
    await settle(page);
    await turnCameraTo(page, yawLooking({ x: 1, z: 0 }), SLOW);
    await waitForFrames(page, 30);
    await page.screenshot({ path: name("gate") });
  }
  if (wants("walk")) {
    await driveTo(page, { x: HALL.gate.x + 4, z: lead }, SLOW);
    await settle(page);
    await turnCameraTo(page, yawLooking({ x: 1, z: 0 }), SLOW);
    await waitForFrames(page, 30);
    await page.screenshot({ path: name("walk-in") });
  }
  await premiumReady(page);
  for (const station of HIGHLIGHT_STATIONS) {
    if (!wants(station)) continue;
    const s = stationOf(station);
    await turnCameraTo(page, 0, SLOW);
    // Before: 2.5 u in front of the pad (in the station's camera zone, off the pad).
    await driveTo(page, { x: s.pad.x - s.facing.x * 2.5, z: s.pad.z - s.facing.z * 2.5 }, SLOW);
    await settle(page);
    await waitFor(`${station} asleep`, async () => (await wakeOf(page, station)) < 0.05);
    await page.screenshot({ path: name(`${station}-before`) });
    // After: on the pad (the drawer opens), the drawer closed again, the wake settled.
    await driveTo(page, s.pad, SLOW);
    await page
      .waitForFunction((r) => (window as unknown as HallWindow).__hq.store.getState().activeRoom === r, highlightRoom(station), { timeout: 30_000 })
      .catch(() => null);
    await closeDrawer(page);
    await settle(page);
    await waitFor(`${station} awake`, async () => (await wakeOf(page, station)) > 0.95);
    await waitForFrames(page, 20);
    await page.screenshot({ path: name(`${station}-after`) });
    // Off the pad again, so the next drive starts from open floor.
    await driveTo(page, { x: s.pad.x - s.facing.x * 2.5, z: s.pad.z - s.facing.z * 2.5 }, SLOW);
  }
  // The centrepieces from the follow camera: the rover 9 u south of the Impact Orbit and 9 u north of the Signal Spire, facing them.
  const P = HALL.plaza;
  const S = HALL.lead[0].z + 6;
  for (const [shot, z, look] of [
    ["orbit", (P.z - P.d / 2 + S) / 2 + 12, { x: 0, z: -1 }],
    ["spire", (S + P.z + P.d / 2) / 2 - 11, { x: 0, z: 1 }],
  ] as const) {
    if (!wants(shot)) continue;
    await driveTo(page, { x: P.x - 4, z }, SLOW);
    await settle(page);
    await turnCameraTo(page, yawLooking(look), SLOW);
    await waitForFrames(page, 30);
    await page.screenshot({ path: name(shot) });
    await turnCameraTo(page, 0, SLOW);
  }
  if (wants("overview")) {
    await pinView(page, [24, 26, 72], [53, 0, 14], combo.mobile ? 70 : 50);
    await waitForFrames(page, 30);
    await page.screenshot({ path: name("overview-south") });
    await pinView(page, [26, 22, -40], [54, 0, 20], combo.mobile ? 70 : 50);
    await waitForFrames(page, 30);
    await page.screenshot({ path: name("overview-north") });
  }
  await context.close();
  console.log(`hall shots: ${key} done`);
}
await browser.close();
