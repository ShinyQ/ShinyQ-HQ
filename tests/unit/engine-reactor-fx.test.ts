import { describe, expect, it } from "vitest";
import { ENGINE } from "@/experience/floors/engine/layout";
import { REACTOR, type ReactorLane } from "@/experience/floors/engine/reactor";
import {
  CORE_FX,
  coreDetail,
  coreSolids,
  coolantRisers,
  IDLE_TONE,
  LANE_TONES,
  nextFlash,
  pulseLevel,
  ringAngle,
  segmentColors,
  segmentPose,
  sparkPos,
} from "@/experience/floors/engine/reactorFx";

describe("B1 reactor core instances", () => {
  it("draws 4 rings, half the segments and no sparks on the lite tier", () => {
    const full = coreDetail("full");
    const lite = coreDetail("lite");
    expect(CORE_FX.rings).toHaveLength(4);
    expect(full.segments).toBe(full.perRing * CORE_FX.rings.length);
    expect(lite.segments * 2).toBe(full.segments);
    expect(full.sparks).toBe(REACTOR.sparks);
    expect(lite.sparks).toBe(0);
    // Lite still shows every lane of a full run (24) on its own segment.
    expect(lite.segments).toBeGreaterThanOrEqual(REACTOR.lanes);
  });

  it("colors segments by lane status: running cyan, failed red, done green, queued dim", () => {
    expect(LANE_TONES).toEqual({ running: "#22d3ee", failed: "#f87171", done: "#34d399", queued: "#71717a" });
    const lanes: ReactorLane[] = ["running", "failed", "done", "queued"];
    const colors = segmentColors(lanes, 8);
    expect(colors).toEqual(["#22d3ee", "#22d3ee", "#f87171", "#f87171", "#34d399", "#34d399", "#71717a", "#71717a"]);
  });

  it("spreads each lane over a contiguous run and covers every segment", () => {
    const lanes: ReactorLane[] = ["done", "running", "failed"];
    const colors = segmentColors(lanes, 48);
    expect(colors).toHaveLength(48);
    expect(new Set(colors)).toEqual(new Set([LANE_TONES.done, LANE_TONES.running, LANE_TONES.failed]));
    expect(colors.slice(0, 16).every((c) => c === LANE_TONES.done)).toBe(true);
    expect(colors.slice(32).every((c) => c === LANE_TONES.failed)).toBe(true);
  });

  it("burns dim amber idle on every segment without lanes", () => {
    expect(segmentColors([], 24)).toEqual(Array.from({ length: 24 }, () => IDLE_TONE));
  });

  it("puts every segment on its ring around the core, slots evenly spaced", () => {
    const { perRing } = coreDetail("full");
    CORE_FX.rings.forEach((ring, i) => {
      for (let k = 0; k < perRing; k++) {
        const p = segmentPose(i, k, perRing, 0);
        expect(p.y).toBe(ring.y);
        expect(p.r).toBe(ring.r);
        expect(p.yaw).toBeCloseTo((k / perRing) * Math.PI * 2);
      }
    });
    expect(segmentPose(1, 0, perRing, 0.5).yaw).toBeCloseTo(0.5);
  });

  it("turns the rings in alternating directions, and not at all under reduced motion", () => {
    expect(ringAngle(0, 10, false)).toBeGreaterThan(0);
    expect(ringAngle(1, 10, false)).toBeLessThan(0);
    expect(Math.sign(ringAngle(2, 10, false))).toBe(Math.sign(ringAngle(0, 10, false)));
    for (let i = 0; i < CORE_FX.rings.length; i++) expect(ringAngle(i, 10, true)).toBe(0);
    // Slow enough for B1's 30 fps idle cadence: under 0.6 px a frame needs well under 0.4 u/s at the rim.
    for (const ring of CORE_FX.rings) expect(Math.abs(ringAngle(0, 1, false)) * ring.r).toBeLessThan(0.4);
  });

  it("orbits sparks between the coolant shell and the inner rings, under the cap, moving with time", () => {
    const innerRing = Math.min(...CORE_FX.rings.map((r) => r.r));
    for (let j = 0; j < REACTOR.sparks; j++) {
      for (const t of [0, 3.7, 42]) {
        const p = sparkPos(j, t);
        const r = Math.hypot(p.x, p.z);
        expect(r).toBeGreaterThan(CORE_FX.shell.r);
        expect(r).toBeLessThan(innerRing);
        expect(p.y).toBeGreaterThan(CORE_FX.plinth);
        expect(p.y).toBeLessThan(ENGINE.reactor.h - 1);
      }
      const a = sparkPos(j, 0);
      const b = sparkPos(j, 1);
      expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(0);
    }
  });

  it("pulses between a calm floor and full, and freezes at a steady level under reduced motion", () => {
    const levels = Array.from({ length: 64 }, (_, i) => pulseLevel((i / 64) * Math.PI * 2, false));
    expect(Math.min(...levels)).toBeGreaterThan(0.5);
    expect(Math.max(...levels)).toBeLessThanOrEqual(1);
    expect(Math.max(...levels) - Math.min(...levels)).toBeGreaterThan(0.25);
    expect(pulseLevel(0, true)).toBe(pulseLevel(2, true));
  });

  it("flashes on a fresh deploy and on a newer deploy seen later, never on an old one at first sight", () => {
    const now = 1_000_000;
    // First sight of a deploy an hour old: remembered, no flash.
    let f = nextFlash({ seen: null, at: null }, now - 3_600_000, now);
    expect(f).toEqual({ seen: now - 3_600_000, at: now - 3_600_000 });
    // A newer deploy arrives with a poll: flash from the moment it shows.
    f = nextFlash(f, now - 20_000, now);
    expect(f).toEqual({ seen: now - 20_000, at: now });
    // The same deploy again: unchanged.
    expect(nextFlash(f, now - 20_000, now + 5_000)).toBe(f);
    // No deploy (offline or idle): keep what was seen, no new flash.
    expect(nextFlash(f, null, now + 9_000)).toBe(f);
  });
});

describe("B1 reactor core solids", () => {
  const R = ENGINE.reactor;
  const solids = coreSolids();

  it("stands inside the reactor rect, tops out at the core height under the ceiling", () => {
    for (const s of solids) {
      expect(s.x - s.w / 2).toBeGreaterThanOrEqual(R.x - R.r);
      expect(s.x + s.w / 2).toBeLessThanOrEqual(R.x + R.r);
      expect(s.z - s.d / 2).toBeGreaterThanOrEqual(R.z - R.r);
      expect(s.z + s.d / 2).toBeLessThanOrEqual(R.z + R.r);
      expect(s.y + s.h).toBeLessThanOrEqual(R.h + 1e-9);
    }
    expect(Math.max(...solids.map((s) => s.y + s.h))).toBeCloseTo(R.h);
    expect(R.h).toBeLessThan(ENGINE.ceiling);
  });

  it("keeps the rings clear of the coolant risers and the cap", () => {
    const risers = coolantRisers();
    expect(risers).toHaveLength(4);
    const outer = Math.max(...CORE_FX.rings.map((r) => r.r));
    for (const p of risers) expect(Math.hypot(p.x, p.z) - p.r).toBeGreaterThan(outer + 0.5);
    for (const ring of CORE_FX.rings) expect(ring.y + CORE_FX.segH / 2).toBeLessThan(CORE_FX.capY);
  });
});
