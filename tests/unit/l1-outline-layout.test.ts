import { describe, expect, it } from "vitest";
import { buildFloorLayouts, LOBBY, ROVER } from "@/experience/config";
import { HALL, HALL_LAYOUT, hallOfficeRoad, hallOfficeRoadDrawn } from "@/experience/floors/lobby/hallLayout";
import { WEST_STRIP } from "@/experience/floors/lobby/westStripLayout";
import { buildNavGrid, isWalkable } from "@/experience/nav/navgrid";
import { buildRoadGraph, routeUsesRoad } from "@/experience/nav/road";
import { roadRoute } from "@/experience/nav/roadRoute";
import { inSlab, slabBox, slabCorners, slabEdges, slabRects } from "@/experience/nav/slab";
import { SPACE_RULES, spaceViolations, wideGrid } from "@/experience/nav/space";
import type { Rect, Vec2 } from "@/experience/types";

/**
 * The L1 outline (owner decisions 2026-11-02): the L1 slab is one 93 x 86 u rectangle, the Highlights Hall runs its full
 * depth, a road from the office plaza enters the hall, the strip west of the office wing is lit floor, and every space rule
 * holds.
 */
const l1 = buildFloorLayouts(8).L1;
const W = LOBBY.officeWing;
const S = LOBBY.bounds.maxZ;
const graph = buildRoadGraph(l1.road!);
const grid = buildNavGrid(l1, ROVER.radius);
const hallDoors = l1.doors!.filter((d) => d.room !== "L1:visits");
const center = (r: Rect): Vec2 => ({ x: (r.minX + r.maxX) / 2, z: (r.minZ + r.maxZ) / 2 });
const P = HALL_LAYOUT.network.plazas[0];

/** Connected parts of the road graph, as lists of node keys. */
function parts(): Vec2[][] {
  const label = new Array<number>(graph.nodes.length).fill(-1);
  for (let s = 0; s < label.length; s++) {
    if (label[s] >= 0) continue;
    label[s] = s;
    const stack = [s];
    while (stack.length)
      for (const { to } of graph.adj[stack.pop()!])
        if (label[to] < 0) {
          label[to] = s;
          stack.push(to);
        }
  }
  const out = new Map<number, Vec2[]>();
  graph.nodes.forEach((n, i) => out.set(label[i], [...(out.get(label[i]) ?? []), n]));
  return [...out.values()];
}

