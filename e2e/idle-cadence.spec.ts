import { expect, test, type Page } from "@playwright/test";
import { chooseMotion, enterFloorRoute, enterHQ, skipFloorLines, waitForFrames } from "./hq";

/**
 * Idle frame cadence (src/experience/scene/idle.ts, owner item 11): a parked scene drops to its floor's idle
 * cadence (full motion: 30 fps on L2 and B1, 60 where packets, the ticker or the drone move; reduced motion:
 * on demand, 30 fps on the Lobby), and any input or store change brings 60 back on the next animation frame.
 * Off under automation, so every other spec, the perf lane and the virtual clock see 60 fps; these tests opt in.
 */
test.describe.configure({ timeout: 150_000 });

type IdleWindow = Window & {
  __hq: {
    frames: () => number;
    cadence: () => number;
    idle: { enabled: boolean };
    store: { getState: () => { pointHint: boolean; setPointHint: (on: boolean) => void } };
  };
  __gaps: number[];
};

const cadence = (page: Page) => page.evaluate(() => (window as unknown as IdleWindow).__hq.cadence());

async function optIn(page: Page) {
  await page.evaluate(() => {
    (window as unknown as IdleWindow).__hq.idle.enabled = true;
  });
}

/** Gaps (ms) between rendered 3D frames over `ms` of animation frames, sampled on every animation frame. */
async function renderGaps(page: Page, ms: number): Promise<number[]> {
  return page.evaluate(
    (ms) =>
      new Promise<number[]>((resolve) => {
        const hq = (window as unknown as IdleWindow).__hq;
        const gaps: number[] = [];
        const start = performance.now();
        let frames = hq.frames();
        let last = -1;
        const tick = (now: number) => {
          const f = hq.frames();
          if (f !== frames) {
            if (last >= 0) gaps.push(now - last);
            last = now;
            frames = f;
          }
          if (now - start < ms) requestAnimationFrame(tick);
          else resolve(gaps);
        };
        requestAnimationFrame(tick);
      }),
    ms,
  );
}

/** The cadence one animation frame after `act` runs in the page. */
async function cadenceAfter(page: Page, act: () => Promise<void>): Promise<number> {
  await act();
  return page.evaluate(() => new Promise<number>((resolve) => requestAnimationFrame(() => resolve((window as unknown as IdleWindow).__hq.cadence()))));
}

test("automation keeps 60 fps unless a test opts in", async ({ page }) => {
  await skipFloorLines(page);
  await enterFloorRoute(page, "/en/journey");
  await waitForFrames(page, 30, 2000);
  expect(await page.evaluate(() => (window as unknown as IdleWindow).__hq.idle.enabled)).toBe(false);
  expect(await cadence(page)).toBe(60);
});

test("full motion: a parked scene with no fast mover on screen renders at 30 fps, and a key brings 60 back on the next frame", async ({ page }) => {
  await chooseMotion(page, "full");
  await skipFloorLines(page);
  await enterFloorRoute(page, "/en/journey");
  await optIn(page);
  await expect.poll(() => cadence(page), { timeout: 30_000 }).toBe(30);
  const gaps = await renderGaps(page, 1500);
  expect(gaps.length, "frames still render at 30 fps").toBeGreaterThan(2);
  expect(Math.min(...gaps), JSON.stringify(gaps)).toBeGreaterThanOrEqual(1000 / 30 - 3);
  // "x" is bound to no intent: plain input, nothing moves.
  expect(await cadenceAfter(page, () => page.keyboard.press("x"))).toBe(60);
  await expect.poll(() => cadence(page), { timeout: 30_000 }).toBe(30);
});

test("reduced motion: a parked scene renders on demand, and a store change renders on the next frame", async ({ page }) => {
  await chooseMotion(page, "reduced");
  await skipFloorLines(page);
  await enterFloorRoute(page, "/en/journey");
  await optIn(page);
  await expect.poll(() => cadence(page), { timeout: 30_000 }).toBe(0);
  const before = await page.evaluate(() => (window as unknown as IdleWindow).__hq.frames());
  await page.waitForTimeout(2000);
  const rendered = (await page.evaluate(() => (window as unknown as IdleWindow).__hq.frames())) - before;
  // The antenna blink (every 0.63 s), the eye blinks and a 1 s heartbeat: a few frames, not 120.
  expect(rendered).toBeGreaterThan(0);
  expect(rendered).toBeLessThanOrEqual(12);
  const next = await page.evaluate(
    () =>
      new Promise<{ cadence: number; rendered: boolean }>((resolve) => {
        const hq = (window as unknown as IdleWindow).__hq;
        const frames = hq.frames();
        hq.store.getState().setPointHint(!hq.store.getState().pointHint);
        requestAnimationFrame(() => resolve({ cadence: hq.cadence(), rendered: hq.frames() > frames }));
      }),
  );
  expect(next).toEqual({ cadence: 60, rendered: true });
});

test("the Lobby keeps 60 fps for its data packets; under reduced motion the hologram's slow spin keeps 30", async ({ page }) => {
  await chooseMotion(page, "full");
  await enterHQ(page);
  await optIn(page);
  // Quiet for well over IDLE_AFTER_MS (no input, rover parked): L2 would be at 30 by now.
  await waitForFrames(page, 60, 2500);
  expect(await cadence(page)).toBe(60);

  await chooseMotion(page, "reduced");
  await page.reload();
  await page.waitForFunction(() => Boolean((window as unknown as Partial<IdleWindow>).__hq?.idle));
  await optIn(page);
  await expect.poll(() => cadence(page), { timeout: 30_000 }).toBe(30);
});
