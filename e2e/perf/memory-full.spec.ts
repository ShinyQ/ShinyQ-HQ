import { expect, test, type Page } from "@playwright/test";
import { GPU_MEMORY_BUDGET } from "../budgets";
import { chooseMotion, enterHQ, expectNoGpuGrowth, readGpuCounters, readJsHeapAfterGc, readSettledGpuCounters, waitForFloor } from "../hq";
import { writePerfEntry } from "./helpers";

/**
 * The memory gate on the default path (owner decision 16): the full tier (bloom, composer render targets)
 * with Motion Full, the default on every OS, so every ride plays the elevator animation and the roll-on
 * drive. `e2e/memory.spec.ts` in the default suite keeps the same gate on lite with reduced motion (150 ms
 * cuts), plus the Page View toggles. Same trip shape, helpers and budget (GPU_MEMORY_BUDGET in
 * e2e/budgets.ts, `fullTierRoundTrips` trips in total): a warm-up tour first builds what exists once by design, the
 * baseline is read after one trip shaped like the measured ones, and every trip calls the elevator the
 * moment the rover arrives. The warm-up tour rides with Motion Full too: with Motion Reduced cuts the baseline
 * missed 2 geometries and a program that the first measured trips then built (PR #201, CI). Per-trip numbers are
 * for the failure message only and read unsettled; the baseline and the final read are settled. No full-tier toggle test: each canvas mount compiles 39 or 40 shader programs
 * (one program is drawn in some mounts only), so an exact program baseline across remounts is not stable.
 * The gate runs as `fullTierParts` independent tests (owner request, plan 2026-10-18-memory-full-split): each part
 * repeats the warm-up tour and the shaped trip on its own fresh page, then measures its share of the trips, so the
 * perf shards run the parts in parallel. Ten consecutive trips stay covered on lite by `e2e/memory.spec.ts`.
 */
type MemoryWindow = Window & { __hq: { store: { getState: () => { goToFloor: (floor: string) => void } } } };

const { fullTierRoundTrips, fullTierParts: PARTS, heapBytes: HEAP_SLACK } = GPU_MEMORY_BUDGET;
const TRIPS = fullTierRoundTrips / PARTS;
if (!Number.isInteger(TRIPS) || TRIPS < 1) throw new Error(`fullTierRoundTrips (${fullTierRoundTrips}) must split evenly over ${PARTS} parts`);

// Full-motion rides on SwiftShader take about 30 to 45 s each in CI: the warm-up tour, one shaped trip and the part's trips.
test.describe.configure({ timeout: 900_000 });
test.use({ reducedMotion: "no-preference" });
test.beforeEach(({ page }) => chooseMotion(page, "full"));
// The perf gates measure the sky as visitors see it at night (automation otherwise skips drawing it).
test.beforeEach(({ page }) =>
  page.addInitScript(() => {
    sessionStorage.setItem("hq:sky", "night");
    // Floor ambience off: synthesizing it on the CI CPU skews SwiftShader frame timing (unit tests and ambience.spec cover it).
    localStorage.setItem("hq:ambience", "off");
  }),
);

async function ride(page: Page, floor: string) {
  await page.evaluate((f) => (window as unknown as MemoryWindow).__hq.store.getState().goToFloor(f), floor);
  await waitForFloor(page, floor, 120_000);
}

for (let part = 1; part <= PARTS; part++) {
  test(`full tier, Motion Full: Lobby to Roof round trips leave renderer memory at its baseline (part ${part} of ${PARTS})`, async ({ page }) => {
    await enterHQ(page, { tier: "full" });
    for (const floor of ["L2", "L3", "L4", "RF", "L1"]) await ride(page, floor);
    await readSettledGpuCounters(page);
    await ride(page, "RF");
    await ride(page, "L1");
    const base = await readSettledGpuCounters(page);
    const heapBase = await readJsHeapAfterGc(page);
    const perTrip: string[] = [];
    for (let i = 0; i < TRIPS; i++) {
      await ride(page, "RF");
      await ride(page, "L1");
      perTrip.push(JSON.stringify(await readGpuCounters(page)));
    }
    const after = await readSettledGpuCounters(page);
    const heapGrowth = (await readJsHeapAfterGc(page)) - heapBase;
    writePerfEntry({ kind: "memory", tier: "full", part, parts: PARTS, trips: TRIPS, before: base, after, heapDeltaBytes: heapGrowth });
    console.log(`full memory part ${part}/${PARTS}: base ${JSON.stringify(base)}, after ${TRIPS} trips ${JSON.stringify(after)}, heap +${(heapGrowth / 1024).toFixed(0)} KB`);
    expectNoGpuGrowth(base, after, GPU_MEMORY_BUDGET, `after each trip: ${perTrip.join(" ")}`);
    expect(heapGrowth).toBeLessThan(HEAP_SLACK);
  });
}
