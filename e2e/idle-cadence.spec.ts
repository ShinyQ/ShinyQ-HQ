import { expect, test, type Page } from "@playwright/test";
import { chooseMotion, enterFloorRoute, enterHQ, skipFloorLines } from "./hq";

/**
 * Idle frame cadence (src/experience/scene/idle.ts, owner item 11): a parked scene drops to its floor's idle
 * cadence (full motion: 30 fps on L2 and B1, 60 where packets, the ticker or the drone move; reduced motion:
 * on demand, 30 fps on the Lobby), and any input or store change brings 60 back on the next animation frame
 * with a normal one-frame delta. Off under automation, so every other spec, the perf lane and the virtual
 * clock see 60 fps; these tests opt in. Every wait is on state (the cadence, the quiet probe, frame counts).
 */
test.describe.configure({ timeout: 150_000 });

type IdleWindow = Window & {
  __hq: {
    frames: () => number;
    clock: () => number;
    cadence: () => number;
    idle: { enabled: boolean; lastActivity: number; stillSince: number };
    rover: { x: number; z: number; heading: number };
    store: { getState: () => { pointHint: boolean; setPointHint: (on: boolean) => void } };
  };
};

const cadence = (page: Page) => page.evaluate(() => (window as unknown as IdleWindow).__hq.cadence());

/** The scene is quiet (no input and nothing moved for IDLE_AFTER_MS, 1 s) and the cadence is opted in. */
const quiet = (page: Page) =>
  page.evaluate(() => {
    const idle = (window as unknown as IdleWindow).__hq.idle;
    const now = performance.now();
    return idle.enabled && now - idle.lastActivity >= 1000 && now - idle.stillSince >= 1000;
  });

async function optIn(page: Page) {
  await page.evaluate(() => {
    (window as unknown as IdleWindow).__hq.idle.enabled = true;
  });
}

/** Rendered 3D frames, the gaps (ms) between them and the span (s) of `ticks` animation frames (a measurement, not a wait). */
async function renderOver(page: Page, ticks: number): Promise<{ rendered: number; gaps: number[]; seconds: number }> {
  return page.evaluate(
    (ticks) =>
      new Promise<{ rendered: number; gaps: number[]; seconds: number }>((resolve) => {
        const h = (window as unknown as IdleWindow).__hq;
        const gaps: number[] = [];
        const first = h.frames();
        let frames = first;
        let last = -1;
        let seen = 0;
        let start = -1;
        const tick = (now: number) => {
          if (start < 0) start = now;
          const f = h.frames();
          if (f !== frames) {
            if (last >= 0) gaps.push(now - last);
            last = now;
            frames = f;
          }
          if (++seen < ticks) requestAnimationFrame(tick);
          else resolve({ rendered: frames - first, gaps, seconds: (now - start) / 1000 });
        };
        requestAnimationFrame(tick);
      }),
    ticks,
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
  // The scene has been still and untouched for over a second: an opted-in canvas would be at 30 by now.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const idle = (window as unknown as IdleWindow).__hq.idle;
        const now = performance.now();
        return now - idle.stillSince > 1200 && now - idle.lastActivity > 1200;
      }),
      { timeout: 60_000 },
    )
    .toBe(true);
  expect(await page.evaluate(() => (window as unknown as IdleWindow).__hq.idle.enabled)).toBe(false);
  expect(await quiet(page)).toBe(false);
  expect(await cadence(page)).toBe(60);
});

test("full motion: a parked scene with no fast mover on screen renders at 30 fps, and a key brings 60 back on the next frame", async ({ page }) => {
  await chooseMotion(page, "full");
  await skipFloorLines(page);
  await enterFloorRoute(page, "/en/journey");
  await optIn(page);
  await expect.poll(() => cadence(page), { timeout: 60_000 }).toBe(30);
  const { rendered, gaps, seconds } = await renderOver(page, 90);
  expect(gaps.length, "frames still render at 30 fps").toBeGreaterThan(2);
  // The overall rate, not single gaps: a late frame keeps the 33 ms rhythm (the next one follows sooner) and an R3F
  // invalidation adds a frame, so one gap can be a 60 Hz tick. A slow runner only lowers the rate.
  const median = [...gaps].sort((x, y) => x - y)[Math.floor(gaps.length / 2)];
  const detail = `${rendered} frames in ${seconds.toFixed(2)} s, gaps ${JSON.stringify(gaps.map(Math.round))}`;
  expect(rendered / seconds, detail).toBeLessThan(45);
  expect(median, detail).toBeGreaterThanOrEqual(25);
  // "x" is bound to no intent: plain input, nothing moves.
  expect(await cadenceAfter(page, () => page.keyboard.press("x"))).toBe(60);
  await expect.poll(() => cadence(page), { timeout: 60_000 }).toBe(30);
});

