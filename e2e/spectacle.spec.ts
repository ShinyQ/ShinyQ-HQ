import { expect, test, type Page } from "@playwright/test";
import { skipFloorLines, chooseMotion, collectErrors, driveTo, enterFloorRoute, targetPoint, visibleTarget, waitForCameraSettle, waitForFrames, waitForRoom, fastAnimations, realAnimations } from "./hq";

// Rides, drives, camera eases and the intro at the test-only animation speed (render-peak windows measure at real speed).
test.beforeEach(({ context }) => fastAnimations(context));

/**
 * Spectacle round, Session B (docs/superpowers/specs/2026-10-13-spectacle-floor-ends-hall-design.md):
 * floor words float as camera-facing signs, the L3 reactor core sits in the east plaza with routes
 * around it, and every effect stands still under reduced motion.
 */

test.describe.configure({ timeout: 180_000 });

type Rect = { minX: number; maxX: number; minZ: number; maxZ: number };
type SpectacleWindow = {
  __hq: {
    probes: { signs: Record<string, { text: string; facing: number }[]>; spectacle: Record<string, number>; flatText: () => string[] };
    layouts: Record<string, { tall?: (Rect & { h: number })[]; stops?: Record<string, { x: number; z: number }> }>;
    rover: { x: number; z: number; speed: number; cameraYaw: number; autopilot: { point: { x: number; z: number }; state: string } | null };
    store: { getState: () => { reducedMotion: boolean } };
  };
};

async function signs(page: Page, name: string) {
  return page.evaluate((n) => (window as unknown as SpectacleWindow).__hq.probes.signs[n] ?? [], name);
}

/** Every sign of the group faces the camera square (never edge on, never its back). */
async function expectSignsFaceCamera(page: Page, name: string, min = 1) {
  await expect.poll(async () => (await signs(page, name)).length, { message: `${name} signs drawn` }).toBeGreaterThanOrEqual(min);
  for (const s of await signs(page, name)) expect(s.facing, `${name}: ${s.text}`).toBeGreaterThan(0.98);
}

async function rotateCamera(page: Page, key: "q" | "e", ms: number) {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
  await waitForCameraSettle(page);
}

/** No troika text lies flat on the floor (the L1 hall sign floats on the gateway arch since the gallery rebuild). */
async function expectNoFlatText(page: Page) {
  const flat = await page.evaluate(() => (window as unknown as SpectacleWindow).__hq.probes.flatText());
  expect(flat).toEqual([]);
}

// The renderer check of the facing on one floor (the L3 reactor signs); `tests/unit/floor-sign-facing.test.ts` checks the
// L2 Workshop signs and the L4 timeline signs from the same poses without a renderer.
test("L3: floor words float as signs that face the camera from the default and a rotated view", async ({ page }) => {
  const errors = collectErrors(page);
  await enterFloorRoute(page, "/en/labs");
  await waitForCameraSettle(page);
  await expectNoFlatText(page);
  await expectSignsFaceCamera(page, "labs-reactor-signs", 2);
  await rotateCamera(page, "e", 1600);
  await expectSignsFaceCamera(page, "labs-reactor-signs", 2);
  await rotateCamera(page, "q", 3200);
  await expectSignsFaceCamera(page, "labs-reactor-signs", 2);
  expect(errors).toEqual([]);
});

// The live scene of every other floor with words: no troika text lies flat (the source scan is tests/unit/floor-text.test.ts).
for (const [floor, path, where] of [
  ["L2", "/en/journey", "the Career Road"],
  ["L4", "/en/library", "the Writing floor"],
  ["RF", "/en/contact", "the roof deck"],
] as const) {
  test(`${floor}: no words lie flat on ${where}`, async ({ page }) => {
    await enterFloorRoute(page, path);
    await waitForCameraSettle(page);
    await expectNoFlatText(page);
  });
}

/** The reactor core's footprint (the L3 tall column east of the pods). */
async function coreRect(page: Page): Promise<Rect> {
  const core = await page.evaluate(() => (window as unknown as SpectacleWindow).__hq.layouts.L3.tall?.find((t) => t.minX > 60));
  expect(core).toBeTruthy();
  return core!;
}

