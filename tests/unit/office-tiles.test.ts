import { describe, expect, it } from "vitest";
import { LOBBY } from "@/experience/config";
import { officeObstacles, officeRoad, officeSlots, officeZone } from "@/experience/floors/lobby/officeLayout";
import { STAGE_KIND } from "@/experience/floors/lobby/hallStage";
import { stepTileAlpha, TILE_COUNT, TILE_KIND, TILES, tileCenters } from "@/experience/floors/lobby/office/tiles";
import type { Rect } from "@/experience/types";

const W = LOBBY.officeWing;
const f32 = (n: number, v = 0) => new Float32Array(n).fill(v);
const half = TILES.size / 2;
const tileRect = (c: { x: number; z: number }): Rect => ({ minX: c.x - half, maxX: c.x + half, minZ: c.z - half, maxZ: c.z + half });
const overlap = (a: Rect, b: Rect) => a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;

describe("tile kind", () => {
  it("is the hall stage tile kind, kept as a literal off the hall modules", () => {
    expect(TILE_KIND).toBe(STAGE_KIND.tile);
  });
});

describe("tile grid", () => {
  const centers = tileCenters(W);
  const { plaza } = officeRoad(W);
  const plazaRect: Rect = { minX: plaza.center.x - plaza.w / 2, maxX: plaza.center.x + plaza.w / 2, minZ: plaza.center.z - plaza.d / 2, maxZ: plaza.center.z + plaza.d / 2 };

  it("has 24 tiles inside the wing plaza", () => {
    expect(centers).toHaveLength(TILE_COUNT);
    for (const c of centers) {
      const r = tileRect(c);
      expect(r.minX).toBeGreaterThanOrEqual(plazaRect.minX);
      expect(r.maxX).toBeLessThanOrEqual(plazaRect.maxX);
      expect(r.minZ).toBeGreaterThanOrEqual(plazaRect.minZ);
      expect(r.maxZ).toBeLessThanOrEqual(plazaRect.maxZ);
    }
  });

  it("stays out of the view zone, the obstacles and the desks", () => {
    const zone = officeZone(W).area;
    const blocked = [...officeObstacles(W), ...officeSlots(W).map((s) => s.rect)];
    for (const c of centers) {
      const r = tileRect(c);
      expect(overlap(r, zone)).toBe(false);
      for (const b of blocked) expect(overlap(r, b)).toBe(false);
    }
  });

  it("sits on the wing axis with the gap between tiles", () => {
    const xs = centers.map((c) => c.x);
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(W.lead.x, 9);
    expect(centers[1].x - centers[0].x).toBeCloseTo(TILES.size + TILES.gap, 9);
    expect(centers[0].z).toBeCloseTo(W.rect.minZ + TILES.z0 + half, 9);
  });
});

const lit = Math.fround(TILES.lit);
const dim = Math.fround(TILES.dim);
const fresh = () => ({ alpha: f32(TILE_COUNT, TILES.dim), clock: { next: 0, lit: 0 } });
const run = (alpha: Float32Array, clock: { next: number; lit: number }, merged: number, from: number, reduced = false, seconds = 30) => {
  const starts: number[] = [];
  let t = from;
  for (let i = 0; i < seconds / 0.016; i++, t += 0.016) {
    const before = alpha.slice();
    stepTileAlpha(alpha, merged, clock, t, 0.016, reduced);
    const begun = [...alpha].filter((v, k) => v > before[k] && (before[k] === dim || before[k] === lit)).length;
    if (begun) starts.push(t);
    if (!reduced && begun > 1) throw new Error(`${begun} tiles started in one frame`);
  }
  return { starts, t };
};

describe("stepTileAlpha", () => {
  it("lights a tile over its fade to the rounded resting level", () => {
    const { alpha, clock } = fresh();
    expect(stepTileAlpha(alpha, 1, clock, 0, 0.1, false)).toBe(true);
    expect(alpha[0]).toBeGreaterThan(TILES.dim);
    expect(alpha[0]).toBeLessThan(TILES.lit);
    let t = 0.1;
    while (stepTileAlpha(alpha, 1, clock, t, 0.05, false)) t += 0.05;
    expect(alpha[0]).toBe(lit);
    expect(t).toBeLessThan(TILES.fadeS + 0.2);
    expect(clock.lit).toBe(1);
  });

  it("starts at most one tile per gap", () => {
    const { alpha, clock } = fresh();
    const { starts } = run(alpha, clock, 10, 0);
    expect(starts).toHaveLength(10);
    for (let i = 1; i < starts.length; i++) expect(starts[i] - starts[i - 1]).toBeGreaterThanOrEqual(TILES.gapS - 1e-9);
  });

  it("settled lit tiles do not all start together when more merges come", () => {
    const { alpha, clock } = fresh();
    const { t } = run(alpha, clock, 24, 0);
    expect([...alpha].every((v) => v === lit)).toBe(true);
    const { starts } = run(alpha, clock, 48, t + 1);
    expect(starts).toHaveLength(24);
    for (let i = 1; i < starts.length; i++) expect(starts[i] - starts[i - 1]).toBeGreaterThanOrEqual(TILES.gapS - 1e-9);
    expect([...alpha].every((v) => v === 1)).toBe(true);
  });

  it("settles, then writes nothing, and counts the lit tiles", () => {
    const { alpha, clock } = fresh();
    run(alpha, clock, 30, 0);
    expect([...alpha].filter((v) => v === 1)).toHaveLength(6);
    expect(stepTileAlpha(alpha, 30, clock, 99, 0.016, false)).toBe(false);
    expect(clock.lit).toBe(24);
  });

  it("holds the levels for 0, 5 and 30 merges", () => {
    for (const [merged, full, litN] of [[0, 0, 0], [5, 0, 5], [30, 6, 18]]) {
      const { alpha, clock } = fresh();
      stepTileAlpha(alpha, merged, clock, 0, 0.016, true);
      expect([...alpha].filter((v) => v === 1)).toHaveLength(full);
      expect([...alpha].filter((v) => v === lit)).toHaveLength(litN);
      expect([...alpha].filter((v) => v === dim)).toHaveLength(TILE_COUNT - full - litN);
    }
  });

  it("jumps to every level in one step under reduced motion", () => {
    const { alpha, clock } = fresh();
    expect(stepTileAlpha(alpha, 40, clock, 0, 0.016, true)).toBe(true);
    expect([...alpha]).toEqual(Array.from({ length: TILE_COUNT }, (_, i) => (i < 16 ? 1 : lit)));
  });

  it("dims at once, never staggered", () => {
    const { alpha, clock } = fresh();
    stepTileAlpha(alpha, 24, clock, 0, 0.016, true);
    clock.next = 1e9;
    expect(stepTileAlpha(alpha, 3, clock, 0, 0.016, false)).toBe(true);
    expect([...alpha].filter((v) => v === lit)).toHaveLength(3);
    expect([...alpha].filter((v) => v === dim)).toHaveLength(21);
  });
});
