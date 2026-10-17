import { expect, test, type Page } from "@playwright/test";
import { chooseMotion, enterHQ, waitForFrames, waitForRoom } from "./hq";

/**
 * Rover idle behaviour (src/experience/rover/idle.ts): after a still spell the rover looks around, blinks,
 * hops or spins and beeps once; any input stops it at once; reduced motion keeps only the blinks; no idle
 * while a room is open. `idleDelay` is infinite under webdriver, so each test opts in with a short delay and
 * restarts the wait with a pointer move.
 */
test.describe.configure({ timeout: 90_000 });

type IdleProbe = { idle: string | null; idleYaw: number; idleSpin: number; idleDelay: number; drawCalls: number; speed: number };
type IdleWindow = Window & { __hq: { rover: IdleProbe; frames: () => number; clock: () => number }; __idle: IdleLog };
type IdleLog = { actions: string[]; maxYaw: number; maxSpin: number; maxDraw: number; frames: number };

const live = (page: Page) => page.evaluate(() => (window as unknown as IdleWindow).__hq.rover);

/** Logs the idle probes of every rendered 3D frame (the store only mirrors every 0.1 s); `frames` counts 3D frames, not page animation frames. */
async function trackIdle(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as IdleWindow;
    w.__idle = { actions: [], maxYaw: 0, maxSpin: 0, maxDraw: 0, frames: 0 };
    let lastFrame = w.__hq.frames();
    const tick = () => {
      requestAnimationFrame(tick);
      const r = w.__hq.rover;
      const log = w.__idle;
      const frame = w.__hq.frames();
      if (frame === lastFrame) return;
      log.frames += frame - lastFrame;
      lastFrame = frame;
      if (r.idle && !log.actions.includes(r.idle)) log.actions.push(r.idle);
      log.maxYaw = Math.max(log.maxYaw, Math.abs(r.idleYaw));
      log.maxSpin = Math.max(log.maxSpin, Math.abs(r.idleSpin));
      log.maxDraw = Math.max(log.maxDraw, r.drawCalls);
    };
    requestAnimationFrame(tick);
  });
  return () => page.evaluate(() => (window as unknown as IdleWindow).__idle);
}

/** Opts into idling with a 1 s wait; the pointer move restarts the wait with the new delay. */
async function startIdling(page: Page) {
  await page.evaluate(() => {
    (window as unknown as IdleWindow).__hq.rover.idleDelay = 1;
  });
  await page.mouse.move(300, 300);
  await page.mouse.move(310, 310);
}

async function settledRover(page: Page) {
  await enterHQ(page);
  await waitForFrames(page, 30);
  await expect.poll(async () => (await live(page)).idle).toBeNull();
}

test("the rover idles after a still spell, and any input stops it at once", async ({ page }) => {
  await settledRover(page);
  const rest = (await live(page)).drawCalls;
  const log = await trackIdle(page);
  await startIdling(page);

  // Waits on state, per frame, for the rover to be mid-look or mid-spin, so the press interrupts a live sequence.
  const midIdle = await page
    .waitForFunction(
      () => {
        const rover = (window as unknown as IdleWindow).__hq.rover;
        if (rover.idle === null || Math.max(Math.abs(rover.idleYaw), Math.abs(rover.idleSpin)) <= 0.1) return false;
        return { idle: rover.idle, yaw: rover.idleYaw, spin: rover.idleSpin };
      },
      undefined,
      { polling: "raf", timeout: 30_000 },
    )
    .catch(() => {
      throw new Error("the rover never reached a look or spin within 30 s of idling");
    });
  const before = (await midIdle.jsonValue()) as { idle: string | null; yaw: number; spin: number };
  expect(before.idle, "the rover was idling before the press").not.toBeNull();
  expect(Math.max(Math.abs(before.yaw), Math.abs(before.spin))).toBeGreaterThan(0.1);

  // Infinite again, so no second sequence starts while the stop is measured. "x" is bound to no intent.
  await page.evaluate(() => {
    (window as unknown as IdleWindow).__hq.rover.idleDelay = Number.POSITIVE_INFINITY;
  });
  await page.keyboard.press("x");
  await waitForFrames(page, 30);
  const after = await live(page);
  expect(after.idle, "input stops the idle at once").toBeNull();
  expect(Math.abs(after.idleYaw)).toBeLessThan(0.05);
  expect(Math.abs(after.idleSpin)).toBeLessThan(0.05);
  expect(after.speed, "the key did not drive the rover").toBeLessThan(0.01);

  const seen = await log();
  expect(seen.maxDraw, "the idle pose adds no draw calls").toBeLessThanOrEqual(rest + 1);
});

test("reduced motion idles with blinks only", async ({ page }) => {
  await chooseMotion(page, "reduced");
  await settledRover(page);
  const log = await trackIdle(page);
  await startIdling(page);

  await expect.poll(async () => (await log()).actions, { timeout: 30_000 }).toContain("blink");
  // The sequence ends with the rover back to not idling.
  await expect.poll(async () => (await live(page)).idle, { timeout: 30_000 }).toBeNull();
  const seen = await log();
  expect(seen.actions).toEqual(["blink"]);
  expect(seen.maxYaw).toBe(0);
  expect(seen.maxSpin).toBe(0);
});

test("a room open in the drawer keeps the rover from idling", async ({ page }) => {
  await settledRover(page);
  await page.evaluate(() => (window as unknown as { __hq: { store: { getState: () => { openRoom: (r: string) => void } } } }).__hq.store.getState().openRoom("L1:stats"));
  await waitForRoom(page, "L1:stats");
  await waitForFrames(page, 10);
  const log = await trackIdle(page);
  const start = await page.evaluate(() => {
    const hq = (window as unknown as IdleWindow).__hq;
    return { frames: hq.frames(), clock: hq.clock() };
  });
  await startIdling(page);
  const { idleDelay } = await live(page);

  // Waits on the R3F clock (not wall time) until it is 2 s past the idle delay.
  // A drawer covering over 90% of the canvas would pause the 3D loop, so this fails loudly instead of passing vacuously.
  const target = start.clock + idleDelay + 2;
  await expect
    .poll(async () => page.evaluate(() => (window as unknown as IdleWindow).__hq.clock()), {
      message: "the 3D loop did not advance with the drawer open (paused by the cover watch?)",
      timeout: 60_000,
    })
    .toBeGreaterThanOrEqual(target);
  const end = await page.evaluate(() => (window as unknown as IdleWindow).__hq.frames());
  expect(end - start.frames, "3D frames rendered while the drawer was open").toBeGreaterThan(0);
  const seen = await log();
  expect(seen.frames, "the logger saw 3D frames").toBeGreaterThan(0);
  expect(seen.actions).toEqual([]);
  expect(seen.maxYaw).toBe(0);
  expect(seen.maxSpin).toBe(0);
});
