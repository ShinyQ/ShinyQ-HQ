import { expect, test } from "@playwright/test";
import { PERF_MARKS } from "../src/lib/perf-marks";
import { asReturningVisitor, enterHQ, waitForFrames, waitForHQ, waitForPhase, waitForSceneLive } from "./hq";

/**
 * Measurement probes in the default suite (round 5 P4): the `?perf=1` overlay is there with the flag
 * and absent without it, and the timeline marks are written. The gates themselves run in the perf lane
 * (e2e/perf/, `bun run e2e:perf`).
 */
test.describe.configure({ timeout: 120_000 });

test("?perf=1 shows live numbers; without it nothing of the overlay mounts", async ({ page }) => {
  await asReturningVisitor(page);
  await page.goto("/en?tier=lite&perf=1");
  await waitForHQ(page);
  await waitForPhase(page, "explore");
  await waitForSceneLive(page);
  const overlay = page.getByTestId("perf-overlay");
  await expect(overlay).toBeVisible();
  await expect(overlay.locator("[data-perf-line='0']")).toHaveText(/^fps p50 \d+ \| p10 \d+ \| frame p95 [\d.]+ ms$/, { timeout: 30_000 });
  await expect(overlay.locator("[data-perf-line='1']")).toHaveText(/^calls \d+ scene \+ 0 post \| tris [\d.]+k$/);
  await expect(overlay.locator("[data-perf-line='3']")).toHaveText(/^tier lite \| /);
  // No ride yet: five lines. A finished ride (P6's ride stats, `__hq.ridePrep.lastRide`) adds a sixth.
  await expect(overlay.locator("[data-perf-line]")).toHaveCount(5);
  await page.evaluate(() => {
    const hq = (window as unknown as { __hq: { ridePrep: { lastRide: unknown } } }).__hq;
    hq.ridePrep.lastRide = { from: "L1", to: "L3", frames: 140, dollyFrames: 96, distinctY: 96, maxStep: 0.03, longestFrameMs: 33, held: 0.2, timedOut: false, programs: 0, elapsedMs: 2340 };
  });
  await expect(overlay.locator("[data-perf-line='5']")).toHaveText(/^ride L1 to L3 \| 96 dolly frames/);

  await page.goto("/en?tier=lite");
  await waitForHQ(page);
  await waitForSceneLive(page);
  await waitForFrames(page, 30);
  await expect(page.getByTestId("perf-overlay")).toHaveCount(0);
});

test("the 3D view writes the timeline marks", async ({ page }) => {
  await enterHQ(page);
  const marks = await page.evaluate((names) => names.map((n) => performance.getEntriesByName(n, "mark").length), [PERF_MARKS.firstFrame, PERF_MARKS.explore, PERF_MARKS.bootRelease]);
  expect(marks).toEqual([1, 1, 1]);
  const release = await page.evaluate((n) => (performance.getEntriesByName(n, "mark")[0] as PerformanceMark).detail, PERF_MARKS.bootRelease);
  expect(release).toBe("ready");
});
