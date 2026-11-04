import { describe, expect, it } from "vitest";
import { buildFloorLayouts, LOBBY, ROVER } from "@/experience/config";
import { HALL, HALL_LAYOUT, hallPartitions } from "@/experience/floors/lobby/hallLayout";
import { WEST_STRIP } from "@/experience/floors/lobby/westStripLayout";
import { buildNavGrid, isWalkable } from "@/experience/nav/navgrid";
import { buildRoadGraph, routeUsesRoad } from "@/experience/nav/road";
import { roadRoute } from "@/experience/nav/roadRoute";
import { inSlab, slabBox, slabCorners, slabEdges, slabRects } from "@/experience/nav/slab";
import { SPACE_RULES, spaceViolations, wideGrid } from "@/experience/nav/space";
import type { Rect, Vec2 } from "@/experience/types";

/**
 * The L1 outline (owner decisions 2026-11-02): the L1 slab is one 93 x 86 u rectangle, the Highlights Hall runs its full
 * depth, the hall has one way in (the Lobby lead road under the gateway arch, owner decision 2026-11-04), the strip west of
 * the office wing is lit floor, and every space rule holds.
 */
const l1 = buildFloorLayouts(8).L1;
const W = LOBBY.officeWing;
const S = LOBBY.bounds.maxZ;
const graph = buildRoadGraph(l1.road!);
const grid = buildNavGrid(l1, ROVER.radius);
const hallDoors = l1.doors!.filter((d) => d.room !== "L1:visits");
const center = (r: Rect): Vec2 => ({ x: (r.minX + r.maxX) / 2, z: (r.minZ + r.maxZ) / 2 });
const P = HALL_LAYOUT.network.plazas[0];
/** The open floor between the Agent Office wing and the hall's west partition. */
const LINK: Rect = { minX: W.rect.maxX, maxX: HALL.zone.minX, minZ: S, maxZ: LOBBY.slab.maxZ };

/** True when a drive never touches a west-side partition and crosses the gateway line inside its opening. */
function entersOnlyAtGate(path: Vec2[]): boolean {
  const g = HALL.gate;
  const walls = hallPartitions();
  let crossed = false;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.1));
    for (let k = 0; k <= steps; k++) {
      const p = { x: a.x + ((b.x - a.x) * k) / steps, z: a.z + ((b.z - a.z) * k) / steps };
      if (walls.some((w) => p.x > w.minX && p.x < w.maxX && p.z > w.minZ && p.z < w.maxZ)) return false;
    }
    if ((a.x - g.x) * (b.x - g.x) <= 0 && a.x !== b.x) {
      const z = a.z + ((g.x - a.x) / (b.x - a.x)) * (b.z - a.z);
      if (z > g.north.maxZ && z < g.south.minZ) crossed = true;
    }
  }
  return crossed;
}

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
    expect(WEST_STRIP.rect).toEqual({ minX: LOBBY.slab.minX, maxX: W.rect.minX, minZ: S, maxZ: LOBBY.slab.maxZ });
    const wide = wideGrid(l1);
    const reach = buildNavGrid(l1, SPACE_RULES.clear / 2, 0.5);
    for (const p of [center(WEST_STRIP.rect), center(LINK), { x: P.center.x, z: S + 10 }, { x: south.maxX - 10, z: S + 8 }, { x: WEST_STRIP.rect.minX + 4, z: WEST_STRIP.rect.maxZ - 4 }]) {
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

  it("has one way into the hall: no road from the office plaza, the office keeps its own lead road", () => {
    expect(l1.road!.roads.some((r) => r.id === "hall-office")).toBe(false);
    // Two parts: the hall's (its lead road, plaza and spurs) and the office's (its lead road and plaza), never joined.
    const all = parts();
    expect(all).toHaveLength(2);
    const has = (part: Vec2[], p: Vec2) => part.some((n) => Math.hypot(n.x - p.x, n.z - p.z) < 0.05);
    const office = all.find((part) => has(part, { x: W.lead.x, z: W.lead.from }))!;
    expect(has(office, HALL.lead[0])).toBe(false);
    expect(office.every((n) => n.x < HALL.gate.x)).toBe(true);
    // The floor between the office wing and the hall is plain Lobby floor (no road zone).
    expect(routeUsesRoad(l1, l1.spawn, center(LINK))).toBe(false);
  });

  it("reaches every hall station only through the gate, from the office stop and from the spawn", () => {
    for (const door of hallDoors) {
      for (const from of [W.stop, l1.spawn, center(LINK)]) {
        const path = roadRoute(l1.road!, grid, from, door.at, graph);
        expect(path, `${door.room} from ${JSON.stringify(from)}`).not.toBeNull();
        expect(path!.at(-1), door.room).toEqual(door.at);
        expect(entersOnlyAtGate([from, ...path!]), `${door.room} from ${JSON.stringify(from)}`).toBe(true);
      }
    }
    // The Lobby's drives keep their roads: into the hall at the hall lead road's west end, to the office stop down its lead.
    for (const door of hallDoors) expect(roadRoute(l1.road!, grid, l1.spawn, door.at, graph)![0], door.room).toEqual(HALL.lead[0]);
    const office = roadRoute(l1.road!, grid, l1.spawn, W.stop, graph)!;
    expect(office.slice(0, 3)).toEqual([{ x: W.lead.x, z: W.lead.from }, { x: W.lead.x, z: W.lead.to }, W.plaza.center]);
    expect(office.at(-1)).toEqual(W.stop);
  });

  it("blocks the hall's west edge on the navgrid outside the gateway opening", () => {
    for (const z of [-20, 0, 10]) expect(isWalkable(grid, { x: HALL.partition.north + HALL.partition.thickness / 2, z }), String(z)).toBe(false);
    for (const z of [30, 45, 55]) expect(isWalkable(grid, { x: HALL.partition.south - HALL.partition.thickness / 2, z }), String(z)).toBe(false);
    expect(isWalkable(grid, { x: HALL.gate.x, z: HALL.lead[0].z })).toBe(true);
  });
});
