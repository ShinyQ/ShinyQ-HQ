import { expect, test, type Page } from "@playwright/test";
import { enterHQ, waitForFloor, waitForFrames, waitForHQ, waitForSceneLive } from "./hq";

/**
 * Appendix 08 memory budget (perf report SP8): floor round trips and Page View toggles must leave
 * the renderer's geometries, textures and shader programs at their baseline. Reduced motion makes
 * every ride a 150 ms cut; a warm-up tour first builds what exists once by design (programs, the
 * troika glyph atlas, the Highlights Hall). three counts a geometry or program only once it has been
 * drawn, and where the rover (and so the camera) ends up on L1 depends on whether the trip started
 * from a settled Lobby, so the baseline is read after one trip shaped like the measured ones.
 */
interface Counts {
  geometries: number;
  textures: number;
  programs: number;
}
type MemoryWindow = Window & {
  __hq: { store: { getState: () => { goToFloor: (floor: string) => void } }; memory: () => Counts | null };
};

const TRIPS = 10;
const TOGGLES = 5;
const HEAP_SLACK = 2 * 1024 * 1024;

test.describe.configure({ timeout: 600_000 });
test.use({ reducedMotion: "reduce" });

const read = (page: Page) => page.evaluate(() => (window as unknown as MemoryWindow).__hq.memory());

/** Counts once the floor settled: neighbours mount on idle and troika typesets asynchronously, so two equal reads in a row. */
async function settledCounts(page: Page): Promise<Counts> {
  let last = "";
  for (let i = 0; i < 40; i++) {
    await page.evaluate(() => new Promise<void>((resolve) => requestIdleCallback(() => resolve(), { timeout: 1000 })));
    await waitForFrames(page, 10);
    const now = await read(page);
    const key = JSON.stringify(now);
    if (now && key === last) return now;
    last = key;
  }
  throw new Error(`renderer memory never settled, last read ${last}`);
}

async function heapUsed(page: Page): Promise<number> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("HeapProfiler.collectGarbage");
  const { usedSize } = await cdp.send("Runtime.getHeapUsage");
  await cdp.detach();
  return usedSize;
}

async function ride(page: Page, floor: string) {
  await page.evaluate((f) => (window as unknown as MemoryWindow).__hq.store.getState().goToFloor(f), floor);
  await waitForFloor(page, floor, 90_000);
}

test("10 Lobby to Roof round trips leave renderer memory at its baseline", async ({ page }) => {
  await enterHQ(page);
  for (const floor of ["L2", "L3", "L4", "RF", "L1"]) await ride(page, floor);
  await settledCounts(page);
  await ride(page, "RF");
  await ride(page, "L1");
  const base = await settledCounts(page);
  const heapBase = await heapUsed(page);
  const perTrip: string[] = [];
  for (let i = 0; i < TRIPS; i++) {
    await ride(page, "RF");
    await ride(page, "L1");
    perTrip.push(JSON.stringify(await settledCounts(page)));
  }
  const after = await settledCounts(page);
  const heapGrowth = (await heapUsed(page)) - heapBase;
  test.info().annotations.push({ type: "measure", description: `base ${JSON.stringify(base)}, after ${TRIPS} trips ${JSON.stringify(after)}, heap +${(heapGrowth / 1024).toFixed(0)} KB` });
  expect(after, `after each trip: ${perTrip.join(" ")}`).toEqual(base);
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
  const base = await settledCounts(page);
  const heapBase = await heapUsed(page);
  for (let i = 1; i < TOGGLES; i++) await toggle();
  const after = await settledCounts(page);
  const heapGrowth = (await heapUsed(page)) - heapBase;
  test.info().annotations.push({ type: "measure", description: `base ${JSON.stringify(base)}, after ${TOGGLES} toggles ${JSON.stringify(after)}, heap +${(heapGrowth / 1024).toFixed(0)} KB` });
  expect(after).toEqual(base);
  expect(heapGrowth).toBeLessThan(HEAP_SLACK);
});
