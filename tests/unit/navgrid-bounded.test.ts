import { describe, expect, it } from "vitest";
import type { FloorId } from "@/content/schema";
import { ROVER } from "@/experience/config";
import { buildNavGrid, componentsOf, findPath, nearestWalkable, pathStats } from "@/experience/nav/navgrid";
import type { Vec2 } from "@/experience/types";
import * as legacy from "../helpers/navgrid-legacy";
import { realLayouts } from "../helpers/real-layouts";

const rng = (seed: number) => {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
};

describe("findPath returns exactly what the pre-round-5 implementation returned", () => {
  const layouts = realLayouts();
  for (const id of Object.keys(layouts) as FloorId[]) {
    it(`on ${id}: 60 seeded pairs (some off the slab or inside obstacles), spawn, approach and every door`, () => {
      const layout = layouts[id];
      const grid = buildNavGrid(layout, ROVER.radius);
      const { minX, maxX, minZ, maxZ } = layout.bounds;
      const rand = rng(id.charCodeAt(0) * 131 + id.charCodeAt(1));
      const point = (): Vec2 => ({ x: minX - 3 + rand() * (maxX - minX + 6), z: minZ - 3 + rand() * (maxZ - minZ + 6) });
      const pairs: [Vec2, Vec2][] = [
        [layout.spawn, layout.approach],
        [layout.approach, layout.spawn],
      ];
      for (const door of layout.doors ?? []) pairs.push([layout.approach, door.at]);
      for (let k = 0; k < 60; k++) pairs.push([point(), point()]);
      for (const [a, b] of pairs) expect(findPath(grid, a, b), `${id} ${JSON.stringify([a, b])}`).toEqual(legacy.findPath(grid, a, b));
      for (let k = 0; k < 20; k++) {
        const p = point();
        expect(nearestWalkable(grid, p)).toEqual(legacy.nearestWalkable(grid, p));
      }
    }, 120_000);
  }
});

describe("findPath does bounded work", () => {
  const bounds = { minX: -200, maxX: 200, minZ: -200, maxZ: 200 };

  it("labels a grid's regions once and reuses the labels", () => {
    const grid = buildNavGrid({ bounds, obstacles: [] }, 0.5);
    expect(componentsOf(grid)).toBe(componentsOf(grid));
  });

  it("expands only cells near a short hop on a 160k cell grid", () => {
    const grid = buildNavGrid({ bounds, obstacles: [] }, 0.5);
    componentsOf(grid);
    expect(findPath(grid, { x: 0.5, z: 0.5 }, { x: 10.5, z: 4.5 })?.at(-1)).toEqual({ x: 10.5, z: 4.5 });
    expect(pathStats.expanded).toBeLessThan(200);
    expect(pathStats.scanned).toBe(0);
  });

  it("snaps a blocked target with a local ring search, not a whole-grid scan", () => {
    const grid = buildNavGrid({ bounds, obstacles: [{ minX: 8, maxX: 12, minZ: -2, maxZ: 2 }] }, 0.5);
    componentsOf(grid);
    expect(findPath(grid, { x: 0.5, z: 0.5 }, { x: 10, z: 0 })).not.toBeNull();
    expect(pathStats.scanned).toBeLessThan(400);
    expect(pathStats.expanded).toBeLessThan(400);
  });
});
