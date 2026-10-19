import { describe, expect, it } from "vitest";
import { createPacer, FRAME_INTERVAL_MS, FRAME_SLACK_MS, invalidateFrames, pacerTick, resetPacer, setPacerCadence, setPacerPaused, wakeFrameAt, type Pacer } from "@/experience/scene/framePacer";

/** Feeds `seconds` of rAF timestamps at `hz` (optionally jittered) and returns the R3F clock values of rendered frames. */
function run(p: Pacer, hz: number, seconds: number, { start = 1000, jitter = 0 } = {}) {
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const times: number[] = [];
  for (let i = 0; i <= hz * seconds; i++) {
    const now = start + (i * 1000) / hz + (jitter ? (rand() - 0.5) * 2 * jitter : 0);
    const t = pacerTick(p, now);
    if (t !== null) times.push(t);
  }
  return times;
}

/** Ticks like the visual gate's virtual clock (e2e/vclock.ts): `now += step` per frame, from 0. Returns which ticks rendered. */
function vclock(p: Pacer, step: number, ticks: number) {
  const rendered: boolean[] = [];
  let now = 0;
  for (let i = 0; i < ticks; i++) {
    now += step;
    rendered.push(pacerTick(p, now) !== null);
  }
  return rendered;
}

const gaps = (times: number[]) => times.slice(1).map((t, i) => t - times[i]);

describe("pacerTick", () => {
  it.each([60, 75, 90, 120, 144, 165, 240])("renders a %i Hz display at 60 fps without a visible hitch", (hz) => {
    const times = run(createPacer(), hz, 10);
    expect(times.length).toBeGreaterThanOrEqual(595);
    expect(times.length).toBeLessThanOrEqual(605);
    // 75 and 90 Hz alternate one and two refreshes to average 60 fps; no gap ever reaches two cap intervals.
    expect(Math.max(...gaps(times))).toBeLessThan((2 * FRAME_INTERVAL_MS) / 1000);
    expect(Math.min(...gaps(times))).toBeGreaterThanOrEqual(1 / hz - 1e-9);
  });

  it("renders every frame of a jittery 60 Hz display", () => {
    expect(run(createPacer(), 60, 10, { jitter: 1 }).length).toBe(601);
  });

  it("renders every tick of a virtual clock that steps exactly 1000/60 ms", () => {
    expect(vclock(createPacer(), 1000 / 60, 3600).every(Boolean)).toBe(true);
  });

  it("renders every other tick of a virtual clock that steps exactly 1000/120 ms (60 fps)", () => {
    const rendered = vclock(createPacer(), 1000 / 120, 7200);
    expect(rendered.filter(Boolean).length).toBe(3600);
    expect(rendered.every((r, i) => r === (i % 2 === 0))).toBe(true);
  });

  it("starts the clock at 0 and advances it by the time between rendered frames", () => {
    const p = createPacer();
    expect(pacerTick(p, 500)).toBe(0);
    expect(pacerTick(p, 508)).toBeNull();
    expect(pacerTick(p, 516.7)).toBeCloseTo(0.0167, 4);
  });

  it("does not catch up after a stall: the next frame comes one interval later", () => {
    const p = createPacer();
    pacerTick(p, 0);
    expect(pacerTick(p, 400)).toBeCloseTo(0.4, 6);
    expect(pacerTick(p, 408)).toBeNull();
    expect(pacerTick(p, 416.7)).not.toBeNull();
  });

  it("renders nothing while paused and resumes with a one-frame delta, not the paused time", () => {
    const p = createPacer();
    const before = run(p, 120, 1, { start: 0 });
    const last = before[before.length - 1];
    expect(setPacerPaused(p, true, 1000)).toBe(true);
    expect(run(p, 120, 5, { start: 1000 })).toEqual([]);
    expect(setPacerPaused(p, false, 6000)).toBe(true);
    const t = pacerTick(p, 6001)!;
    expect(t - last).toBeGreaterThan(0.016);
    expect(t - last).toBeLessThan(0.02);
    expect(setPacerPaused(p, false, 6002)).toBe(false);
  });

  it("counts rendered frames across canvases; a reset restarts only the clock", () => {
    const p = createPacer();
    run(p, 60, 1);
    const frames = p.frames;
    resetPacer(p);
    expect(pacerTick(p, 99_999)).toBe(0);
    expect(p.frames).toBe(frames + 1);
  });
});

/** Feeds 60 Hz ticks from `start` for `ms` and returns the tick times that rendered. */
function ticks(p: Pacer, start: number, ms: number, hz = 60) {
  const out: number[] = [];
  for (let i = 0; i < Math.round((ms * hz) / 1000); i++) {
    const now = start + (i * 1000) / hz;
    if (pacerTick(p, now) !== null) out.push(now);
  }
  return out;
}

