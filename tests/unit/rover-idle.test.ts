import { describe, expect, it, vi } from "vitest";
import {
  IDLE,
  IDLE_SEQUENCES,
  createIdleState,
  idleEligible,
  stepIdle,
  type EligibleInput,
  type IdleInput,
  type IdleOutput,
  type IdleState,
} from "@/experience/rover/idle";
import { ACTIVITY_EVENTS, activity, bumpActivity, watchActivity } from "@/experience/rover/activity";

const dt = 1 / 60;

interface Run {
  s: IdleState;
  t: number;
  seq: number;
  eligible: boolean;
  reduced: boolean;
  delay: number;
  random: () => number;
}

function makeRun(random: () => number = () => 0.5): Run {
  return { s: createIdleState(), t: 0, seq: 0, eligible: true, reduced: false, delay: IDLE.delay, random };
}

function tick(r: Run, step = dt): IdleOutput {
  const input: IdleInput = { t: r.t, seq: r.seq, eligible: r.eligible, reduced: r.reduced, delay: r.delay, random: r.random };
  const out = stepIdle(r.s, input);
  r.t += step;
  return out;
}

function runUntil(r: Run, until: number, onFrame?: (o: IdleOutput, t: number) => void) {
  while (r.t < until) {
    const t = r.t;
    const o = tick(r);
    onFrame?.(o, t);
  }
}

function cycle(values: number[]) {
  let k = 0;
  return () => values[k++ % values.length];
}

const tally = () => ({ blink: 0, hop: 0, beep: 0, looks: 0, spins: 0 });

describe("stepIdle timing", () => {
  it("does nothing before the delay and starts a sequence at 15 s", () => {
    const r = makeRun();
    let first = -1;
    runUntil(r, 40, (o, t) => {
      if (o.action !== null && first < 0) first = t;
      if (t < IDLE.delay - 1e-6) expect(o).toEqual({ action: null, headYaw: 0, spin: 0, blink: false, hop: false, beep: false });
    });
    expect(first).toBeGreaterThanOrEqual(IDLE.delay - 1e-6);
    expect(first).toBeLessThan(IDLE.delay + 2 * dt);
  });

  it("uses the delay from the input", () => {
    const r = makeRun();
    r.delay = 5;
    let first = -1;
    runUntil(r, 20, (o, t) => {
      if (o.action !== null && first < 0) first = t;
    });
    expect(first).toBeGreaterThanOrEqual(5 - 1e-6);
    expect(first).toBeLessThan(5 + 2 * dt);
  });
});

describe("sequence templates", () => {
  it("has four templates of 3 to 5.5 s with the required steps", () => {
    expect(IDLE_SEQUENCES).toHaveLength(4);
    for (const steps of IDLE_SEQUENCES) {
      const count = (a: string) => steps.filter((s) => s.action === a).length;
      const end = Math.max(...steps.map((s) => s.at + s.dur));
      expect(end).toBeGreaterThanOrEqual(3);
      expect(end).toBeLessThanOrEqual(5.5);
      expect(count("look")).toBeGreaterThanOrEqual(1);
      expect(count("blink")).toBeGreaterThanOrEqual(1);
      expect(count("hop") + count("spin")).toBe(1);
      expect(count("beep")).toBe(1);
      for (const s of steps.filter((x) => x.action === "look")) expect(s.dur).toBeGreaterThanOrEqual(2);
    }
  });

  it("plays every template with one beep, a blink, a look and a hop or spin", () => {
    for (let idx = 0; idx < IDLE_SEQUENCES.length; idx++) {
      // The first pick is floor(random * 4), the second draw is the spin direction.
      const r = makeRun(cycle([(idx + 0.1) / IDLE_SEQUENCES.length, 0.2]));
      const c = tally();
      let wasLook = false;
      let wasSpin = false;
      runUntil(r, IDLE.delay + 8, (o) => {
        if (o.blink) c.blink++;
        if (o.hop) c.hop++;
        if (o.beep) c.beep++;
        if (o.headYaw !== 0) wasLook = true;
        if (o.spin !== 0) wasSpin = true;
      });
      expect(c.beep).toBe(1);
      expect(c.blink).toBeGreaterThanOrEqual(1);
      expect(wasLook).toBe(true);
      expect(c.hop === 1 || wasSpin).toBe(true);
      expect(c.hop + (wasSpin ? 1 : 0)).toBe(1);
    }
  });

  it("fires each trigger on exactly one frame", () => {
    const r = makeRun(cycle([0.1, 0.2]));
    const frames: number[] = [];
    runUntil(r, IDLE.delay + 8, (o, t) => {
      if (o.beep) frames.push(t);
    });
    expect(frames).toHaveLength(1);
  });
});

