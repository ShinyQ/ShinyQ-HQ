import { expect, test, type Page } from "@playwright/test";
import { enterB1Route } from "./b1";
import { GPU_MEMORY_BUDGET } from "./budgets";
import { chooseMotion, enterHQ, expectNoGpuGrowth, readGpuCounters, readJsHeapAfterGc, readSettledGpuCounters, waitForFloor, waitForHQ, waitForSceneLive } from "./hq";

/**
 * Appendix 08 memory budget (perf report SP8): floor round trips and Page View toggles must leave
 * the renderer's geometries, textures and shader programs at their baseline. Reduced motion makes
 * every ride a 150 ms cut; a warm-up tour first builds what exists once by design (programs, the
 * troika glyph atlas, the Highlights Hall). three counts a geometry or program only once it has been
 * drawn, so what the camera saw decides the counts: every trip calls the elevator the moment the
 * rover arrives, and the baseline is read after one trip shaped like the measured ones (under reduced
 * motion every arrival places the rover on the floor's arrival point, so it always stops at the L1 one). The
 * counts, trips, toggles and heap slack come from GPU_MEMORY_BUDGET (e2e/budgets.ts).
 */
type MemoryWindow = Window & { __hq: { store: { getState: () => { goToFloor: (floor: string) => void } } } };

const { roundTrips: TRIPS, pageViewToggles: TOGGLES, heapBytes: HEAP_SLACK } = GPU_MEMORY_BUDGET;

test.describe.configure({ timeout: 600_000 });
test.use({ reducedMotion: "reduce" });
test.beforeEach(({ page }) => chooseMotion(page, "system"));

async function ride(page: Page, floor: string) {
  await page.evaluate((f) => (window as unknown as MemoryWindow).__hq.store.getState().goToFloor(f), floor);
  await waitForFloor(page, floor, 90_000);
}

test("10 Lobby to Roof round trips leave renderer memory at its baseline", async ({ page }) => {
  await enterHQ(page);
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
    // For the failure message only: unsettled, so the next trip still starts the moment the rover arrives.
    perTrip.push(JSON.stringify(await readGpuCounters(page)));
  }
  const after = await readSettledGpuCounters(page);
  const heapGrowth = (await readJsHeapAfterGc(page)) - heapBase;
  test.info().annotations.push({ type: "measure", description: `base ${JSON.stringify(base)}, after ${TRIPS} trips ${JSON.stringify(after)}, heap +${(heapGrowth / 1024).toFixed(0)} KB` });
  expectNoGpuGrowth(base, after, GPU_MEMORY_BUDGET, `after each trip: ${perTrip.join(" ")}`);
  expect(heapGrowth).toBeLessThan(HEAP_SLACK);
});

test("Lobby to B1 round trips leave renderer memory at its baseline", async ({ page }) => {
  await enterB1Route(page);
  await ride(page, "B1");
  await ride(page, "L1");
  await readSettledGpuCounters(page);
  await ride(page, "B1");
  await ride(page, "L1");
  const base = await readSettledGpuCounters(page);
  const heapBase = await readJsHeapAfterGc(page);
  for (let i = 0; i < TRIPS; i++) {
    await ride(page, "B1");
    await ride(page, "L1");
  }
  const after = await readSettledGpuCounters(page);
  const heapGrowth = (await readJsHeapAfterGc(page)) - heapBase;
  test.info().annotations.push({ type: "measure", description: `base ${JSON.stringify(base)}, after ${TRIPS} B1 trips ${JSON.stringify(after)}, heap +${(heapGrowth / 1024).toFixed(0)} KB` });
  expectNoGpuGrowth(base, after, GPU_MEMORY_BUDGET, "B1 round trips");
  expect(heapGrowth).toBeLessThan(HEAP_SLACK);
});

test("5 Page View and 3D toggles leave renderer memory and the JS heap flat", async ({ page }) => {
  await enterHQ(page);
  const toggle = async () => {
    await page.getByTestId("page-view").click();
    await page.getByTestId("back-to-3d").click();
    await waitForHQ(page);
    await waitForSceneLive(page);
  };
  await toggle();
  const base = await readSettledGpuCounters(page);
  const heapBase = await readJsHeapAfterGc(page);
  for (let i = 1; i < TOGGLES; i++) await toggle();
  const after = await readSettledGpuCounters(page);
  const heapGrowth = (await readJsHeapAfterGc(page)) - heapBase;
  test.info().annotations.push({ type: "measure", description: `base ${JSON.stringify(base)}, after ${TOGGLES} toggles ${JSON.stringify(after)}, heap +${(heapGrowth / 1024).toFixed(0)} KB` });
  expectNoGpuGrowth(base, after);
  expect(heapGrowth).toBeLessThan(HEAP_SLACK);
});
