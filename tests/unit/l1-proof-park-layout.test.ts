import { describe, expect, it } from "vitest";
import { buildFloorLayouts, LOBBY, ROVER } from "@/experience/config";
import { HALL } from "@/experience/floors/lobby/hallLayout";
import { PARK, parkArchPosts, parkPlaza, parkRoads, parkRoadsDrawn, parkTall } from "@/experience/floors/lobby/parkLayout";
import { buildNavGrid, isWalkable } from "@/experience/nav/navgrid";
import { buildRoadGraph, routeUsesRoad } from "@/experience/nav/road";
import { roadRoute } from "@/experience/nav/roadRoute";
import { inSlab, slabBox, slabCorners, slabEdges, slabRects } from "@/experience/nav/slab";
import { rectGap, SPACE_RULES, spaceViolations, wideGrid } from "@/experience/nav/space";
import type { Rect, Vec2 } from "@/experience/types";

/**
 * L1 Proof Park, PR 2 (owner decision 2026-11-02): the L1 slab is one 93 x 86 u rectangle, the arch from the hall plaza
 * and the road from the office plaza join the park, and every space rule holds.
 */
const l1 = buildFloorLayouts(8).L1;
const W = LOBBY.officeWing;
const S = LOBBY.bounds.maxZ;
const graph = buildRoadGraph(l1.road!);
const grid = buildNavGrid(l1, ROVER.radius);
const hallDoors = l1.doors!.filter((d) => d.room !== "L1:visits");
const center = (r: Rect): Vec2 => ({ x: (r.minX + r.maxX) / 2, z: (r.minZ + r.maxZ) / 2 });
const P = parkPlaza();

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

/** Whether the polyline `route` (from `from`) crosses the line z = `z` between `minX` and `maxX`. */
function crosses(from: Vec2, route: Vec2[], z: number, minX: number, maxX: number): boolean {
  const pts = [from, ...route];
  for (let i = 1; i < pts.length; i++) {
    const [a, b] = [pts[i - 1], pts[i]];
    if ((a.z - z) * (b.z - z) > 0 || a.z === b.z) continue;
    const x = a.x + ((b.x - a.x) * (z - a.z)) / (b.z - a.z);
    if (x > minX && x < maxX) return true;
  }
  return false;
}

