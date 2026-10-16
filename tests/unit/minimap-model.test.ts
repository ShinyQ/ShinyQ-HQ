import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildFloorLayouts, SHAFT } from "@/experience/config";
import { arrowRotation, buildFloorMap, floorBox, windowBox } from "@/hud/minimap/model";
import type { Interactable } from "@/experience/interact/registry";
import { ROOT, staticClosure } from "../helpers/import-graph";

const layouts = buildFloorLayouts(8);
const door = (id: string, room: string, x: number, z: number): Interactable =>
  ({ id, floor: "L1", kind: "door", label: room, at: { x, z }, bounds: { minX: x - 1, maxX: x + 1, minZ: z - 1, maxZ: z + 1 }, action: { type: "open-room", room } }) as Interactable;

describe("minimap model", () => {
  it("covers the floor bounds and the elevator shaft", () => {
    const map = buildFloorMap(layouts.L1, [], []);
    expect(map.view.minX).toBeLessThanOrEqual(SHAFT.x - SHAFT.size / 2);
    expect(map.view.minX + map.view.width).toBeGreaterThanOrEqual(layouts.L1.bounds.maxX);
    expect(map.elevator).toEqual({ x: SHAFT.x, z: SHAFT.z, size: SHAFT.size });
    expect(map.roads.length + map.plazas.length).toBeGreaterThan(0);
    expect(map.roads.every((r) => r.d.startsWith("M "))).toBe(true);
  });
  it("lists point-and-go rooms once, west to east, and dims visited rooms", () => {
    const items = [door("L1:door:b", "L1:stats", 10, 0), door("L1:door:a", "L1:profile", 2, 0), door("L1:door:a", "L1:profile", 2, 0)];
    const map = buildFloorMap(layouts.L1, items, ["L1:stats"]);
    expect(map.rooms.map((r) => r.id)).toEqual(["L1:door:a", "L1:door:b"]);
    expect(map.rooms.find((r) => r.id === "L1:door:b")?.visited).toBe(true);
  });
  it("north-up arrow: +z (south) points down, +x (east) points right", () => {
    expect(arrowRotation(0)).toBeCloseTo(180);
    expect(arrowRotation(Math.PI / 2)).toBeCloseTo(90);
    expect(arrowRotation(Math.PI)).toBeCloseTo(0);
  });
  it("view boxes", () => {
    expect(windowBox({ x: 0, z: 0 }, 20)).toBe("-20 -20 40 40");
    expect(floorBox({ minX: -1, minZ: -2, width: 3, depth: 4 })).toBe("-1 -2 3 4");
  });
  it("draws roads as M/L paths (loops close with Z) and spurs as two-point paths", () => {
    const map = buildFloorMap(layouts.L3, [], []);
    const road = layouts.L3.road!;
    expect(map.roads).toHaveLength(road.roads.length + road.spurs.length);
    for (const r of map.roads) expect(r.d).toMatch(/^M -?[\d.]+ -?[\d.]+( L -?[\d.]+ -?[\d.]+)+( Z)?$/);
    const closed = road.roads.findIndex((r) => r.closed);
    if (closed >= 0) expect(map.roads[closed].d.endsWith(" Z")).toBe(true);
    expect(map.roads.slice(road.roads.length).every((r) => r.d.split(" L ").length === 2)).toBe(true);
    expect(map.plazas).toHaveLength(road.plazas.length);
  });
  it("keeps only the map kinds", () => {
    const stray = { ...door("L1:other:x", "L1:stats", 4, 0), kind: "decoration" } as unknown as Interactable;
    const map = buildFloorMap(layouts.L1, [door("L1:door:a", "L1:profile", 2, 0), stray], []);
    expect(map.rooms.map((r) => r.id)).toEqual(["L1:door:a"]);
  });
  it("floors without a road network still get a view", () => {
    const map = buildFloorMap(layouts.L2, [], []);
    expect(map.roads).toEqual([]);
    expect(map.view.width).toBeGreaterThan(0);
    expect(map.view.depth).toBeGreaterThan(0);
  });
});

describe("minimap import graph", () => {
  it("never reaches three.js or a scene module", () => {
    for (const entry of ["src/hud/minimap/model.ts", "src/hud/minimap/Minimap.tsx", "src/hud/minimap/MapOverview.tsx"]) {
      for (const file of staticClosure(entry)) {
        expect(file, `${entry} reaches ${file}`).not.toMatch(/^src\/experience\/.*\.tsx$/);
        expect(readFileSync(join(ROOT, file), "utf8"), `${entry} reaches three through ${file}`).not.toMatch(/from\s+["'](three|@react-three\/[^"']+)["']/);
      }
    }
  });
});