/** Starts sampling the rover's distance to `core` every frame; `stop()` returns the closest it came. */
async function sampleCore(page: Page, core: Rect) {
  await page.evaluate((c) => {
    const w = window as unknown as SpectacleWindow & { __coreMin?: number; __coreStop?: boolean };
    w.__coreMin = Infinity;
    w.__coreStop = false;
    const tick = () => {
      const r = w.__hq.rover;
      const dx = Math.max(c.minX - r.x, 0, r.x - c.maxX);
      const dz = Math.max(c.minZ - r.z, 0, r.z - c.maxZ);
      w.__coreMin = Math.min(w.__coreMin!, Math.hypot(dx, dz));
      if (!w.__coreStop) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, core);
  return async () =>
    page.evaluate(() => {
      const w = window as unknown as { __coreMin: number; __coreStop: boolean };
      w.__coreStop = true;
      return w.__coreMin;
    });
}

test("L3 reactor core: autopilot across the east plaza drives around it", async ({ page }) => {
  // The closest approach is sampled frame by frame along the drive: real speed.
  await realAnimations(page);
  await enterFloorRoute(page, "/en/labs");
  const core = await coreRect(page);
  const cx = (core.minX + core.maxX) / 2;
  await driveTo(page, { x: cx - 9, z: 0 }, 120_000);
  const stop = await sampleCore(page, core);
  await driveTo(page, { x: cx + 9, z: 1 }, 120_000);
  const min = await stop();
  const end = await page.evaluate(() => (window as unknown as SpectacleWindow).__hq.rover);
  expect(Math.hypot(end.x - (cx + 9), end.z - 1)).toBeLessThan(2);
  // The rover (radius 1) never touched the core.
  expect(min).toBeGreaterThanOrEqual(0.9);
});

test("L3 reactor core: point-and-go to a pod beyond it drives around it and opens the pod", async ({ page }) => {
  // The closest approach is sampled frame by frame along the drive: real speed.
  await realAnimations(page);
  // No first-visit floor line: its text box would sit over the middle of the view.
  await skipFloorLines(page);
  await enterFloorRoute(page, "/en/labs");
  const core = await coreRect(page);
  // The Tech Reactor stop on the ring road's east point has its own view zone: the camera stands east of
  // the rover and looks west over the core at the pods of both wings. (From the ring's south point the
  // core and its rings fill the default view, so whether a pod showed depended on where the rover stopped.)
  const stop = await page.evaluate(() => (window as unknown as SpectacleWindow).__hq.layouts.L3.stops?.["L3:reactor"]);
  expect(stop).toBeTruthy();
  await driveTo(page, stop!, 120_000);
  // Wait on the zone's framing (yaw PI/4, any full turn), not on time.
  const offZoneYaw = () =>
    page.evaluate(() => {
      const d = (window as unknown as SpectacleWindow).__hq.rover.cameraYaw - Math.PI / 4;
      return Math.abs(Math.atan2(Math.sin(d), Math.cos(d)));
    });
  await expect.poll(offZoneYaw, { timeout: 30_000 }).toBeLessThan(0.01);
  await waitForCameraSettle(page);
  const target = await visibleTarget(page, { kinds: ["door"] });
  // The pod lies beyond the core: the rover is on its east side and every pod docks west of it.
  expect(target.at.x).toBeLessThan(core.minX);
  const sample = await sampleCore(page, core);
  const p = await targetPoint(page, target.id);
  await page.mouse.click(p.x, p.y);
  await waitForRoom(page, target.action.room!);
  expect(await sample()).toBeGreaterThanOrEqual(0.9);
});

test("reduced motion: the reactor, waterfalls and the L2 horizon stand still", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await chooseMotion(page, "system");
  await enterFloorRoute(page, "/en/labs");
  await expect.poll(() => page.evaluate(() => (window as unknown as SpectacleWindow).__hq.store.getState().reducedMotion)).toBe(true);
  const read = () => page.evaluate(() => ({ ...(window as unknown as SpectacleWindow).__hq.probes.spectacle }));
  await expect.poll(async () => Object.keys(await read()).length).toBeGreaterThanOrEqual(3);
  const before = await read();
  await waitForFrames(page, 30, 500);
  expect(await read()).toEqual(before);

  await enterFloorRoute(page, "/en/journey");
  // The Horizon mounts with the Career Road, a few seconds after the first frame on a CI runner.
  await expect.poll(async () => (await read())["horizon.time"], { timeout: 30_000 }).toBeDefined();
  const l2 = await read();
  await waitForFrames(page, 30, 500);
  expect((await read())["horizon.time"]).toBe(l2["horizon.time"]);
});

test("full motion: the reactor spins and the waterfalls flow", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await enterFloorRoute(page, "/en/labs");
  const read = () => page.evaluate(() => ({ ...(window as unknown as SpectacleWindow).__hq.probes.spectacle }));
  await expect.poll(async () => (await read())["reactor.spin"]).toBeDefined();
  const before = await read();
  await waitForFrames(page, 30, 500);
  const after = await read();
  expect(after["reactor.spin"]).toBeGreaterThan(before["reactor.spin"]);
  expect(after["waterfall.time"]).toBeGreaterThan(before["waterfall.time"]);
});