describe("L1 Proof Park outline (owner decision 2026-11-02)", () => {
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
    // The Lobby part (S, the line the office wing, the hall and the observatory derive from) stays.
    expect(LOBBY.bounds).toEqual({ minX: -24, maxX: 69, minZ: -27, maxZ: 27 });
    expect(l1.spawn).toEqual(LOBBY.spawn);
  });

  it("fills both notches: their floor is slab, walkable and on the 6 u wide floor reached from the elevator", () => {
    const west = { minX: LOBBY.slab.minX, maxX: W.rect.minX, minZ: S, maxZ: LOBBY.slab.maxZ };
    expect(PARK.zone).toEqual({ minX: W.rect.maxX, maxX: LOBBY.slab.maxX, minZ: S, maxZ: LOBBY.slab.maxZ });
    const wide = wideGrid(l1);
    const reach = buildNavGrid(l1, SPACE_RULES.clear / 2, 0.5);
    for (const p of [center(west), center(PARK.zone), { x: west.minX + 4, z: west.maxZ - 4 }, { x: PARK.zone.maxX - 4, z: PARK.zone.maxZ - 4 }, { x: PARK.zone.minX + 4, z: S + 4 }]) {
      expect(inSlab(p, l1, 3), JSON.stringify(p)).toBe(true);
      expect(isWalkable(grid, p), JSON.stringify(p)).toBe(true);
      expect(isWalkable(wide, p), JSON.stringify(p)).toBe(true);
      expect(isWalkable(reach, p), JSON.stringify(p)).toBe(true);
    }
    // Off the rectangle is off the slab.
    expect(inSlab({ x: PARK.zone.maxX + 0.5, z: S + 10 }, l1)).toBe(false);
    expect(inSlab({ x: 0, z: LOBBY.slab.maxZ + 0.5 }, l1)).toBe(false);
  });

  it("keeps every space rule on the real floor: obstacle and edge gaps, roads, plazas, doors and pads", () => {
    const violations = spaceViolations({ bounds: l1.bounds, wings: l1.wings, obstacles: l1.obstacles, doors: hallDoors, network: l1.road!, start: l1.approach, pads: l1.pads });
    expect(violations.map((v) => `${v.rule}: ${v.detail}`)).toEqual([]);
  });

  it("stands the arch's posts against the gateway's south pillar and the contact station, an 8.4 u opening between them", () => {
    const [west, east] = parkArchPosts();
    const gateSouth = l1.obstacles.find((o) => o.minX === HALL.gate.x - HALL.gate.depth / 2 && o.maxZ === S)!;
    const contact = HALL.stations.contact;
    expect(rectGap(west, gateSouth)).toBe(0);
    expect(rectGap(east, contact)).toBe(0);
    expect(east.minX - west.maxX).toBeCloseTo(8.4, 9);
    expect(PARK.arch.opening).toEqual({ minX: west.maxX, maxX: east.minX });
    // Every arch post touches or keeps 6 u from every other obstacle and from the slab's edges.
    for (const post of [west, east]) {
      expect(l1.obstacles).toContainEqual(post);
      for (const o of l1.obstacles) {
        if (o === post || (o.minX === post.minX && o.maxX === post.maxX && o.minZ === post.minZ)) continue;
        const gap = rectGap(post, o);
        expect(gap === 0 || gap >= SPACE_RULES.clear - 1e-9, JSON.stringify([post, o, gap])).toBe(true);
      }
      expect(post.minZ - LOBBY.slab.minZ).toBeGreaterThanOrEqual(SPACE_RULES.clear);
      expect(LOBBY.slab.maxZ - post.maxZ).toBeGreaterThanOrEqual(SPACE_RULES.clear);
    }
    // The opening is walkable floor under the lintel (rover radius plus a cell from each post), and a camera column each.
    for (let x = PARK.arch.opening.minX + ROVER.radius + 1; x <= PARK.arch.opening.maxX - ROVER.radius - 1; x += 0.5) expect(isWalkable(grid, { x, z: S + 0.6 }), `x ${x}`).toBe(true);
    expect(l1.tall).toEqual(expect.arrayContaining(parkTall()));
    for (const t of parkTall()) expect(t.h).toBe(HALL.gate.h);
  });

  it("joins the park on 8 u roads: the arch road on the arch's axis, the park road from the office plaza's centre, a plaza where they meet", () => {
    const [lead, arch] = parkRoads();
    for (const r of [lead, arch]) {
      expect(l1.road!.roads).toContainEqual(r);
      expect(r.width).toBeGreaterThanOrEqual(SPACE_RULES.roadWidth);
    }
    expect(l1.road!.plazas).toContainEqual(P);
    expect(Math.min(P.w, P.d)).toBeGreaterThanOrEqual(SPACE_RULES.plaza);
    expect(P.center.x).toBeCloseTo((PARK.arch.opening.minX + PARK.arch.opening.maxX) / 2, 9);
    expect(lead.points[0]).toEqual(W.plaza.center);
    expect(lead.points.at(-1)).toEqual(P.center);
    expect(arch.points.at(-1)).toEqual(P.center);
    expect(arch.points[0].x).toBe(P.center.x);
    // The arch road stops 5 u short of the hall lead road's line, so it never joins the hall's network part.
    expect(arch.points[0].z - HALL.lead[0].z).toBe(5);
    // Two parts: the hall's, and the office's with the park.
    const all = parts();
    expect(all).toHaveLength(2);
    const has = (part: Vec2[], p: Vec2) => part.some((n) => Math.hypot(n.x - p.x, n.z - p.z) < 0.05);
    const office = all.find((part) => has(part, { x: W.lead.x, z: W.lead.from }))!;
    expect(has(office, P.center)).toBe(true);
    expect(has(office, arch.points[0])).toBe(true);
    expect(has(office, HALL.lead[0])).toBe(false);
    // Drives into or out of the park follow the road.
    expect(l1.roadZone).toEqual(expect.arrayContaining([PARK.zone]));
    expect(routeUsesRoad(l1, l1.spawn, P.center)).toBe(true);
  });

  it("draws the park roads only between the plazas they join", () => {
    const drawn = parkRoadsDrawn();
    const [lead, arch] = drawn.roads;
    expect(lead.points[0]).toEqual({ x: W.plaza.center.x + W.plaza.w / 2, z: P.center.z });
    expect(lead.points[1]).toEqual({ x: P.center.x - P.w / 2, z: P.center.z });
    expect(arch.points[0]).toEqual({ x: P.center.x, z: HALL.plaza.z + HALL.plaza.d / 2 });
    expect(arch.points[1]).toEqual({ x: P.center.x, z: P.center.z - P.d / 2 });
    expect(drawn.plazas).toEqual([P]);
  });

  it("drives the loop: into the park by the office roads, from the hall under the arch, and the Lobby's hall and office drives as before", () => {
    const opening = PARK.arch.opening;
    // From the spawn into the park: the office lead road, then the park road.
    const intoPark = roadRoute(l1.road!, grid, l1.spawn, P.center, graph)!;
    expect(intoPark.at(-1)).toEqual(P.center);
    expect(intoPark.some((p) => p.x === W.lead.x && p.z === W.lead.from)).toBe(true);
    expect(intoPark.some((p) => p.x === W.plaza.center.x && p.z === W.plaza.center.z)).toBe(true);
    // From every hall station into the park and back: under the arch.
    for (const door of hallDoors) {
      const there = roadRoute(l1.road!, grid, door.at, P.center, graph)!;
      expect(there.at(-1), door.room).toEqual(P.center);
      expect(crosses(door.at, there, S + 0.6, opening.minX, opening.maxX), door.room).toBe(true);
      const back = roadRoute(l1.road!, grid, P.center, door.at, graph)!;
      expect(back.at(-1), door.room).toEqual(door.at);
      expect(crosses(P.center, back, S + 0.6, opening.minX, opening.maxX), door.room).toBe(true);
    }
    // The Lobby's drives keep their roads: into the hall at the hall lead road's west end, to the office stop down its lead.
    const contact = hallDoors.find((d) => d.room === "L1:highlights-contact")!.at;
    expect(roadRoute(l1.road!, grid, l1.spawn, contact, graph)![0]).toEqual(HALL.lead[0]);
    const office = roadRoute(l1.road!, grid, l1.spawn, W.stop, graph)!;
    expect(office.slice(0, 3)).toEqual([{ x: W.lead.x, z: W.lead.from }, { x: W.lead.x, z: W.lead.to }, W.plaza.center]);
    expect(office.at(-1)).toEqual(W.stop);
  });
});
