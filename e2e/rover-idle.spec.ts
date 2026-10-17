import { expect, test, type Page } from "@playwright/test";
import { chooseMotion, enterHQ, waitForFrames, waitForRoom } from "./hq";

/**
 * Rover idle behaviour (src/experience/rover/idle.ts): after a still spell the rover looks around, blinks,
 * hops or spins and beeps once; any input stops it at once; reduced motion keeps only the blinks; no idle
 * while a room is open. `idleDelay` is infinite under webdriver, so each test opts in with a short delay and
 * restarts the wait with a pointer move.
 */
test.describe.configure({ timeout: 90_000 });

type IdleProbe = { idle: string | null; idleYaw: number; idleSpin: number; idleDelay: number; drawCalls: number };
type IdleWindow = Window & { __hq: { rover: IdleProbe }; __idle: IdleLog };
type IdleLog = { actions: string[]; maxYaw: number; maxSpin: number; maxDraw: number; frames: number };

const live = (page: Page) => page.evaluate(() => (window as unknown as IdleWindow).__hq.rover);

/** Logs the idle probes of every rendered frame (the store only mirrors every 0.1 s). */
async function trackIdle(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as IdleWindow;
    w.__idle = { actions: [], maxYaw: 0, maxSpin: 0, maxDraw: 0, frames: 0 };
    const tick = () => {
      const r = w.__hq.rover;
      const log = w.__idle;
      log.frames += 1;
      if (r.idle && !log.actions.includes(r.idle)) log.actions.push(r.idle);
      log.maxYaw = Math.max(log.maxYaw, Math.abs(r.idleYaw));
      log.maxSpin = Math.max(log.maxSpin, Math.abs(r.idleSpin));
      log.maxDraw = Math.max(log.maxDraw, r.drawCalls);
      requestAnimationFrame(tick);
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

  await expect.poll(async () => (await live(page)).idle, { timeout: 30_000 }).not.toBeNull();
  await expect
    .poll(async () => {
      const r = await live(page);
      return Math.max(Math.abs(r.idleYaw), Math.abs(r.idleSpin));
    }, { timeout: 30_000 })
    .toBeGreaterThan(0.05);

  // Infinite again, so no second sequence starts while the stop is measured.
  await page.evaluate(() => {
    (window as unknown as IdleWindow).__hq.rover.idleDelay = Number.POSITIVE_INFINITY;
  });
  await page.keyboard.press("Shift");
  await expect.poll(async () => (await live(page)).idle, { timeout: 10_000 }).toBeNull();
  await expect
    .poll(async () => {
      const r = await live(page);
      return Math.max(Math.abs(r.idleYaw), Math.abs(r.idleSpin));
    }, { timeout: 10_000 })
    .toBeLessThan(1e-3);

  const seen = await log();
  expect(seen.actions.length).toBeGreaterThan(0);
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
  await startIdling(page);

  // A bounded window sampled on every rendered frame: nothing may start while the drawer is open.
  await page.evaluate(() => new Promise<void>((done) => setTimeout(done, 3000)));
  const seen = await log();
  expect(seen.frames).toBeGreaterThan(5);
  expect(seen.actions).toEqual([]);
  expect(seen.maxYaw).toBe(0);
  expect(seen.maxSpin).toBe(0);
});
