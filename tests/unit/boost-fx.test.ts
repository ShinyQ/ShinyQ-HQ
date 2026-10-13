import { describe, expect, it } from "vitest";
import { boostFxConfig, fxActive } from "@/experience/fx/boostConfig";
import { SparkPool } from "@/experience/fx/sparks";
import { STREAK_MAX, streakAttributes } from "@/experience/fx/streaks";
import { BOOST } from "@/experience/rover/boost";

describe("boost effect gating", () => {
  it("is drawn only above the trail threshold", () => {
    expect(fxActive(0)).toBe(false);
    expect(fxActive(BOOST.trailMin)).toBe(false);
    expect(fxActive(0.5)).toBe(true);
  });

  it("tones the lite tier down and turns everything off under reduced motion", () => {
    const full = boostFxConfig("full", false);
    const lite = boostFxConfig("lite", false);
    expect(full.trail && lite.trail && lite.trail.samples < full.trail.samples).toBe(true);
    expect(full.streaks && lite.streaks && lite.streaks.count < full.streaks.count && lite.streaks.opacity < full.streaks.opacity).toBe(true);
    expect(full.sparks?.max).toBe(48);
    expect(lite.sparks?.max).toBe(16);
    expect(full.buzz).toBe(true);
    expect(lite.buzz).toBe(false);
    for (const tier of ["full", "lite"] as const) {
      const reduced = boostFxConfig(tier, true);
      expect(reduced).toEqual({ trail: null, streaks: null, sparks: null, buzz: false, camera: false, body: false });
    }
  });
});

describe("spark pool", () => {
  it("never holds more than its cap and recycles the oldest", () => {
    const pool = new SparkPool(4);
    for (let i = 0; i < 10; i++) pool.emit(i, 1, 0, 0, 0, 0, 0.4, 0);
    pool.step(0.01);
    expect(pool.alive).toBe(4);
    expect(Array.from(pool.px)).toEqual([8, 9, 6, 7]);
  });

  it("falls under gravity, bounces off the floor and expires", () => {
    const pool = new SparkPool(2);
    pool.emit(0, 0.2, 0, 1, 2, 0, 0.3, 0);
    pool.step(0.05);
    expect(pool.px[0]).toBeGreaterThan(0);
    expect(pool.vy[0]).toBeLessThan(2);
    for (let i = 0; i < 4; i++) pool.step(0.05);
    expect(pool.py[0]).toBeGreaterThanOrEqual(0);
    pool.step(0.2);
    expect(pool.alive).toBe(0);
    pool.emit(0, 0, 0, 0, 0, 0, 1, 0);
    pool.clear();
    expect(pool.alive).toBe(0);
  });
});

describe("speed streaks", () => {
  it("builds one quad per streak, outside the clear center", () => {
    const { corner, seed, indices } = streakAttributes(STREAK_MAX);
    expect(corner.length).toBe(STREAK_MAX * 4 * 2);
    expect(seed.length).toBe(STREAK_MAX * 4 * 4);
    expect(indices.length).toBe(STREAK_MAX * 6);
    // seed: angle, phase, speed, inner radius; every streak starts outside the clear center.
    for (let i = 0; i < STREAK_MAX; i++) expect(seed[i * 16 + 3]).toBeGreaterThanOrEqual(0.7);
  });
});
