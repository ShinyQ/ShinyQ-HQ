/**
 * Sustained frame-drop detector (REPORT SP5). Frame deltas are grouped into windows; a window is slow
 * when both its median and its mean frame time are above `slowMs`, and smooth when its mean is at most
 * `smoothMs` and its 90th percentile stays under two 60 fps frames. 60 fps is the ceiling, never the
 * display rate: a 75 or 90 Hz screen paced to 60 fps alternates one and two refreshes, so single
 * deltas run up to 22 ms while the mean stays at 16.7 ms (the median alone would read as slow, the
 * mean alone would count one long hitch). It steps down after `slowWindows` slow windows in a row and
 * back up after `smoothWindows` smooth ones, never more than `maxFlips` times in `flipWindowMs`; a step
 * down soon after a step up locks the level for the session. A delta above `pauseMs` (hidden tab, a
 * paused frame loop) restarts the windows. Pure: no React, no three.
 */
/** Frame time at the 60 fps ceiling (the P3 frame pacer caps faster displays there). */
export const FRAME_CAP_MS = 1000 / 60;

export interface MonitorConfig {
  windowMs: number;
  slowMs: number;
  smoothMs: number;
  slowWindows: number;
  smoothWindows: number;
  maxFlips: number;
  flipWindowMs: number;
  /** No decision for this long after the first frame, a hold or a level change. */
  settleMs: number;
  /** Deltas above this are pauses (hidden tab, debugger), not frames. */
  pauseMs: number;
  relapseMs: number;
}

/** Full tier: the budget is >= 55 fps; act below 50 fps sustained. */
export const MONITOR_FULL: MonitorConfig = { windowMs: 2000, slowMs: 20, smoothMs: 17.5, slowWindows: 2, smoothWindows: 10, maxFlips: 2, flipWindowMs: 60_000, settleMs: 3000, pauseMs: 1000, relapseMs: 30_000 };
/** Lite tier: the budget is >= 30 fps; iOS Low Power Mode caps at 30, so act only below about 28 fps. */
export const MONITOR_LITE: MonitorConfig = { ...MONITOR_FULL, slowMs: 36, smoothMs: 20 };

export type MonitorAction = "down" | "up";

export interface FrameMonitor {
  readonly level: number;
  readonly locked: boolean;
  readonly flipTimes: readonly number[];
  push(dtMs: number, nowMs: number): MonitorAction | null;
  hold(nowMs: number): void;
}

/** Nearest-rank percentile of an ascending list (0 for an empty list). */
export function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))];
}

export function createMonitor(config: MonitorConfig, maxLevel: number, start: { level: number; locked: boolean } = { level: 0, locked: false }): FrameMonitor {
  let level = Math.min(Math.max(0, start.level), maxLevel);
  let locked = start.locked;
  const flips: number[] = [];
  let samples: number[] = [];
  let windowStart: number | null = null;
  let settleUntil: number | null = null;
  let slow = 0;
  let smooth = 0;
  let lastUp = -Infinity;

  const restart = (now: number) => {
    settleUntil = now + config.settleMs;
    windowStart = null;
    samples = [];
    slow = 0;
    smooth = 0;
  };
  const canFlip = (now: number) => flips.filter((t) => now - t < config.flipWindowMs).length < config.maxFlips;

  return {
    get level() {
      return level;
    },
    get locked() {
      return locked;
    },
    get flipTimes() {
      return flips;
    },
    hold(now: number) {
      restart(now);
    },
    push(dt: number, now: number): MonitorAction | null {
      if (settleUntil === null) settleUntil = now + config.settleMs;
      if (dt > config.pauseMs) {
        restart(now);
        return null;
      }
      if (!(dt > 0) || now < settleUntil) return null;
      if (windowStart === null) windowStart = now;
      samples.push(dt);
      if (now - windowStart < config.windowMs) return null;
      const sorted = [...samples].sort((a, b) => a - b);
      samples = [];
      windowStart = now;
      const mean = sorted.reduce((sum, v) => sum + v, 0) / sorted.length;
      if (percentile(sorted, 0.5) > config.slowMs && mean > config.slowMs) {
        slow += 1;
        smooth = 0;
      } else if (mean <= config.smoothMs && percentile(sorted, 0.9) < 2 * FRAME_CAP_MS) {
        smooth += 1;
        slow = 0;
      } else {
        slow = 0;
        smooth = 0;
      }
      if (slow >= config.slowWindows && level < maxLevel && canFlip(now)) {
        level += 1;
        if (now - lastUp < config.relapseMs) locked = true;
        flips.push(now);
        restart(now);
        return "down";
      }
      if (smooth >= config.smoothWindows && level > 0 && !locked && canFlip(now)) {
        level -= 1;
        lastUp = now;
        flips.push(now);
        restart(now);
        return "up";
      }
      return null;
    },
  };
}