describe("L1 outline (owner decisions 2026-11-02)", () => {
  it("is one 93 x 86 u rectangle: no wings, four edges and four corners, the same box as the old Lobby and office wing", () => {
    expect(l1.bounds).toEqual({ minX: -24, maxX: 69, minZ: -27, maxZ: 59 });
    expect(l1.bounds).toEqual(LOBBY.slab);
    expect([l1.bounds.maxX - l1.bounds.minX, l1.bounds.maxZ - l1.bounds.minZ]).toEqual([93, 86]);
    expect(l1.wings ?? []).toEqual([]);
    expect(slabRects(l1)).toEqual([LOBBY.slab]);
    expect(slabEdges(l1)).toHaveLength(4);
    expect(slabCorners(l1)).toHaveLength(4);
    // The tower frame, grid fade and minimap view read the slab's box: unchanged.
    expect(slabBox(l1)).toEqual(slabBox({ bounds: LOBBY.bounds, wings: [W.rect] }));
    // The Lobby part (S, the line the office wing and the observatory derive from) stays.
    expect(LOBBY.bounds).toEqual({ minX: -24, maxX: 69, minZ: -27, maxZ: 27 });
    expect(l1.spawn).toEqual(LOBBY.spawn);
  });

  it("fills both notches: the hall's south half and the lit strip west of the office are slab, walkable and on the 6 u wide floor", () => {
    const south = { minX: HALL.zone.minX, maxX: HALL.zone.maxX, minZ: S, maxZ: LOBBY.slab.maxZ };
    expect(HALL.zone.maxZ).toBe(LOBBY.slab.maxZ);
    expect(HALL.link).toEqual({ minX: W.rect.maxX, maxX: HALL.zone.minX, minZ: S, maxZ: LOBBY.slab.maxZ });
    expect(WEST_STRIP.rect).toEqual({ minX: LOBBY.slab.minX, maxX: W.rect.minX, minZ: S, maxZ: LOBBY.slab.maxZ });
    const wide = wideGrid(l1);
    const reach = buildNavGrid(l1, SPACE_RULES.clear / 2, 0.5);
    for (const p of [center(WEST_STRIP.rect), center(HALL.link), { x: P.center.x, z: S + 10 }, { x: south.maxX - 10, z: S + 8 }, { x: WEST_STRIP.rect.minX + 4, z: WEST_STRIP.rect.maxZ - 4 }]) {
      expect(inSlab(p, l1, 3), JSON.stringify(p)).toBe(true);
      expect(isWalkable(grid, p), JSON.stringify(p)).toBe(true);
      expect(isWalkable(wide, p), JSON.stringify(p)).toBe(true);
      expect(isWalkable(reach, p), JSON.stringify(p)).toBe(true);
    }
    // Off the rectangle is off the slab.
    expect(inSlab({ x: LOBBY.slab.maxX + 0.5, z: S + 10 }, l1)).toBe(false);
    expect(inSlab({ x: 0, z: LOBBY.slab.maxZ + 0.5 }, l1)).toBe(false);
  });

  it("keeps every space rule on the real floor: obstacle and edge gaps, roads, plazas, doors and pads", () => {
    const violations = spaceViolations({ bounds: l1.bounds, wings: l1.wings, obstacles: l1.obstacles, doors: hallDoors, network: l1.road!, start: l1.approach, pads: l1.pads });
    expect(violations.map((v) => `${v.rule}: ${v.detail}`)).toEqual([]);
  });

  it("enters the hall from the office plaza on an 8 u road that ends inside the hall plaza, in the office's network part", () => {
    const road = hallOfficeRoad();
    expect(l1.road!.roads).toContainEqual(road);
    expect(road.width).toBeGreaterThanOrEqual(SPACE_RULES.roadWidth);
    expect(road.points[0]).toEqual(W.plaza.center);
    const end = road.points.at(-1)!;
    expect(end.x).toBeGreaterThan(P.center.x - P.w / 2);
    expect(end.z).toBe(W.plaza.center.z);
    // Two parts: the hall's (its lead road, plaza and spurs), and the office's with the hall road.
    const all = parts();
    expect(all).toHaveLength(2);
    const has = (part: Vec2[], p: Vec2) => part.some((n) => Math.hypot(n.x - p.x, n.z - p.z) < 0.05);
    const office = all.find((part) => has(part, { x: W.lead.x, z: W.lead.from }))!;
    expect(has(office, end)).toBe(true);
    expect(has(office, HALL.lead[0])).toBe(false);
    // Drives into or out of the floor between the office and the hall follow the road.
    expect(l1.roadZone).toEqual(expect.arrayContaining([HALL.link]));
    expect(routeUsesRoad(l1, l1.spawn, center(HALL.link))).toBe(true);
  });

  it("draws the hall road only between the plazas it joins", () => {
    const drawn = hallOfficeRoadDrawn();
    expect(drawn.points[0]).toEqual({ x: W.plaza.center.x + W.plaza.w / 2, z: W.plaza.center.z });
    expect(drawn.points[1]).toEqual({ x: P.center.x - P.w / 2, z: W.plaza.center.z });
  });

  it("drives the loop: from the office into the hall's south half on the hall road, and the Lobby's hall and office drives as before", () => {
    for (const door of hallDoors) {
      const there = roadRoute(l1.road!, grid, W.stop, door.at, graph)!;
      expect(there.at(-1), door.room).toEqual(door.at);
      // Out of the office plaza east along the hall road to every station south of the hall lead road's line (the north
      // stations are as close by the office lead road and the hall lead road).
      if (door.at.z > HALL.lead[0].z) expect(there.some((p) => p.z === W.plaza.center.z && p.x > W.plaza.center.x + W.plaza.w / 2), door.room).toBe(true);
    }
    // The Lobby's drives keep their roads: into the hall at the hall lead road's west end, to the office stop down its lead.
    for (const door of hallDoors) expect(roadRoute(l1.road!, grid, l1.spawn, door.at, graph)![0], door.room).toEqual(HALL.lead[0]);
    const office = roadRoute(l1.road!, grid, l1.spawn, W.stop, graph)!;
    expect(office.slice(0, 3)).toEqual([{ x: W.lead.x, z: W.lead.from }, { x: W.lead.x, z: W.lead.to }, W.plaza.center]);
    expect(office.at(-1)).toEqual(W.stop);
  });
});
