import { describe, expect, it } from "vitest";
import { buildFloorLayouts, ROVER } from "@/experience/config";
import { collides, distanceToRect, resolveCircle } from "@/experience/nav/collision";
import { buildNavGrid, findPath, isWalkable, nearestWalkable } from "@/experience/nav/navgrid";
import type { Rect, Vec2 } from "@/experience/types";

const bounds: Rect = { minX: -10, maxX: 10, minZ: -10, maxZ: 10 };
const wall: Rect = { minX: -0.5, maxX: 0.5, minZ: -6, maxZ: 10 };

describe("resolveCircle", () => {
  it("slides along a wall instead of stopping", () => {
    // Moving diagonally into the wall's west face: x is pushed back, z is kept.
    const p = resolveCircle({ x: -1, z: 2 }, 1, [wall], bounds);
    expect(p.x).toBeCloseTo(-1.5);
    expect(p.z).toBeCloseTo(2);
  });

  it("pushes a circle out of a box along the shortest axis", () => {
    const p = resolveCircle({ x: 0.2, z: 5 }, 1, [wall], bounds);
    expect(p.x).toBeCloseTo(1.5);
    expect(p.z).toBeCloseTo(5);
  });

  it("resolves corners radially", () => {
    const p = resolveCircle({ x: 0.9, z: -6.3 }, 1, [wall], bounds);
    expect(distanceToRect(p, wall)).toBeCloseTo(1);
  });

  it("keeps the circle inside the floor bounds", () => {
    expect(resolveCircle({ x: 50, z: -50 }, 1, [], bounds)).toEqual({ x: 9, z: -9 });
  });

  it("reports collisions", () => {
    expect(collides({ x: -1, z: 0 }, 1, [wall])).toBe(true);
    expect(collides({ x: -2, z: 0 }, 1, [wall])).toBe(false);
  });
});

const pathLength = (from: Vec2, pts: Vec2[]) =>
  pts.reduce((acc, p, i) => acc + Math.hypot(p.x - (i ? pts[i - 1].x : from.x), p.z - (i ? pts[i - 1].z : from.z)), 0);

function segmentClear(grid: ReturnType<typeof buildNavGrid>, a: Vec2, b: Vec2) {
  const steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.1);
  for (let s = 1; s <= steps; s++) {
    const t = s / steps;
    if (!isWalkable(grid, { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t })) return false;
  }
  return true;
}

describe("navgrid A*", () => {
  const grid = buildNavGrid({ bounds, obstacles: [wall] }, 1);

  it("marks inflated obstacles and edges as blocked", () => {
    expect(isWalkable(grid, { x: 0, z: 0 })).toBe(false);
    expect(isWalkable(grid, { x: 0.7, z: 0 })).toBe(false);
    expect(isWalkable(grid, { x: -2.5, z: 0 })).toBe(true);
    expect(isWalkable(grid, { x: -9.8, z: 0 })).toBe(false);
  });

  it("collapses an open straight line to one waypoint", () => {
    const path = findPath(grid, { x: -7.5, z: 4.5 }, { x: -3.5, z: 4.5 });
    expect(path).toEqual([{ x: -3.5, z: 4.5 }]);
  });

  it("routes around a wall without entering it", () => {
    const from = { x: -5.5, z: 5.5 };
    const to = { x: 5.5, z: 5.5 };
    const path = findPath(grid, from, to)!;
    expect(path.at(-1)).toEqual(to);
    expect(path.length).toBeGreaterThan(1);
    let prev = from;
    for (const p of path) {
      expect(segmentClear(grid, prev, p)).toBe(true);
      prev = p;
    }
    // The detour goes under the wall end at z = -6.
    expect(Math.min(...path.map((p) => p.z))).toBeLessThan(-6);
    expect(pathLength(from, path)).toBeLessThan(40);
  });

  it("snaps a target inside an obstacle to the closest reachable cell", () => {
    const path = findPath(grid, { x: -5.5, z: 0.5 }, { x: 0, z: 0.5 })!;
    const end = path.at(-1)!;
    expect(isWalkable(grid, end)).toBe(true);
    expect(Math.abs(end.x)).toBeLessThanOrEqual(2.5);
  });

  it("snaps a target in a sealed pocket to the reachable side", () => {
    const sealed = buildNavGrid({ bounds, obstacles: [{ minX: -0.5, maxX: 0.5, minZ: -10, maxZ: 10 }] }, 1);
    const path = findPath(sealed, { x: -5.5, z: 0.5 }, { x: 5.5, z: 0.5 })!;
    expect(path.at(-1)!.x).toBeLessThan(0);
  });

  it("starts from the nearest walkable cell when the rover sits in a blocked one", () => {
    const path = findPath(grid, { x: -9.9, z: 0.5 }, { x: -5.5, z: 0.5 });
    expect(path?.at(-1)).toEqual({ x: -5.5, z: 0.5 });
  });

  it("finds the nearest walkable point", () => {
    expect(nearestWalkable(grid, { x: -5, z: 0 })).toEqual({ x: -5, z: 0 });
    expect(isWalkable(grid, nearestWalkable(grid, { x: 0, z: 0 })!)).toBe(true);
  });

  it("connects the Lobby spawn to the elevator approach", () => {
    const l1 = buildFloorLayouts(8).L1;
    const lobby = buildNavGrid(l1, ROVER.radius);
    expect(isWalkable(lobby, l1.spawn)).toBe(true);
    const path = findPath(lobby, l1.spawn, l1.approach)!;
    expect(path.at(-1)).toEqual(l1.approach);
    for (const p of path) expect(collides(p, ROVER.radius, l1.obstacles)).toBe(false);
  });
});