describe("interrupts", () => {
  it("a seq bump mid-sequence returns the zero output and restarts the wait", () => {
    const r = makeRun();
    runUntil(r, IDLE.delay + 1);
    r.seq += 1;
    const bumpAt = r.t;
    const o = tick(r);
    expect(o).toEqual({ action: null, headYaw: 0, spin: 0, blink: false, hop: false, beep: false });
    let first = -1;
    runUntil(r, bumpAt + 30, (out, t) => {
      if (out.action !== null && first < 0) first = t;
    });
    expect(first).toBeGreaterThanOrEqual(bumpAt + IDLE.delay - 1e-6);
    expect(first).toBeLessThan(bumpAt + IDLE.delay + 2 * dt);
  });

  it("eligible false behaves the same", () => {
    const r = makeRun();
    runUntil(r, IDLE.delay + 1);
    r.eligible = false;
    const lostAt = r.t;
    expect(tick(r)).toEqual({ action: null, headYaw: 0, spin: 0, blink: false, hop: false, beep: false });
    r.eligible = true;
    let first = -1;
    runUntil(r, lostAt + 30, (out, t) => {
      if (out.action !== null && first < 0) first = t;
    });
    expect(first).toBeGreaterThanOrEqual(lostAt + IDLE.delay - 1e-6);
    expect(first).toBeLessThan(lostAt + IDLE.delay + 2 * dt);
  });
});

describe("repeats", () => {
  it("consecutive sequences use different templates", () => {
    for (const rv of [0, 0.3, 0.5, 0.99, 1]) {
      const r = makeRun(() => rv);
      const seen: number[] = [];
      let prev = -1;
      runUntil(r, 200, () => {
        if (r.s.active >= 0 && r.s.active !== prev) {
          seen.push(r.s.active);
          prev = r.s.active;
        } else if (r.s.active < 0) prev = -1;
      });
      expect(seen.length).toBeGreaterThan(3);
      for (let k = 1; k < seen.length; k++) expect(seen[k]).not.toBe(seen[k - 1]);
    }
  });

  it("waits gapMin to gapMax seconds after a sequence ends", () => {
    for (const [rv, gap] of [
      [0, IDLE.gapMin],
      [1, IDLE.gapMax],
    ] as const) {
      const r = makeRun(() => rv);
      let ended = -1;
      let nextStart = -1;
      let wasActive = false;
      runUntil(r, 100, (_o, t) => {
        const active = r.s.active >= 0;
        if (wasActive && !active && ended < 0) ended = t;
        if (!wasActive && active && ended >= 0 && nextStart < 0) nextStart = t;
        wasActive = active;
      });
      expect(nextStart - ended).toBeGreaterThanOrEqual(gap - 2 * dt);
      expect(nextStart - ended).toBeLessThan(gap + 3 * dt);
    }
  });

  it("beeps at most once per idle period across several sequences", () => {
    const r = makeRun();
    let beeps = 0;
    let sequences = 0;
    let wasActive = false;
    runUntil(r, 120, (o) => {
      if (o.beep) beeps++;
      const active = r.s.active >= 0;
      if (active && !wasActive) sequences++;
      wasActive = active;
    });
    expect(sequences).toBeGreaterThan(3);
    expect(beeps).toBe(1);
    r.seq += 1;
    tick(r);
    runUntil(r, r.t + IDLE.delay + 8, (o) => {
      if (o.beep) beeps++;
    });
    expect(beeps).toBe(2);
  });
});

describe("reduced motion", () => {
  it("fires only blinks and ends on time", () => {
    for (let idx = 0; idx < IDLE_SEQUENCES.length; idx++) {
      const r = makeRun(cycle([(idx + 0.1) / IDLE_SEQUENCES.length, 0.2]));
      r.reduced = true;
      let blinks = 0;
      let startedAt = -1;
      let endedAt = -1;
      let wasActive = false;
      runUntil(r, IDLE.delay + 8, (o, t) => {
        expect(o.hop).toBe(false);
        expect(o.beep).toBe(false);
        expect(o.headYaw).toBe(0);
        expect(o.spin).toBe(0);
        expect(o.action === null || o.action === "blink").toBe(true);
        if (o.blink) blinks++;
        const active = r.s.active >= 0;
        if (active && !wasActive && startedAt < 0) startedAt = t;
        if (!active && wasActive && endedAt < 0) endedAt = t;
        wasActive = active;
      });
      const steps = IDLE_SEQUENCES[idx];
      expect(blinks).toBe(steps.filter((s) => s.action === "blink").length);
      const length = Math.max(...steps.map((s) => s.at + s.dur));
      expect(endedAt - startedAt).toBeGreaterThanOrEqual(length - 1e-6);
      expect(endedAt - startedAt).toBeLessThan(length + 2 * dt);
    }
  });
});

