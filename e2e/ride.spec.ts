import { expect, test, type Page } from "@playwright/test";
import { enterHQ, waitForFloor } from "./hq";

/**
 * Elevator ride smoothness (R5 P6, owner report from a Windows PC): long frames pause the ride
 * instead of skipping the dolly. Samples the car height on every rendered frame through `window.__hq`
 * (the sampler's rAF callback runs after R3F's, so each sample is one rendered frame).
 */
test.describe.configure({ timeout: 300_000 });

type Sample = { stage: string | null; y: number; t: number };
export type RideSummaryLike = { held: number; timedOut: boolean; programs: number; distinctY: number; dollyFrames: number; maxStep: number };
type RideWindow = Window & {
  __hq: {
    store: { getState: () => { ride: { stage: string } | null } };
    rover: { y: number };
    ridePrep?: { lastRide: RideSummaryLike | null };
  };
  __rideSamples: Sample[];
};

async function sampleCar(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as RideWindow;
    w.__rideSamples = [];
    const tick = () => {
      const ride = w.__hq.store.getState().ride;
      w.__rideSamples.push({ stage: ride?.stage ?? null, y: w.__hq.rover.y, t: performance.now() });
      if (w.__rideSamples.length < 50_000) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  return () => page.evaluate(() => (window as unknown as RideWindow).__rideSamples);
}

/** Car heights while the dolly runs, the biggest jump between two of them, and the ride's wall time. */
function analyse(samples: Sample[]) {
  const moving = samples.filter((s) => s.stage === "moving").map((s) => s.y);
  const steps = moving.slice(1).map((y, i) => Math.abs(y - moving[i]));
  const ridden = samples.filter((s) => s.stage !== null && s.stage !== "toDoor");
  return {
    stages: [...new Set(samples.map((s) => s.stage).filter((s): s is string => s !== null))],
    movingFrames: moving.length,
    distinctY: new Set(moving.map((y) => y.toFixed(3))).size,
    maxStep: steps.length ? Math.max(...steps) : 0,
    rideMs: ridden.length ? ridden[ridden.length - 1].t - ridden[0].t : 0,
  };
}

async function rideTo(page: Page, floor: string, timeout: number) {
  await page.getByRole("navigation", { name: "Elevator" }).locator(`[data-floor="${floor}"]`).click();
  await waitForFloor(page, floor, timeout);
}

const lastRide = (page: Page) => page.evaluate(() => (window as unknown as RideWindow).__hq.ridePrep?.lastRide ?? null);

test("the first ride to an unvisited floor animates the dolly under a 6x CPU throttle", async ({ page }) => {
  test.slow();
  await enterHQ(page);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 6 });
  const samples = await sampleCar(page);
  try {
    await rideTo(page, "L3", 240_000);
  } finally {
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    await cdp.detach();
  }
  const ride = analyse(await samples());
  console.log(`ride L1 to L3 at 6x: ${JSON.stringify(ride)} last=${JSON.stringify(await lastRide(page))}`);
  // L1 to L3 is 28 u. Skipping 0.25 s frames shows 4 to 9 heights; the capped clock shows at least 16.
  expect(ride.distinctY).toBeGreaterThanOrEqual(12);
  expect(ride.maxStep).toBeLessThanOrEqual(0.25 * 28);
  // Never faster than the nominal 2.25 s of stages (the clock only slows down), never stuck.
  expect(ride.rideMs).toBeGreaterThanOrEqual(2100);
  expect(ride.rideMs).toBeLessThan(60_000);
});

test("reduced motion keeps the 150 ms cut", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await enterHQ(page);
  const samples = await sampleCar(page);
  await rideTo(page, "L2", 60_000);
  const ride = analyse(await samples());
  expect(ride.stages).toEqual(["toDoor", "moving"]);
  expect(ride.distinctY).toBeLessThanOrEqual(2);
});

test("the car waits for the new floor with the doors closed, then compiles nothing while it moves", async ({ page }) => {
  await enterHQ(page);
  await rideTo(page, "L3", 90_000);
  const last = await lastRide(page);
  console.log(`ride L1 to L3: ${JSON.stringify(last)}`);
  expect(last).not.toBeNull();
  expect(last!.timedOut).toBe(false);
  expect(last!.programs).toBe(0);
  expect(last!.distinctY).toBeGreaterThanOrEqual(12);
});