describe("idle cadence", () => {
  it("cadence 30 renders every other refresh of a 60 Hz display", () => {
    const p = createPacer();
    pacerTick(p, 0);
    setPacerCadence(p, 30, 1);
    expect(p.cadence).toBe(30);
    const rendered = vclock(p, 1000 / 60, 600);
    expect(rendered.filter(Boolean).length).toBe(300);
    expect(rendered.every((r, i) => r === (i % 2 === 1))).toBe(true);
  });

  it.each([60, 90, 120, 144])("cadence 30 averages 30 fps on a %i Hz display with no gap over two 30 fps frames", (hz) => {
    const p = createPacer();
    setPacerCadence(p, 30, 0);
    const times = run(p, hz, 10, { jitter: 0.5 });
    expect(times.length).toBeGreaterThanOrEqual(295);
    expect(times.length).toBeLessThanOrEqual(305);
    expect(Math.max(...gaps(times))).toBeLessThan(2 / 30);
  });

  it("cadence 0 renders only after invalidateFrames, once per call", () => {
    const p = createPacer();
    pacerTick(p, 0);
    setPacerCadence(p, 0, 0);
    expect(ticks(p, 1, 5000)).toEqual([]);
    invalidateFrames(p);
    const rendered = ticks(p, 5001, 1000);
    expect(rendered).toEqual([5001]);
  });

  it("at 30 fps an invalidation renders the next tick and restarts the 30 fps rhythm from there", () => {
    const p = createPacer();
    pacerTick(p, 0);
    setPacerCadence(p, 30, 0);
    expect(pacerTick(p, 1000 / 30)).not.toBeNull();
    invalidateFrames(p);
    expect(pacerTick(p, 3000 / 60)).not.toBeNull();
    expect(pacerTick(p, 4000 / 60)).toBeNull();
    expect(pacerTick(p, 5000 / 60)).not.toBeNull();
  });

  it("cadence 0 renders at a requested wake time, in clock seconds", () => {
    const p = createPacer();
    pacerTick(p, 1000);
    setPacerCadence(p, 0, 1000);
    // The clock is 0 at the 1000 ms frame: a wake at clock 0.5 s is the tick at or after 1500 ms.
    wakeFrameAt(0.5, p);
    const rendered = ticks(p, 1000 + 1000 / 60, 2000);
    expect(rendered.length).toBe(1);
    expect(rendered[0]).toBeGreaterThanOrEqual(1500 - FRAME_SLACK_MS);
    expect(rendered[0]).toBeLessThan(1500 + 1000 / 60);
    expect(p.elapsed).toBeCloseTo((rendered[0] - 1000) / 1000, 6);
  });

  it("keeps the earliest wake and forgets wakes once a frame renders", () => {
    const p = createPacer();
    pacerTick(p, 0);
    setPacerCadence(p, 0, 0);
    wakeFrameAt(2, p);
    wakeFrameAt(1, p);
    wakeFrameAt(3, p);
    const rendered = ticks(p, 1000 / 60, 5000);
    expect(rendered.length).toBe(1);
    expect(rendered[0]).toBeGreaterThanOrEqual(1000 - FRAME_SLACK_MS);
    expect(rendered[0]).toBeLessThan(1000 + 1000 / 60);
  });

  it("a change back to 60 renders on the next tick, then every 60 Hz refresh", () => {
    for (const from of [30, 0] as const) {
      const p = createPacer();
      pacerTick(p, 0);
      setPacerCadence(p, from, 0);
      ticks(p, 1000 / 60, 3000);
      const before = p.frames;
      const now = 3000 + 5;
      setPacerCadence(p, 60, now);
      expect(p.cadence).toBe(60);
      expect(pacerTick(p, now + 1)).not.toBeNull();
      expect(ticks(p, now + 1 + 1000 / 60, 1000).length).toBe(60);
      expect(p.frames).toBe(before + 61);
    }
  });

  it("the clock delta stays rendered time: wall time between frames at any cadence, never the paused time", () => {
    const p = createPacer();
    pacerTick(p, 0);
    setPacerCadence(p, 30, 0);
    const a = pacerTick(p, 1000 / 60);
    expect(a).toBeNull();
    expect(pacerTick(p, 2000 / 60)).toBeCloseTo(1 / 30, 6);
    setPacerCadence(p, 0, 40);
    wakeFrameAt(1.5, p);
    expect(ticks(p, 50, 3000).length).toBe(1);
    expect(p.elapsed).toBeGreaterThanOrEqual(1.5 - FRAME_SLACK_MS / 1000);
    expect(p.elapsed).toBeLessThan(1.5 + 1 / 60);
    const shown = p.elapsed;
    setPacerPaused(p, true, 3100);
    invalidateFrames(p);
    expect(ticks(p, 3100, 2000)).toEqual([]);
    setPacerPaused(p, false, 5100);
    setPacerCadence(p, 60, 5100);
    const t = pacerTick(p, 5101)!;
    expect(t - shown).toBeGreaterThan(0.016);
    expect(t - shown).toBeLessThan(0.02);
  });

  it("back to 60 renders on the very next tick even when the input's timestamp is a little later than the frame's", () => {
    const p = createPacer();
    pacerTick(p, 0);
    setPacerCadence(p, 0, 0);
    // rAF timestamps are the frame start, so an input handled in that frame can read a later performance.now().
    setPacerCadence(p, 60, 1005);
    const t = pacerTick(p, 1000);
    expect(t).not.toBeNull();
    expect(t!).toBeGreaterThan(0);
    expect(t!).toBeLessThanOrEqual(1 / 60 + 1e-9);
  });

  it("changes nothing when the cadence does not change; a new canvas starts at 60", () => {
    const p = createPacer();
    expect(p.cadence).toBe(60);
    const before = { ...p };
    setPacerCadence(p, 60, 0);
    expect(p).toEqual(before);
    setPacerCadence(p, 0, 0);
    resetPacer(p);
    expect(p.cadence).toBe(60);
  });
});
