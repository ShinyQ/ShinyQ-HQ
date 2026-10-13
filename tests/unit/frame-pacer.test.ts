import { describe, expect, it } from "vitest";
import { createPacer, FRAME_INTERVAL_MS, pacerTick, resetPacer, setPacerPaused, type Pacer } from "@/experience/scene/framePacer";

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
