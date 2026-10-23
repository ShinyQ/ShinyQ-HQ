import { expect, test, type Page } from "@playwright/test";
import { enterB1Route } from "./b1";
import { GPU_MEMORY_BUDGET } from "./budgets";
import { chooseMotion, enterHQ, expectNoGpuGrowth, readGpuCounters, readJsHeapAfterGc, readJsHeapSettled, readSettledGpuCounters, waitForFloor, waitForHQ, waitForSceneLive } from "./hq";

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
type MemoryWindow = Window & {
  __hq: {
    store: { getState: () => { goToFloor: (floor: string) => void } };
    floorChunks: { snapshot: () => Record<string, string> };
    office?: { load(): Promise<void> };
    probes: { office?: { loaded: boolean } };
    render: {
      gl: { info: { programs?: object[] }; properties: { get(material: object): { currentProgram?: object } | undefined } } | null;
      scene: { traverse(fn: (o: { material?: object | object[] }) => void): void } | null;
    };
  };
};

const { roundTrips: TRIPS, pageViewToggles: TOGGLES, heapBytes: HEAP_SLACK } = GPU_MEMORY_BUDGET;

test.describe.configure({ timeout: 600_000 });
test.use({ reducedMotion: "reduce" });
test.beforeEach(({ page }) => chooseMotion(page, "system"));

/**
 * The toggle gate's window: its baseline after `WARM_TOGGLES` toggles, its growth over `MEASURED_TOGGLES` more. The heap
 * grows most over the first toggles of a page (about 1.2, 0.8 and 0.5 MB locally, then 0.1 to 0.5 MB a toggle), so a
 * window that starts after the third measures the steady state. `TOGGLES` counts the first toggle, the only warm-up
 * before, so the measured window keeps its 4 toggles.
 */
const WARM_TOGGLES = 3;
const MEASURED_TOGGLES = TOGGLES - 1;
/** Extra toggles the gate may take to reach a mount that pins as many programs as its counterpart (see `pinOnlyPrograms`). */
const MOUNT_RETRIES = 3;

/**
 * Shader programs held only by pins (no material in the scene uses them). The boot precompile (`ProgramWarmup`, frame 3)
 * compiles and pins everything mounted; when a hidden neighbour (L2) commits before it and its own effects have not
 * yet set a material's final variant, the pin keeps that stale variant: about 1 mount in 7 holds one program more than
 * the others. That is a race of each mount, not growth, so the gate compares mounts that pin the same number of programs.
 */
async function pinOnlyPrograms(page: Page): Promise<number> {
  return page.evaluate(() => {
    const { gl, scene } = (window as unknown as MemoryWindow).__hq.render;
    if (!gl || !scene) return -1;
    const used = new Set<object>();
    scene.traverse((o) => {
      for (const material of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) {
        const program = gl.properties.get(material)?.currentProgram;
        if (program) used.add(program);
      }
    });
    return (gl.info.programs ?? []).filter((program) => !used.has(program)).length;
  });
}

/**
 * Waits for the one-off loads every L1 visit starts at idle: the public floor chunks (the idle prefetch) and the
 * always-live Agent Office scene (loaded now if the idle trigger has not yet, then compiled and shown, which adds its
 * programs and textures). Each lands once per page, and the office scene mounts again after every toggle back to 3D.
 */
async function settleIdleLoads(page: Page) {
  await expect
    .poll(() => page.evaluate(() => (window as unknown as MemoryWindow).__hq.floorChunks.snapshot()), { timeout: 120_000 })
    .toMatchObject({ L3: "ready", L4: "ready", RF: "ready" });
  await page.evaluate(() => (window as unknown as MemoryWindow).__hq.office?.load());
  await page.waitForFunction(
    () => {
      const hq = (window as unknown as MemoryWindow).__hq;
      return !hq.office || hq.probes.office?.loaded === true;
    },
    null,
    { timeout: 120_000 },
  );
}

async function ride(page: Page, floor: string) {
  await page.evaluate((f) => (window as unknown as MemoryWindow).__hq.store.getState().goToFloor(f), floor);
  await waitForFloor(page, floor, 90_000);
}

test("10 Lobby to Roof round trips leave renderer memory at its baseline @nightly", async ({ page }) => {
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
  // Settled heap reads (`readJsHeapSettled`): one read after one collection can count garbage still held weakly.
  const heapBase = await readJsHeapSettled(page);
  for (let i = 0; i < TRIPS; i++) {
    await ride(page, "B1");
    await ride(page, "L1");
  }
  const after = await readSettledGpuCounters(page);
  const heapGrowth = (await readJsHeapSettled(page)) - heapBase;
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
    await settleIdleLoads(page);
  };
  // The baseline is the steady state, not the first visit: the idle loads of the first L1 visit (the floor chunk
  // prefetch, the office watch and scene chunks, their first compile) and the first remounts' one-off allocations
  // would otherwise land inside the measured window. A leak still shows: it adds up over every measured toggle.
  const pinned: number[] = [];
  for (let i = 0; i < WARM_TOGGLES; i++) {
    await toggle();
    pinned.push(await pinOnlyPrograms(page));
  }
  // The baseline mount pins as few programs as the warm-up mounts did (the boot precompile race, `pinOnlyPrograms`).
  for (let i = 0; i < MOUNT_RETRIES && pinned.at(-1)! > Math.min(...pinned); i++) {
    await toggle();
    pinned.push(await pinOnlyPrograms(page));
  }
  const basePinned = pinned.at(-1)!;
  const base = await readSettledGpuCounters(page);
  const heapBase = await readJsHeapSettled(page);
  for (let i = 0; i < MEASURED_TOGGLES; i++) await toggle();
  const heapGrowth = (await readJsHeapSettled(page)) - heapBase;
  // The renderer's counts on a mount that pins as many programs as the baseline's.
  let retries = 0;
  while (retries < MOUNT_RETRIES && (await pinOnlyPrograms(page)) !== basePinned) {
    await toggle();
    retries++;
  }
  const after = await readSettledGpuCounters(page);
  const afterPinned = await pinOnlyPrograms(page);
  test.info().annotations.push({
    type: "measure",
    description: `base ${JSON.stringify(base)} (pin-only ${basePinned}) after ${pinned.length} warm-up toggles, after ${MEASURED_TOGGLES} more toggles (+${retries} for a matching mount) ${JSON.stringify(after)} (pin-only ${afterPinned}), heap +${(heapGrowth / 1024).toFixed(0)} KB`,
  });
  expectNoGpuGrowth(base, after);
  expect(heapGrowth).toBeLessThan(HEAP_SLACK);
});
