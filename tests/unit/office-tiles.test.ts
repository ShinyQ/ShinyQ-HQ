import { describe, expect, it } from "vitest";
import { LOBBY } from "@/experience/config";
import { officeObstacles, officeRoad, officeSlots, officeZone } from "@/experience/floors/lobby/officeLayout";
import { stepTileAlpha, TILE_COUNT, TILES, tileCenters, tileLevels } from "@/experience/floors/lobby/office/tiles";
import type { Rect } from "@/experience/types";

const W = LOBBY.officeWing;
const f32 = (n: number, v = 0) => new Float32Array(n).fill(v);
const half = TILES.size / 2;
const tileRect = (c: { x: number; z: number }): Rect => ({ minX: c.x - half, maxX: c.x + half, minZ: c.z - half, maxZ: c.z + half });
const overlap = (a: Rect, b: Rect) => a.minX < b.maxX && a.maxX > b.minX && a.minZ < b.maxZ && a.maxZ > b.minZ;

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

describe("tileLevels", () => {
  it("dims all with no merges", () => {
    expect([...tileLevels(0, f32(TILE_COUNT))].every((v) => Math.fround(TILES.dim) === v)).toBe(true);
  });
  it("lights the first merges in order", () => {
    const l = tileLevels(5, f32(TILE_COUNT));
    expect([...l].filter((v) => v === Math.fround(TILES.lit))).toHaveLength(5);
    expect(l[4]).toBeCloseTo(TILES.lit);
    expect(l[5]).toBeCloseTo(TILES.dim);
  });
  it("brightens the next 24 past the first 24", () => {
    const l = tileLevels(30, f32(TILE_COUNT));
    expect([...l].filter((v) => v === 1)).toHaveLength(6);
    expect([...l].filter((v) => v === Math.fround(TILES.lit))).toHaveLength(18);
    expect([...tileLevels(99, f32(TILE_COUNT))].every((v) => v === 1)).toBe(true);
  });
});

describe("stepTileAlpha", () => {
  const settle = (reduced: boolean, merged: number) => {
    const alpha = f32(TILE_COUNT, TILES.dim);
    const target = tileLevels(merged, f32(TILE_COUNT));
    const clock = { next: 0 };
    let t = 0;
    for (let i = 0; i < 2000 && stepTileAlpha(alpha, target, clock, t, 0.016, reduced); i++) t += 0.016;
    return { alpha, target, t };
  };

  it("lights a tile over its fade", () => {
    const alpha = f32(TILE_COUNT, TILES.dim);
    const target = tileLevels(1, f32(TILE_COUNT));
    const clock = { next: 0 };
    expect(stepTileAlpha(alpha, target, clock, 0, 0.1, false)).toBe(true);
    expect(alpha[0]).toBeGreaterThan(TILES.dim);
    expect(alpha[0]).toBeLessThan(TILES.lit);
    let t = 0.1;
    while (stepTileAlpha(alpha, target, clock, t, 0.05, false)) t += 0.05;
    expect(alpha[0]).toBe(target[0]);
    expect(t).toBeLessThan(TILES.fadeS + 0.2);
  });

  it("starts at most one tile per gap", () => {
    const alpha = f32(TILE_COUNT, TILES.dim);
    const target = tileLevels(10, f32(TILE_COUNT));
    const clock = { next: 0 };
    const started: number[] = [];
    let t = 0;
    for (let i = 0; i < 400; i++, t += 0.016) {
      const before = alpha.slice();
      stepTileAlpha(alpha, target, clock, t, 0.016, false);
      for (let k = 0; k < TILE_COUNT; k++) if (before[k] === Math.fround(TILES.dim) && alpha[k] > before[k]) started.push(t);
    }
    expect(started).toHaveLength(10);
    for (let i = 1; i < started.length; i++) expect(started[i] - started[i - 1]).toBeGreaterThanOrEqual(TILES.gapS - 1e-9);
  });

  it("settles, then writes nothing", () => {
    const { alpha, target } = settle(false, 30);
    expect([...alpha]).toEqual([...target]);
    expect(stepTileAlpha(alpha, target, { next: 0 }, 99, 0.016, false)).toBe(false);
  });

  it("jumps to every target in one step under reduced motion", () => {
    const alpha = f32(TILE_COUNT, TILES.dim);
    const target = tileLevels(40, f32(TILE_COUNT));
    expect(stepTileAlpha(alpha, target, { next: 0 }, 0, 0.016, true)).toBe(true);
    expect([...alpha]).toEqual([...target]);
  });

  it("dims at once, never staggered", () => {
    const alpha = tileLevels(24, f32(TILE_COUNT));
    const target = tileLevels(3, f32(TILE_COUNT));
    expect(stepTileAlpha(alpha, target, { next: 1e9 }, 0, 0.016, false)).toBe(true);
    expect([...alpha]).toEqual([...target]);
  });
});
