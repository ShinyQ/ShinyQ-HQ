import { describe, expect, it } from "vitest";
import { createMonitor, MONITOR_FULL, MONITOR_LITE, percentile, type FrameMonitor } from "@/experience/scene/frameMonitor";

/** Feeds frames of `dt(t)` ms from `from` to `to` (ms); returns [time, action] pairs. */
function feed(m: FrameMonitor, from: number, to: number, dt: (t: number) => number): [number, string][] {
  const out: [number, string][] = [];
  for (let t = from; t < to; ) {
    const d = dt(t);
    t += d;
    const a = m.push(d, t);
    if (a) out.push([Math.round(t), a]);
  }
  return out;
}

const maxFlipsInAnyMinute = (times: readonly number[]) => Math.max(0, ...times.map((t) => times.filter((u) => u >= t && u - t < 60_000).length));

describe("percentile", () => {
  it("picks nearest-rank values", () => {
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.5)).toBe(5);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.9)).toBe(9);
    expect(percentile([], 0.5)).toBe(0);
  });
});

describe("createMonitor (full tier)", () => {
  it("never acts at a steady 60 fps", () => {
    expect(feed(createMonitor(MONITOR_FULL, 3), 0, 120_000, () => 16.7)).toEqual([]);
  });

  it("steps down after 3 s settle plus two slow 2 s windows", () => {
    const m = createMonitor(MONITOR_FULL, 3);
    const actions = feed(m, 0, 7_200, () => 30);
    expect(actions).toHaveLength(1);
    expect(actions[0][1]).toBe("down");
    expect(actions[0][0]).toBeGreaterThanOrEqual(7_000);
    expect(m.level).toBe(1);
  });

  it("never changes level more than twice in any 60 s", () => {
    const m = createMonitor(MONITOR_FULL, 4);
    feed(m, 0, 300_000, () => 45);
    expect(m.level).toBe(4);
    expect(maxFlipsInAnyMinute(m.flipTimes)).toBeLessThanOrEqual(2);
  });

  it("ignores a single long hitch and pauses longer than 1 s", () => {
    const m = createMonitor(MONITOR_FULL, 3);
    expect(feed(m, 0, 60_000, (t) => (Math.floor(t / 10_000) !== Math.floor((t + 16.7) / 10_000) ? 500 : 16.7))).toEqual([]);
    expect(m.push(5_000, 70_000)).toBeNull();
    expect(m.level).toBe(0);
  });

  it("steps back up after 20 s of smooth frames", () => {
    const m = createMonitor(MONITOR_FULL, 3, { level: 1, locked: false });
    const actions = feed(m, 0, 30_000, () => 16.7);
    expect(actions).toHaveLength(1);
    expect(actions[0][1]).toBe("up");
    expect(actions[0][0]).toBeGreaterThanOrEqual(23_000);
    expect(m.level).toBe(0);
  });

  it("locks the level when a step up relapses within 30 s", () => {
    const m = createMonitor(MONITOR_FULL, 3, { level: 1, locked: false });
    feed(m, 0, 24_000, () => 16.7);
    expect(m.level).toBe(0);
    feed(m, 24_000, 32_000, () => 30);
    expect(m.level).toBe(1);
    expect(m.locked).toBe(true);
    expect(feed(m, 32_000, 150_000, () => 16.7)).toEqual([]);
    expect(m.level).toBe(1);
  });

  it("treats 60 fps as the ceiling: a high-refresh display paced to 60 fps never reads as slow", () => {
    // 90 Hz and 75 Hz displays paced to 60 fps alternate one and two refreshes (P3 frame pacer).
    const paced = (hz: number) => {
      const refresh = 1000 / hz;
      let i = 0;
      return () => (i++ % 2 === 0 ? refresh : 2 * refresh);
    };
    expect(feed(createMonitor(MONITOR_FULL, 3), 0, 120_000, paced(90))).toEqual([]);
    expect(feed(createMonitor(MONITOR_FULL, 3), 0, 120_000, paced(75))).toEqual([]);
    const m = createMonitor(MONITOR_FULL, 3, { level: 1, locked: false });
    expect(feed(m, 0, 30_000, paced(90)).map(([, a]) => a)).toEqual(["up"]);
  });

  it("restarts its windows after a pause (hidden tab, a panel covering the canvas)", () => {
    const m = createMonitor(MONITOR_FULL, 3);
    feed(m, 0, 6_000, () => 30);
    expect(m.push(4_000, 10_000)).toBeNull();
    // Settle again, then two full slow windows.
    expect(feed(m, 10_000, 16_000, () => 30)).toEqual([]);
    expect(feed(m, 16_000, 18_000, () => 30)).toHaveLength(1);
  });

  it("restarts its windows on hold (boot, intro, rides)", () => {
    const m = createMonitor(MONITOR_FULL, 3);
    feed(m, 0, 6_000, () => 30);
    m.hold(6_000);
    expect(feed(m, 6_000, 12_000, () => 30)).toEqual([]);
    expect(feed(m, 12_000, 14_000, () => 30)).toHaveLength(1);
  });
});

describe("createMonitor (lite tier)", () => {
  it("accepts 30 fps (iOS Low Power Mode) and acts below about 28 fps", () => {
    expect(feed(createMonitor(MONITOR_LITE, 2), 0, 120_000, () => 33.3)).toEqual([]);
    expect(feed(createMonitor(MONITOR_LITE, 2), 0, 8_000, () => 40)).toHaveLength(1);
  });

  it("never acts when the ladder is empty", () => {
    expect(feed(createMonitor(MONITOR_LITE, 0), 0, 60_000, () => 80)).toEqual([]);
  });
});
