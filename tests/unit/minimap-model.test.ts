import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildFloorLayouts, LOBBY, SHAFT } from "@/experience/config";
import { arrowRotation, buildFloorMap, floorBox, labelAnchor, labelsDoors, windowBox } from "@/hud/minimap/model";
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
  it("draws a plain slab as one rect with no outline path", () => {
    const map = buildFloorMap(layouts.L1, [], []);
    const b = layouts.L1.bounds;
    expect(map.slab).toEqual([{ x: b.minX, z: b.minZ, w: b.maxX - b.minX, d: b.maxZ - b.minZ }]);
    expect(map.outline).toBe("");
    expect(map.area).toBe("");
  });
  it("covers a slab with a wing: one rect per slab rect, the view boxes them all and the outline skips the joint", () => {
    const b = layouts.L1.bounds;
    const wing = { minX: -12, maxX: 18, minZ: b.maxZ, maxZ: b.maxZ + 30 };
    const map = buildFloorMap({ ...layouts.L1, wings: [wing] }, [], []);
    expect(map.slab).toEqual([
      { x: b.minX, z: b.minZ, w: b.maxX - b.minX, d: b.maxZ - b.minZ },
      { x: -12, z: b.maxZ, w: 30, d: 30 },
    ]);
    // The view boxes the slab (wing included) padded 2 u; the shaft sits inside it on L1.
    const plain = buildFloorMap(layouts.L1, [], []).view;
    expect(map.view.minZ + map.view.depth).toBe(wing.maxZ + 2);
    expect([map.view.minX, map.view.minZ, map.view.width]).toEqual([plain.minX, plain.minZ, plain.width]);
    // The fill is one path of every rect (no seam at the joint).
    expect(map.area).toBe(`M ${b.minX} ${b.minZ} L ${b.maxX} ${b.minZ} L ${b.maxX} ${b.maxZ} L ${b.minX} ${b.maxZ} Z M -12 ${b.maxZ} L 18 ${b.maxZ} L 18 ${b.maxZ + 30} L -12 ${b.maxZ + 30} Z`);
    expect(map.outline).toMatch(/^(M -?[\d.]+ -?[\d.]+ L -?[\d.]+ -?[\d.]+ ?)+$/);
    const segments = map.outline.trim().split(/ (?=M)/).map((d) => d.match(/-?[\d.]+/g)!.map(Number));
    expect(segments).toHaveLength(8);
    // No segment runs along the joint (z = bounds.maxZ, x -12 to 18).
    const joint = segments.filter(([x1, z1, x2, z2]) => z1 === b.maxZ && z2 === b.maxZ && Math.min(x1, x2) < 18 && Math.max(x1, x2) > -12);
    expect(joint).toEqual([]);
  });
  it("floors without a road network still get a view", () => {
    const map = buildFloorMap(layouts.L2, [], []);
    expect(map.roads).toEqual([]);
    expect(map.view.width).toBeGreaterThan(0);
    expect(map.view.depth).toBeGreaterThan(0);
  });
});

describe("minimap structure", () => {
  it("gives the Lobby its lane ring and no other floor one", () => {
    expect(buildFloorMap(layouts.L1, [], []).rings).toEqual([{ x: LOBBY.hologram.x, z: LOBBY.hologram.z, r: LOBBY.laneRadius }]);
    expect(buildFloorMap(layouts.L3, [], []).rings).toEqual([]);
  });
  it("draws one fixture per obstacle, inside the view", () => {
    for (const id of ["L1", "L2", "L3", "L4", "RF"] as const) {
      const map = buildFloorMap(layouts[id], [], []);
      expect(map.fixtures).toHaveLength(layouts[id].obstacles.length);
      const { view } = map;
      for (const f of map.fixtures) {
        expect(f.w).toBeGreaterThan(0);
        expect(f.d).toBeGreaterThan(0);
        expect(f.x).toBeGreaterThanOrEqual(view.minX);
        expect(f.z).toBeGreaterThanOrEqual(view.minZ);
        expect(f.x + f.w).toBeLessThanOrEqual(view.minX + view.width);
        expect(f.z + f.d).toBeLessThanOrEqual(view.minZ + view.depth);
      }
    }
  });
  it("anchors labels inward within 8 u of a side edge", () => {
    const view = { minX: 0, minZ: 0, width: 100, depth: 50 };
    expect(labelAnchor(3, view)).toBe("start");
    expect(labelAnchor(97, view)).toBe("end");
    expect(labelAnchor(50, view)).toBe("middle");
    expect(labelAnchor(8, view)).toBe("middle");
    expect(labelAnchor(92, view)).toBe("middle");
  });
  it("labels doors and teleporters only on floors with at most 12 of them", () => {
    const rooms = (count: number) => buildFloorMap(layouts.L1, Array.from({ length: count }, (_, i) => door(`L1:door:${i}`, `r${i}`, 0, i)), []).rooms;
    expect(labelsDoors(rooms(12))).toBe(true);
    expect(labelsDoors(rooms(13))).toBe(false);
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