describe("look and spin shapes", () => {
  it("yaw swings both ways within lookYaw and returns to 0 at the step end", () => {
    const r = makeRun(cycle([0.1, 0.2]));
    const look = IDLE_SEQUENCES[0].find((s) => s.action === "look")!;
    let start = -1;
    let min = 0;
    let max = 0;
    let after: number | null = null;
    runUntil(r, IDLE.delay + 6, (o, t) => {
      if (start < 0 && r.s.active >= 0) start = t;
      if (start < 0) return;
      min = Math.min(min, o.headYaw);
      max = Math.max(max, o.headYaw);
      if (t - start >= look.at + look.dur && after === null) after = o.headYaw;
    });
    expect(Math.abs(max)).toBeLessThanOrEqual(IDLE.lookYaw);
    expect(Math.abs(min)).toBeLessThanOrEqual(IDLE.lookYaw);
    expect(max).toBeGreaterThan(0.1);
    expect(min).toBeLessThan(-0.1);
    expect(after).toBe(0);
  });

  it("spin goes a full turn in the chosen direction and is exactly 0 otherwise", () => {
    for (const [dirRandom, dir] of [
      [0.2, -1],
      [0.8, 1],
    ] as const) {
      // Template 1 holds the spin; its first draw is floor(random * 4) = 1.
      const r = makeRun(cycle([0.3, dirRandom]));
      let peak = 0;
      let lastActive = 0;
      let outside = true;
      runUntil(r, IDLE.delay + 8, (o) => {
        if (o.spin !== 0) {
          peak = Math.abs(o.spin) > Math.abs(peak) ? o.spin : peak;
          lastActive = o.spin;
        } else if (lastActive === 0) outside = outside && o.spin === 0;
      });
      expect(Math.sign(peak)).toBe(dir);
      expect(Math.abs(peak)).toBeGreaterThan(2 * Math.PI * 0.95);
      expect(Math.abs(peak)).toBeLessThanOrEqual(2 * Math.PI + 1e-9);
      expect(Math.abs(lastActive) / (2 * Math.PI)).toBeGreaterThan(0.95);
      expect(outside).toBe(true);
    }
  });
});

describe("idleEligible", () => {
  const base: EligibleInput = {
    phase: "explore",
    missionRunning: false,
    ride: false,
    beam: false,
    picker: false,
    driving: false,
    speed: 0,
    cameraBlend: 0,
    askFace: false,
  };

  it("is true when nothing blocks", () => {
    expect(idleEligible(base)).toBe(true);
    expect(idleEligible({ ...base, speed: 0.049, cameraBlend: 0.01 })).toBe(true);
  });

  it("each blocker alone makes it false", () => {
    const blockers: Partial<EligibleInput>[] = [
      { phase: "boot" },
      { missionRunning: true },
      { ride: true },
      { beam: true },
      { picker: true },
      { driving: true },
      { speed: 0.05 },
      { cameraBlend: 0.02 },
      { askFace: true },
    ];
    for (const b of blockers) expect(idleEligible({ ...base, ...b })).toBe(false);
  });
});

describe("activity", () => {
  it("bumpActivity increments seq", () => {
    const before = activity.seq;
    bumpActivity();
    expect(activity.seq).toBe(before + 1);
  });

  it("watchActivity adds and removes the five listeners and bumps seq", () => {
    expect(ACTIVITY_EVENTS).toHaveLength(5);
    const add = vi.fn();
    const remove = vi.fn();
    const stop = watchActivity({ addEventListener: add, removeEventListener: remove });
    expect(add).toHaveBeenCalledTimes(5);
    expect(add.mock.calls.map((c) => c[0])).toEqual([...ACTIVITY_EVENTS]);
    for (const c of add.mock.calls) expect(c[2]).toEqual({ capture: true, passive: true });
    const before = activity.seq;
    (add.mock.calls[0][1] as () => void)();
    expect(activity.seq).toBe(before + 1);
    stop();
    expect(remove).toHaveBeenCalledTimes(5);
    expect(remove.mock.calls.map((c) => c[0])).toEqual([...ACTIVITY_EVENTS]);
    for (let k = 0; k < 5; k++) expect(remove.mock.calls[k][1]).toBe(add.mock.calls[k][1]);
  });
});
