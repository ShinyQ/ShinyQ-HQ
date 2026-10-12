import type { Page } from "@playwright/test";

type VClock = { step: (n: number) => number; frames: () => number; run: () => void; pause: () => void };
type VClockWindow = { __vclock: VClock };

/**
 * Deterministic frames for the visual gate. Before any app code runs it replaces requestAnimationFrame,
 * performance.now, Date.now, requestIdleCallback and Math.random (seeded). Each frame advances the
 * virtual clock by exactly 1000/60 ms, so three's Clock, R3F deltas and shader uTime depend only on
 * the number of frames, never on how fast SwiftShader renders. `autorun` steps one frame every 4 ms of
 * real time until `pauseClock`; without it nothing animates until `stepFrames`.
 */
export async function installVirtualClock(page: Page, { autorun = true, seed = 7 }: { autorun?: boolean; seed?: number } = {}) {
  await page.addInitScript(
    ({ autorun, seed }) => {
      const FRAME = 1000 / 60;
      let now = 0;
      let frames = 0;
      let nextId = 1;
      const raf = new Map<number, FrameRequestCallback>();
      const idle = new Map<number, IdleRequestCallback>();
      let state = seed >>> 0;
      Math.random = () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      const epoch = Date.UTC(2026, 9, 13, 12);
      performance.now = () => now;
      Date.now = () => epoch + Math.round(now);
      window.requestAnimationFrame = (cb: FrameRequestCallback) => {
        const id = nextId++;
        raf.set(id, cb);
        return id;
      };
      window.cancelAnimationFrame = (id: number) => {
        raf.delete(id);
      };
      window.requestIdleCallback = (cb: IdleRequestCallback) => {
        const id = nextId++;
        idle.set(id, cb);
        return id;
      };
      window.cancelIdleCallback = (id: number) => {
        idle.delete(id);
      };
      const step = (n: number) => {
        for (let i = 0; i < n; i++) {
          now += FRAME;
          frames += 1;
          const due = [...raf.values()];
          raf.clear();
          for (const cb of due) cb(now);
          const idles = [...idle.values()];
          idle.clear();
          for (const cb of idles) cb({ didTimeout: false, timeRemaining: () => 8 });
        }
        return frames;
      };
      let pump: number | null = null;
      const clock: VClock = {
        step,
        frames: () => frames,
        run: () => {
          if (pump === null) pump = window.setInterval(() => step(1), 4);
        },
        pause: () => {
          if (pump !== null) window.clearInterval(pump);
          pump = null;
        },
      };
      (window as unknown as VClockWindow).__vclock = clock;
      if (autorun) clock.run();
    },
    { autorun, seed },
  );
}

export async function pauseClock(page: Page): Promise<void> {
  await page.evaluate(() => (window as unknown as VClockWindow).__vclock.pause());
}

/** Renders exactly `n` frames (synchronously, inside the page) and returns the total frame count. */
export async function stepFrames(page: Page, n: number): Promise<number> {
  return page.evaluate((n) => (window as unknown as VClockWindow).__vclock.step(n), n);
}

export async function frameCount(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as VClockWindow).__vclock.frames());
}

/** Waits in real time until fonts are loaded and no new resource started for `quietMs`. */
export async function waitForQuiet(page: Page, quietMs = 300, timeout = 60_000): Promise<void> {
  await page.waitForFunction(() => document.fonts.status === "loaded", null, { polling: 50, timeout });
  const end = Date.now() + timeout;
  let last = -1;
  while (Date.now() < end) {
    const count = await page.evaluate(() => performance.getEntriesByType("resource").length);
    if (count === last) return;
    last = count;
    await page.waitForTimeout(quietMs);
  }
  throw new Error("the page never went quiet");
}

/** Steps frames in batches until `check` is true in the page; fails after `maxFrames`. */
export async function driveUntil(page: Page, check: () => boolean, { maxFrames, batch = 10 }: { maxFrames: number; batch?: number }): Promise<number> {
  for (let done = 0; done < maxFrames; done += batch) {
    await stepFrames(page, batch);
    if (await page.evaluate(check)) return frameCount(page);
    if (done % 120 === 0) await waitForQuiet(page, 150);
  }
  throw new Error(`state not reached within ${maxFrames} frames`);
}
