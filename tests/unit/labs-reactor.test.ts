import { describe, expect, it } from "vitest";
import { buildExperienceData } from "@/content/experience";
import { ROVER, ROVER_HEIGHT } from "@/experience/config";
import { buildLabsLayout, LABS } from "@/experience/floors/labs/layout";
import { REACTOR, reactorRect, reactorSpin, ringPoints, waterfallPanels, WATERFALL } from "@/experience/floors/labs/reactor";
import { distanceToRect } from "@/experience/nav/collision";
import { buildNavGrid } from "@/experience/nav/navgrid";
import { buildRoadGraph, pathBetween } from "@/experience/nav/road";
import { roadRoute } from "@/experience/nav/roadRoute";
import type { Rect, Vec2 } from "@/experience/types";
import { buildCareerData } from "@/content/experience";
import { buildCareerRoad, careerLayoutInput } from "@/experience/floors/career/layout";

const FLOOR_NAMES = { L1: "Lobby", L2: "Career Archive", L3: "Labs", L4: "Library", RF: "Roof" };
const pods = buildExperienceData("en", FLOOR_NAMES).labs.pods;
const layout = buildLabsLayout(pods);
const { floor, network, reactor } = layout;
const center = layout.east.center;
const grid = buildNavGrid(floor, ROVER.radius);

/** Points every `step` u along a polyline that starts at `from`. */
function along(from: Vec2, path: readonly Vec2[], step = 0.25): Vec2[] {
  const out: Vec2[] = [];
  let a = from;
  for (const b of path) {
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / step));
    for (let i = 0; i <= n; i++) out.push({ x: a.x + ((b.x - a.x) * i) / n, z: a.z + ((b.z - a.z) * i) / n });
    a = b;
  }
  return out;
}

const minDistance = (points: Vec2[], r: Rect) => Math.min(...points.map((p) => distanceToRect(p, r)));

