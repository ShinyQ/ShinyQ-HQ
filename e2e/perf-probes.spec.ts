import { expect, test, type Page } from "@playwright/test";
import { PERF_MARKS } from "../src/lib/perf-marks";
import { parseRumPayload } from "../src/lib/rum/protocol";
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

/** Captures beacons instead of sending them (the local static server has no Functions). */
async function stubBeacon(page: Page) {
  await page.addInitScript(() => {
    const sent: { url: string; body: string }[] = [];
    (window as unknown as { __beacons: typeof sent }).__beacons = sent;
    Object.defineProperty(Navigator.prototype, "sendBeacon", {
      configurable: true,
      value: (url: string, body: string) => {
        sent.push({ url: String(url), body: String(body) });
        return true;
      },
    });
  });
}

const beacons = (page: Page) => page.evaluate(() => (window as unknown as { __beacons: { url: string; body: string }[] }).__beacons);
const leave = (page: Page) => page.evaluate(() => window.dispatchEvent(new Event("pagehide")));

test("a sampled session sends one coarse beacon when the page is left", async ({ page }) => {
  await asReturningVisitor(page);
  await stubBeacon(page);
  await page.goto("/en?tier=lite&rum=1");
  await waitForHQ(page);
  await waitForPhase(page, "explore");
  await waitForSceneLive(page);
  // The probe is a lazy chunk: keep leaving until it is mounted and has sent.
  await expect
    .poll(
      async () => {
        await leave(page);
        return (await beacons(page)).length;
      },
      { timeout: 30_000 },
    )
    .toBe(1);
  await leave(page);
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  const sent = await beacons(page);
  expect(sent).toHaveLength(1);
  expect(sent[0].url).toBe("/api/rum");
  const payload = parseRumPayload(JSON.parse(sent[0].body));
  expect(payload).not.toBeNull();
  expect(payload).toMatchObject({ v: 1, tier: "lite", path: "cover", lost: 0, timeout: 0 });
  expect(payload!.explore).not.toBe("na");
  expect(await page.evaluate(() => sessionStorage.getItem("hq:rum"))).toBe("sent");
});

test("automation is never sampled without ?rum=1", async ({ page }) => {
  await stubBeacon(page);
  await enterHQ(page);
  await waitForFrames(page, 30);
  await leave(page);
  await waitForFrames(page, 10);
  expect(await beacons(page)).toEqual([]);
  expect(await page.evaluate(() => sessionStorage.getItem("hq:rum"))).toBe("off");
});
