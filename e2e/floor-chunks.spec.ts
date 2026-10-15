import { expect, test, type Page } from "@playwright/test";
import { PREPARE_TIMEOUT } from "../src/experience/tower/elevator";
import { asReturningVisitor, waitForFloor, waitForHQ, waitForSceneLive } from "./hq";

/**
 * On-demand floor chunks (Round 7 B): L3, L4 and RF load after the first frame, on elevator intent and
 * on deep links, and a ride never shows an empty floor (the car holds at closed doors for the chunk).
 */
test.describe.configure({ timeout: 180_000 });

type ChunkWindow = Window & {
  __hq: {
    floorChunks: { state: (id: string) => string; snapshot: () => Record<string, string>; requestedAt: (id: string) => number | null };
    motion: () => { ride: { stage: string; chunkHeld?: number } | null };
    ridePrep: { floors: Map<string, { state: string }> };
  };
  __chunkSamples: { stage: string | null; chunk: string; prep: string | null; chunkHeld: number }[];
};

async function open(page: Page, url: string) {
  await asReturningVisitor(page);
  await page.goto(url);
  await waitForHQ(page);
  await waitForSceneLive(page);
}

const firstFrameAt = (page: Page) => page.evaluate(() => performance.getEntriesByName("hq:first-frame")[0]?.startTime ?? null);

test("loads every floor chunk on idle after the first frame", async ({ page }) => {
  await open(page, "/en?tier=lite");
  await expect
    .poll(() => page.evaluate(() => (window as unknown as ChunkWindow).__hq.floorChunks.snapshot()), { timeout: 30_000 })
    .toMatchObject({ L3: "ready", L4: "ready", RF: "ready" });
  const frame = await firstFrameAt(page);
  expect(frame).not.toBeNull();
  for (const id of ["L3", "L4", "RF"]) {
    const at = await page.evaluate((f) => (window as unknown as ChunkWindow).__hq.floorChunks.requestedAt(f), id);
    expect(at, `${id} was requested before the first frame`).toBeGreaterThanOrEqual(frame!);
  }
});

test("a deep link requests its floor chunk before the first frame and builds the floor", async ({ page }) => {
  await open(page, "/en/labs?tier=lite&prefetch=off");
  const frame = await firstFrameAt(page);
  const at = await page.evaluate(() => (window as unknown as ChunkWindow).__hq.floorChunks.requestedAt("L3"));
  expect(at).not.toBeNull();
  expect(at!).toBeLessThanOrEqual(frame!);
  await expect
    .poll(() => page.evaluate(() => (window as unknown as ChunkWindow).__hq.ridePrep.floors.get("L3")?.state ?? null), { timeout: 30_000 })
    .toBe("ready");
  // Speculative prefetches are off: a floor two away stays unloaded (L4 is a neighbour of L3, so its
  // content mounts and loads its chunk by rendering, not by prefetch).
  expect(await page.evaluate(() => (window as unknown as ChunkWindow).__hq.floorChunks.snapshot())).toMatchObject({ RF: "idle" });
});

test("the car holds at closed doors until a slow floor chunk arrives, then the floor is there", async ({ page }) => {
  await open(page, "/en?tier=lite&prefetch=off");
  expect(await page.evaluate(() => (window as unknown as ChunkWindow).__hq.floorChunks.state("L3"))).toBe("idle");
  // Every script requested from now on is a floor chunk: hold each until the test releases the gate,
  // which it does only after the car has waited longer than PREPARE_TIMEOUT.
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(/\/_next\/static\/chunks\/.+\.js$/, async (route) => {
    await gate;
    await route.continue();
  });
  await page.evaluate(() => {
    const w = window as unknown as ChunkWindow;
    w.__chunkSamples = [];
    const tick = () => {
      const ride = w.__hq.motion().ride;
      w.__chunkSamples.push({
        stage: ride?.stage ?? null,
        chunk: w.__hq.floorChunks.state("L3"),
        prep: w.__hq.ridePrep.floors.get("L3")?.state ?? null,
        chunkHeld: ride?.chunkHeld ?? 0,
      });
      if (w.__chunkSamples.length < 50_000) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.getByRole("navigation", { name: "Elevator" }).locator('[data-floor="L3"]').click();
  await expect
    .poll(() => page.evaluate(() => (window as unknown as ChunkWindow).__hq.motion().ride?.chunkHeld ?? 0), { timeout: 60_000 })
    .toBeGreaterThan(PREPARE_TIMEOUT + 0.5);
  const held = await page.evaluate(() => ({ ride: (window as unknown as ChunkWindow).__hq.motion().ride, chunk: (window as unknown as ChunkWindow).__hq.floorChunks.state("L3") }));
  expect(held.chunk, "the chunk is still loading while the car waits").toBe("loading");
  expect(["moving", "opening", "exiting"], "the car stays at closed doors past PREPARE_TIMEOUT").not.toContain(held.ride?.stage);
  release();
  await waitForFloor(page, "L3", 90_000);
  const samples = await page.evaluate(() => (window as unknown as ChunkWindow).__chunkSamples);
  const travelling = samples.filter((s) => s.stage === "moving" || s.stage === "opening" || s.stage === "exiting");
  expect(travelling.length).toBeGreaterThan(0);
  expect(travelling.filter((s) => s.chunk !== "ready"), "the car moved before the L3 chunk arrived").toEqual([]);
  expect(travelling.filter((s) => s.prep === null), "the car moved before the L3 floor mounted").toEqual([]);
  expect(Math.max(...samples.map((s) => s.chunkHeld))).toBeGreaterThan(1.5);
});
