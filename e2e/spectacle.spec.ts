import { expect, test, type Page } from "@playwright/test";
import { skipFloorLines, chooseMotion, collectErrors, driveTo, enterFloorRoute, targetPoint, visibleTarget, waitForCameraSettle, waitForFrames, waitForRoom } from "./hq";

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

for (const [floor, path, group, min, at] of [
  ["L2", "/en/journey", "career-year-markers", 1, null],
  ["L3", "/en/labs", "labs-wing-signs", 2, null],
  // L4 signs are placed on screen (Round 7 F): only signs in the frame draw. The arrival frames none since the
  // section signs hang over the back of each zone's first desk (the posts sign sits at the camera's foot), so
  // the check runs mid-timeline, where the year plates and the nearest titles are in view.
  ["L4", "/en/library", "library-signs", 1, { x: 24, z: 0 }],
] as const) {
  test(`${floor}: floor words float as signs that face the camera from the default and a rotated view`, async ({ page }) => {
    const errors = collectErrors(page);
    await enterFloorRoute(page, path);
    if (at) await driveTo(page, at);
    await waitForCameraSettle(page);
    await expectNoFlatText(page);
    await expectSignsFaceCamera(page, group, min);
    await rotateCamera(page, "e", 1600);
    await expectSignsFaceCamera(page, group, min);
    await rotateCamera(page, "q", 3200);
    await expectSignsFaceCamera(page, group, min);
    expect(errors).toEqual([]);
  });
}

test("RF: no words lie flat on the roof deck", async ({ page }) => {
  await enterFloorRoute(page, "/en/contact");
  await waitForCameraSettle(page);
  await expectNoFlatText(page);
});

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