describe("L3 reactor core", () => {
  it("stands in the middle of the east plaza as an obstacle and a tall camera column", () => {
    expect(reactor.center).toEqual(center);
    expect(reactor.rect).toEqual(reactorRect(center));
    expect(floor.obstacles).toContainEqual(reactor.rect);
    expect(floor.tall).toContainEqual({ ...reactor.rect, h: REACTOR.height });
    // The directory wall panels stay in the camera's tall set too.
    expect(floor.tall?.filter((t) => t.h === LABS.board.h)).toHaveLength(Object.keys(layout.boards).length);
    // Under the L4 slab, 14 u up.
    expect(REACTOR.height).toBeLessThan(14);
    expect(layout.east.core).toBe(REACTOR.half);
  });

  it("rings the core with a closed road whose inner edge clears the core", () => {
    const ring = network.roads.find((r) => r.id === "east-ring")!;
    expect(ring.closed).toBe(true);
    expect(ring.points).toEqual(ringPoints(center));
    expect(ring.points[0]).toEqual({ x: center.x, z: center.z - REACTOR.ring });
    expect(ring.points[REACTOR.segments / 2]).toEqual({ x: center.x, z: center.z + REACTOR.ring });
    // Chord midpoints are the closest points of the centerline; the 8 u road keeps the core square clear.
    const inner = REACTOR.ring * Math.cos(Math.PI / REACTOR.segments) - ring.width / 2;
    expect(inner).toBeGreaterThan(REACTOR.half * Math.SQRT2);
    // The ring stays inside the slab.
    expect(center.x + REACTOR.ring + ring.width / 2).toBeLessThanOrEqual(floor.bounds.maxX);
  });

  it("never joins the road graph through the core", () => {
    const graph = buildRoadGraph(network);
    for (const n of graph.nodes) expect(distanceToRect(n, reactor.rect)).toBeGreaterThan(2);
  });

  it("routes along the road from one wing end to the other around the core", () => {
    const north = network.roads.find((r) => r.id === "software")!;
    const south = network.roads.find((r) => r.id === "ai")!;
    const from = north.points[3];
    const to = south.points[3];
    const path = pathBetween(network, from, to)!;
    expect(path).not.toBeNull();
    expect(minDistance(along(from, path), reactor.rect)).toBeGreaterThan(LABS.road / 2 - 0.5);
  });

  it("drives point-and-go and autopilot legs across the east plaza around the core", () => {
    const software = layout.placed.filter((p) => p.pod.wing === "software").at(-1)!;
    const ai = layout.placed.filter((p) => p.pod.wing === "ai").at(-1)!;
    const legs: [Vec2, Vec2][] = [
      [software.door, ai.door],
      [ai.door, software.door],
      // Straight through the plaza: west rim to east rim and back.
      [{ x: center.x - 9, z: center.z }, { x: center.x + 9, z: center.z }],
      [{ x: center.x + 9, z: center.z + 1 }, { x: center.x - 9, z: center.z - 1 }],
    ];
    for (const [from, to] of legs) {
      const route = roadRoute(network, grid, from, to);
      expect(route, `${from.x},${from.z} to ${to.x},${to.z}`).not.toBeNull();
      expect(minDistance(along(from, route!), reactor.rect)).toBeGreaterThanOrEqual(ROVER.radius - 1e-6);
    }
  });

  it("keeps the orbit rings above the rover wherever they reach over the ring road", () => {
    const inner = REACTOR.ring * Math.cos(Math.PI / REACTOR.segments) - LABS.road / 2;
    for (const ring of REACTOR.rings) {
      if (ring.r <= inner) continue;
      expect(ring.y - ring.r * Math.sin(Math.abs(ring.tilt))).toBeGreaterThan(ROVER_HEIGHT + 0.4);
    }
    expect(Math.max(...REACTOR.rings.map((r) => r.y + r.r))).toBeLessThan(REACTOR.height + 2);
  });

  it("stands still under reduced motion", () => {
    expect(reactorSpin(true)).toBe(0);
    expect(reactorSpin(false)).toBeGreaterThan(0);
  });
});

describe("L3 data waterfalls", () => {
  it("hangs two panels at each slab corner (one on lite), just outside the rim", () => {
    const full = waterfallPanels(floor.bounds);
    const lite = waterfallPanels(floor.bounds, true);
    expect(full).toHaveLength(8);
    expect(lite).toHaveLength(4);
    const { minX, maxX, minZ, maxZ } = floor.bounds;
    const corners = [
      { x: minX, z: minZ },
      { x: minX, z: maxZ },
      { x: maxX, z: minZ },
      { x: maxX, z: maxZ },
    ];
    for (const p of full) {
      expect(Math.hypot(p.b.x - p.a.x, p.b.z - p.a.z)).toBeCloseTo(WATERFALL.length);
      // Starts at a corner (within the gap), and sits outside the slab.
      expect(Math.min(...corners.map((c) => Math.hypot(c.x - p.a.x, c.z - p.a.z)))).toBeLessThanOrEqual(WATERFALL.gap + 1e-6);
      const mid = { x: (p.a.x + p.b.x) / 2, z: (p.a.z + p.b.z) / 2 };
      const inside = mid.x > minX && mid.x < maxX && mid.z > minZ && mid.z < maxZ;
      expect(inside).toBe(false);
    }
  });

  it("falls clear of the L2 slab below", () => {
    const career = buildCareerRoad(careerLayoutInput(buildCareerData("en")));
    for (const p of waterfallPanels(floor.bounds)) {
      for (const q of [p.a, p.b]) {
        const over = q.x >= career.bounds.minX && q.x <= career.bounds.maxX && q.z >= career.bounds.minZ && q.z <= career.bounds.maxZ;
        expect(over).toBe(false);
      }
    }
    expect(WATERFALL.drop).toBeLessThan(14);
  });
});
