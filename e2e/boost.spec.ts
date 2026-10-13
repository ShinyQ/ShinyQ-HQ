import { expect, test, type Page } from "@playwright/test";
import { asReturningVisitor, collectErrors, enterHQ, waitForCameraSettle, waitForFloor, waitForFrames, waitForHQ, waitForPhase, waitForSceneLive } from "./hq";

/**
 * Realistic boost (owner pick: "Full package: path-following light trails, rover leans and squats,
 * camera widens and pulls back, speed streaks, wheel sparks") and the touch boost toggle (owner: tap
 * on, tap off). Shift stays hold-to-boost on keyboards.
 */
test.describe.configure({ timeout: 150_000 });

type Fx = { speed: number; trail: number; streaks: number; sparks: number; boostFx: number; boostFov: number; boostPull: number; squat: number };

/** Records the peaks of the boost probes over every rendered frame (the store only syncs every 0.1 s). */
async function trackFx(page: Page) {
  await page.evaluate(() => {
    type R = { speed: number; trail: number; streaks: number; sparks: number; boostFx: number; boostFov: number; boostPull: number; boostPitch: number };
    const w = window as unknown as { __hq: { rover: R }; __fx: Record<string, number> };
    w.__fx = { speed: 0, trail: 0, streaks: 0, sparks: 0, boostFx: 0, boostFov: 0, boostPull: 1, squat: 0 };
    const tick = () => {
      const r = w.__hq.rover;
      const f = w.__fx;
      f.speed = Math.max(f.speed, r.speed);
      f.trail = Math.max(f.trail, r.trail);
      f.streaks = Math.max(f.streaks, r.streaks);
      f.sparks = Math.max(f.sparks, r.sparks);
      f.boostFx = Math.max(f.boostFx, r.boostFx);
      f.boostFov = Math.max(f.boostFov, r.boostFov);
      f.boostPull = Math.max(f.boostPull, r.boostPull);
      f.squat = Math.max(f.squat, -r.boostPitch);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  return () => page.evaluate(() => (window as unknown as { __fx: Fx }).__fx);
}

const liveFx = (page: Page) => page.evaluate(() => (window as unknown as { __hq: { rover: { boostFx: number; boostFov: number } } }).__hq.rover);

/** Real touch input through CDP (40 ms apart, so SwiftShader frames do not slow the gesture). */
async function holdTouch(page: Page, points: { x: number; y: number }[], holdMs: number) {
  const cdp = await page.context().newCDPSession(page);
  const [first, ...rest] = points;
  let timestamp = Date.now() / 1000;
  const next = () => (timestamp += 0.04);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [first], timestamp });
  for (const p of rest) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [p], timestamp: next() });
  await page.waitForTimeout(holdMs);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [], timestamp: Date.now() / 1000 });
  await cdp.detach();
}

test.describe("boost effects on keyboards", () => {
  test("holding Shift shows the trails, streaks and sparks, kicks the camera and squats the body; release clears them", async ({ page }) => {
    const errors = collectErrors(page);
    await enterHQ(page);
    await waitForCameraSettle(page);
    expect((await liveFx(page)).boostFx).toBe(0);
    const fx = await trackFx(page);
    // S drives toward the camera: open floor between the spawn and the south-east corner.
    await page.keyboard.down("Shift");
    await page.keyboard.down("s");
    await expect.poll(async () => (await fx()).sparks, { timeout: 30_000 }).toBeGreaterThan(0);
    await page.keyboard.up("s");
    await page.keyboard.up("Shift");
    const peak = await fx();
    expect(peak.trail).toBeGreaterThan(0);
    expect(peak.streaks).toBeGreaterThan(0);
    expect(peak.boostFx).toBe(3);
    expect(peak.boostFov).toBeGreaterThan(3);
    expect(peak.boostFov).toBeLessThanOrEqual(8);
    expect(peak.boostPull).toBeGreaterThan(1);
    expect(peak.squat).toBeGreaterThan(0);
    // Small angles only: at most 3.5 degrees nose up.
    expect(peak.squat).toBeLessThanOrEqual((3.5 * Math.PI) / 180 + 1e-6);
    await expect.poll(async () => (await liveFx(page)).boostFx, { timeout: 15_000 }).toBe(0);
    await expect.poll(async () => (await liveFx(page)).boostFov, { timeout: 15_000 }).toBe(0);
    expect(errors).toEqual([]);
  });

  test("reduced motion boosts without trails, streaks, sparks, camera kick or squat", async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: "reduce" });
    const page = await context.newPage();
    await asReturningVisitor(page);
    await page.goto("/en?tier=lite");
    await waitForHQ(page);
    await waitForPhase(page, "explore", 30_000);
    await waitForSceneLive(page);
    const fx = await trackFx(page);
    await page.keyboard.down("Shift");
    await page.keyboard.down("s");
    await expect.poll(async () => (await fx()).speed, { timeout: 20_000 }).toBeGreaterThan(12);
    await page.keyboard.up("s");
    await page.keyboard.up("Shift");
    const peak = await fx();
    expect(peak).toMatchObject({ trail: 0, streaks: 0, sparks: 0, boostFx: 0, boostFov: 0, boostPull: 1, squat: 0 });
    await context.close();
  });
});

for (const vp of [
  { name: "phone", width: 390, height: 844 },
  { name: "tablet", width: 820, height: 1180 },
]) {
  test.describe(`boost toggle on a ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });

    test("a tap turns boost on and it stays on while driving; the next tap turns it off; a floor change resets it", async ({ page }) => {
      const errors = collectErrors(page);
      await enterHQ(page);
      await waitForCameraSettle(page);
      const boost = page.getByTestId("boost");
      await expect(boost).toHaveAttribute("aria-pressed", "false");
      await boost.tap();
      await expect(boost).toHaveAttribute("aria-pressed", "true");
      // On but parked: boost only applies while driving by hand.
      await waitForFrames(page, 20);
      expect((await liveFx(page)).boostFx).toBe(0);

      const fx = await trackFx(page);
      const box = (await page.getByTestId("joystick").boundingBox())!;
      const c = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      // Joystick down: drive toward the camera, onto open floor.
      await holdTouch(page, [c, { x: c.x, y: c.y + 30 }, { x: c.x, y: c.y + 55 }], 2500);
      const peak = await fx();
      expect(peak.speed).toBeGreaterThan(9);
      expect(peak.trail).toBeGreaterThan(0);
      expect(peak.boostFx).toBeGreaterThan(0);
      // Still on after the joystick is released, with no effects once the rover stops.
      await expect(boost).toHaveAttribute("aria-pressed", "true");
      await expect.poll(async () => (await liveFx(page)).boostFx, { timeout: 15_000 }).toBe(0);

      await boost.tap();
      await expect(boost).toHaveAttribute("aria-pressed", "false");

      await boost.tap();
      await expect(boost).toHaveAttribute("aria-pressed", "true");
      await page.keyboard.press("PageUp");
      await waitForFloor(page, "L2");
      await expect(boost).toHaveAttribute("aria-pressed", "false");
      expect(errors).toEqual([]);
    });
  });
}