test("reduced motion: a parked scene renders on demand, and a store change renders on the next frame", async ({ page }) => {
  await chooseMotion(page, "reduced");
  await skipFloorLines(page);
  await enterFloorRoute(page, "/en/journey");
  await optIn(page);
  await expect.poll(() => cadence(page), { timeout: 60_000 }).toBe(0);
  const { rendered, seconds } = await renderOver(page, 120);
  // Only the antenna blink (every 0.63 s), the eye blinks and a 1 s heartbeat render: about 2 to 3 frames a second.
  expect(rendered).toBeGreaterThan(0);
  expect(rendered / seconds, `${rendered} frames in ${seconds.toFixed(2)} s`).toBeLessThan(6);
  const next = await page.evaluate(
    () =>
      new Promise<{ cadence: number; rendered: boolean }>((resolve) => {
        const h = (window as unknown as IdleWindow).__hq;
        const frames = h.frames();
        h.store.getState().setPointHint(!h.store.getState().pointHint);
        requestAnimationFrame(() => resolve({ cadence: h.cadence(), rendered: h.frames() > frames }));
      }),
  );
  expect(next).toEqual({ cadence: 60, rendered: true });
});

test("reduced motion: the first frame after input on demand has a one-frame delta, so nothing jumps", async ({ page }) => {
  await chooseMotion(page, "reduced");
  await skipFloorLines(page);
  await enterFloorRoute(page, "/en/journey");
  await optIn(page);
  await expect.poll(() => cadence(page), { timeout: 60_000 }).toBe(0);
  const step = await page.evaluate(
    () =>
      new Promise<{ gapMs: number; deltaMs: number; boundMs: number; cadence: number }>((resolve) => {
        const h = (window as unknown as IdleWindow).__hq;
        let frames = h.frames();
        let quietTicks = 0;
        let renderedAt = performance.now();
        // Waits for an on-demand gap of at least 15 animation frames (about 250 ms) without a rendered frame.
        const wait = (now: number) => {
          const f = h.frames();
          quietTicks = f === frames ? quietTicks + 1 : 0;
          if (f !== frames) renderedAt = now;
          frames = f;
          if (quietTicks < 15) return void requestAnimationFrame(wait);
          const clock = h.clock();
          const sentAt = performance.now();
          document.dispatchEvent(new KeyboardEvent("keydown", { key: "x", code: "KeyX" }));
          const after = (now: number) => {
            if (h.frames() === frames) return void requestAnimationFrame(after);
            // At most the time from the key to the frame that showed it plus one 60 fps frame (and rAF slack).
            resolve({ gapMs: sentAt - renderedAt, deltaMs: (h.clock() - clock) * 1000, boundMs: now - sentAt + 1000 / 60 + 3, cadence: h.cadence() });
          };
          requestAnimationFrame(after);
        };
        requestAnimationFrame(wait);
      }),
  );
  expect(step.cadence).toBe(60);
  expect(step.gapMs, "an on-demand gap lay behind the key").toBeGreaterThan(200);
  // Without the clamp the delta would include the whole on-demand gap.
  expect(step.deltaMs, JSON.stringify(step)).toBeGreaterThan(0);
  expect(step.deltaMs, JSON.stringify(step)).toBeLessThanOrEqual(step.boundMs);
});

test("the Lobby keeps 60 fps for its data packets; under reduced motion the hologram's slow spin keeps 30", async ({ page }) => {
  await chooseMotion(page, "full");
  await enterHQ(page);
  await optIn(page);
  // The scene must really be idle (quiet), so 60 here is the Lobby's idle cadence, not a busy scene.
  await expect.poll(() => quiet(page), { timeout: 60_000 }).toBe(true);
  expect(await cadence(page)).toBe(60);
  const { rendered } = await renderOver(page, 30);
  expect(rendered, "every animation frame renders").toBeGreaterThanOrEqual(28);
  expect(await quiet(page), "still quiet").toBe(true);

  await chooseMotion(page, "reduced");
  await page.reload();
  await page.waitForFunction(() => Boolean((window as unknown as Partial<IdleWindow>).__hq?.idle));
  await optIn(page);
  await expect.poll(() => cadence(page), { timeout: 60_000 }).toBe(30);
});
