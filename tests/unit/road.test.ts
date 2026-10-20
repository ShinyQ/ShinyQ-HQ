import { describe, expect, it } from "vitest";
import { buildNavGrid } from "@/experience/nav/navgrid";
import {
  buildRoadGraph,
  inPlaza,
  networkBounds,
  onNetwork,
  pathBetween,
  projectOnRoad,
  roadLength,
  routeUsesRoad,
  sampleRoad,
  type RoadNetwork,
} from "@/experience/nav/road";
import { roadRoute } from "@/experience/nav/roadRoute";
import { chevronMarks, dashes, miterNormals, networkFill, offsetLine, roadEdges, spurStub } from "@/experience/nav/roadGeometry";
import { gapFilled, padViolations, rectGap, spaceViolations } from "@/experience/nav/space";
import type { DoorTrigger, PadTrigger, Rect, Vec2 } from "@/experience/types";
import { expectSpaceRules } from "../helpers/space";

const v = (x: number, z: number): Vec2 => ({ x, z });

/** A straight main road with a plaza and two docked rooms (one per side). */
const STRAIGHT: RoadNetwork = {
  roads: [{ id: "main", points: [v(0, 0), v(60, 0)], width: 8 }],
  plazas: [{ id: "p", center: v(30, 0), w: 18, d: 18, round: true }],
  spurs: [
    { room: "L2:a", from: v(10, -4), to: v(10, -9.2) },
    { room: "L2:b", from: v(50, 4), to: v(50, 9.2) },
  ],
};

/** A hub road splitting into two wing roads that meet again at the far end (a loop). */
const LOOP: RoadNetwork = {
  roads: [
    { id: "hub", points: [v(0, 0), v(10, 0)], width: 8 },
    { id: "north", points: [v(10, 0), v(10, -20), v(60, -20), v(60, 0)], width: 8 },
    { id: "south", points: [v(10, 0), v(10, 20), v(60, 20), v(60, 0)], width: 8 },
  ],
  plazas: [],
  spurs: [{ room: "L3:x", from: v(40, -16), to: v(40, -10) }],
};

const length = (pts: Vec2[], from: Vec2) => pts.reduce((sum, p, i) => sum + Math.hypot(p.x - (i ? pts[i - 1] : from).x, p.z - (i ? pts[i - 1] : from).z), 0);

describe("road geometry helpers", () => {
  it("projects onto the centerline and samples by arc length", () => {
    const road = LOOP.roads[1];
    expect(roadLength(road)).toBe(90);
    const pr = projectOnRoad(road, v(30, -25));
    expect(pr.point).toEqual(v(30, -20));
    expect(pr.distance).toBe(5);
    expect(pr.s).toBe(40);
    const at = sampleRoad(road, 40);
    expect(at.point).toEqual(v(30, -20));
    expect(at.dir).toEqual(v(1, 0));
    expect(sampleRoad(road, 999).point).toEqual(v(60, 0));
  });

  it("knows what is on the network: road strips, plazas and spurs", () => {
    expect(onNetwork(STRAIGHT, v(5, 3.9))).toBe(true);
    expect(onNetwork(STRAIGHT, v(5, 4.5))).toBe(false);
    expect(onNetwork(STRAIGHT, v(30, 8.5))).toBe(true);
    expect(onNetwork(STRAIGHT, v(10, -8))).toBe(true);
    expect(inPlaza(STRAIGHT.plazas[0], v(30 + 9, 0))).toBe(true);
    expect(inPlaza(STRAIGHT.plazas[0], v(30 + 7, 7))).toBe(false);
    expect(networkBounds(STRAIGHT)).toEqual({ minX: -4, maxX: 64, minZ: -10.7, maxZ: 10.7 });
  });
});

describe("pathBetween", () => {
  it("follows the road from a spur to another spur", () => {
    const path = pathBetween(STRAIGHT, v(10, -9.2), v(50, 9.2))!;
    expect(path[path.length - 1]).toEqual(v(50, 9.2));
    expect(path).toContainEqual(v(10, 0));
    expect(path).toContainEqual(v(50, 0));
    // Every waypoint is on the network.
    for (const p of path) expect(onNetwork(STRAIGHT, p)).toBe(true);
  });

  it("enters the network at the nearest point when starting off the road", () => {
    const path = pathBetween(STRAIGHT, v(20, 6), v(50, 9.2))!;
    expect(path[0]).toEqual(v(20, 0));
  });

  it("takes the shorter way round a loop", () => {
    const path = pathBetween(LOOP, v(0, 0), v(40, -10))!;
    expect(path.every((p) => p.z <= 0)).toBe(true);
    expect(path[path.length - 1]).toEqual(v(40, -10));
    const back = pathBetween(LOOP, v(60, 10), v(0, 0))!;
    expect(back.some((p) => p.z > 0)).toBe(true);
    expect(back.some((p) => p.z < 0)).toBe(false);
  });

  it("joins road ends that lie on another road (junctions)", () => {
    const g = buildRoadGraph(LOOP);
    const at = (p: Vec2) => g.nodes.findIndex((n) => Math.hypot(n.x - p.x, n.z - p.z) < 0.05);
    expect(g.adj[at(v(10, 0))].length).toBeGreaterThanOrEqual(3);
    expect(g.adj[at(v(60, 0))].length).toBe(2);
  });

  it("returns null for an empty network", () => {
    expect(pathBetween({ roads: [], plazas: [], spurs: [] }, v(0, 0), v(1, 1))).toBeNull();
  });
});

describe("roadRoute", () => {
  it("limits a road to its zone when the floor sets one", () => {
    const road = { roads: [], plazas: [], spurs: [] };
    const zone = { minX: 0, maxX: 10, minZ: 0, maxZ: 10 };
    expect(routeUsesRoad({}, { x: 1, z: 1 }, { x: 2, z: 2 })).toBe(false);
    expect(routeUsesRoad({ road }, { x: -5, z: -5 }, { x: -6, z: -6 })).toBe(true);
    expect(routeUsesRoad({ road, roadZone: zone }, { x: -5, z: -5 }, { x: -6, z: -6 })).toBe(false);
    expect(routeUsesRoad({ road, roadZone: zone }, { x: -5, z: -5 }, { x: 5, z: 5 })).toBe(true);
    expect(routeUsesRoad({ road, roadZone: zone }, { x: 5, z: 5 }, { x: -6, z: -6 })).toBe(true);
  });

  it("takes a list of zones: a drive into or out of any of them follows the road", () => {
    const road = { roads: [], plazas: [], spurs: [] };
    const zones = [
      { minX: 0, maxX: 10, minZ: 0, maxZ: 10 },
      { minX: 20, maxX: 30, minZ: 0, maxZ: 10 },
    ];
    expect(routeUsesRoad({ road, roadZone: zones }, { x: -5, z: -5 }, { x: 15, z: 5 })).toBe(false);
    expect(routeUsesRoad({ road, roadZone: zones }, { x: -5, z: -5 }, { x: 25, z: 5 })).toBe(true);
    expect(routeUsesRoad({ road, roadZone: zones }, { x: 5, z: 5 }, { x: 15, z: 5 })).toBe(true);
    expect(routeUsesRoad({ road, roadZone: [] }, { x: 5, z: 5 }, { x: 15, z: 5 })).toBe(false);
  });

  const bounds: Rect = { minX: -6, maxX: 66, minZ: -14, maxZ: 14 };
  const pedestals: Rect[] = [
    { minX: 9, maxX: 11, minZ: -13, maxZ: -11 },
    { minX: 49, maxX: 51, minZ: 11, maxZ: 13 },
  ];
  const grid = buildNavGrid({ bounds, obstacles: pedestals }, 1);

  it("routes along the road, not diagonally across the floor", () => {
    const route = roadRoute(STRAIGHT, grid, v(10, -9.2), v(50, 9.2))!;
    expect(route.length).toBeGreaterThan(2);
    expect(Math.max(...route.slice(1, -1).map((p) => Math.abs(p.z)))).toBeLessThanOrEqual(4);
    expect(route[route.length - 1]).toEqual(v(50, 9.2));
  });

  it("goes straight for short hops", () => {
    expect(roadRoute(STRAIGHT, grid, v(10, -1), v(11, 0))).toEqual([v(11, 0)]);
  });

  it("reaches the road around an obstacle with the navgrid first", () => {
    const route = roadRoute(STRAIGHT, grid, v(10, -13.5), v(50, 9.2))!;
    expect(route[0].z).toBeLessThan(-12);
    expect(length(route, v(10, -13.5))).toBeLessThan(70);
  });

  describe("on a network in two parts that do not touch (the L1 hall road and the office wing road)", () => {
    const TWO: RoadNetwork = {
      roads: [
        { id: "east", points: [v(20, 0), v(60, 0)], width: 8 },
        { id: "south", points: [v(0, 6), v(0, 30)], width: 8 },
      ],
      plazas: [{ id: "s", center: v(0, 36), w: 16, d: 16 }],
      spurs: [{ room: "L1:a", from: v(55, -4), to: v(55, -8) }],
    };
    const open = buildNavGrid({ bounds: { minX: -20, maxX: 70, minZ: -20, maxZ: 50 }, obstacles: [] }, 1);
    const onPart = (p: Vec2, part: "east" | "south") => onNetwork({ ...TWO, roads: TWO.roads.filter((r) => r.id === part), plazas: part === "south" ? TWO.plazas : [], spurs: [] }, p);

    it("drives from off the road onto the target's part, even when the other part is nearer to the start", () => {
      const route = roadRoute(TWO, open, v(-6, 0), v(55, -8))!;
      expect(route).toContainEqual(v(20, 0));
      expect(route.some((p) => onPart(p, "south"))).toBe(false);
      expect(route.at(-1)).toEqual(v(55, -8));
    });

    it("drives out along its own part when the target is off the road", () => {
      const route = roadRoute(TWO, open, v(55, -8), v(-6, -10))!;
      expect(route).toContainEqual(v(20, 0));
      expect(route.some((p) => onPart(p, "south"))).toBe(false);
      expect(route.at(-1)).toEqual(v(-6, -10));
    });

    it("chains both parts from one to the other: out along the first, across the floor, in along the second", () => {
      const route = roadRoute(TWO, open, v(55, -8), v(0, 38))!;
      const first = route.findIndex((p) => p.x === 20 && p.z === 0);
      const second = route.findIndex((p) => onPart(p, "south"));
      expect(first).toBeGreaterThanOrEqual(0);
      expect(second).toBeGreaterThan(first);
      expect(route.at(-1)).toEqual(v(0, 38));
      const back = roadRoute(TWO, open, v(0, 38), v(55, -8))!;
      expect(back.findIndex((p) => p.x === 0 && p.z === 6)).toBeLessThan(back.findIndex((p) => p.x === 20 && p.z === 0));
    });
  });
});

describe("road mesh data", () => {
  it("miters joins and offsets edges at half the width", () => {
    const n = miterNormals([v(0, 0), v(10, 0), v(10, 10)]);
    expect(n[0].x).toBeCloseTo(0);
    expect(n[0].z).toBeCloseTo(1);
    expect(Math.hypot(n[1].x, n[1].z)).toBeCloseTo(Math.SQRT2);
    const edge = offsetLine([v(0, 0), v(10, 0)], 4);
    expect(edge[0]).toEqual(v(0, 4));
  });

  it("builds one fill for roads, plazas and spurs", () => {
    const fill = networkFill(STRAIGHT);
    expect(fill.positions.length % 2).toBe(0);
    expect(fill.indices.length % 3).toBe(0);
    expect(Math.max(...fill.indices)).toBe(fill.positions.length / 2 - 1);
  });

  it("points chevrons forward and skips plazas", () => {
    const marks = chevronMarks(STRAIGHT, 4);
    expect(marks.length).toBeGreaterThan(8);
    expect(marks.every((m) => Math.abs(m.angle - Math.PI / 2) < 1e-9)).toBe(true);
    expect(marks.some((m) => Math.abs(m.x - 30) < 8)).toBe(false);
  });

  it("draws no chevrons on a network that turns them off, and the same ones when it says so explicitly", () => {
    expect(chevronMarks({ ...STRAIGHT, chevrons: false }, 4)).toEqual([]);
    expect(chevronMarks({ ...STRAIGHT, chevrons: true }, 4)).toEqual(chevronMarks(STRAIGHT, 4));
  });

  it("dashes polylines and keeps edges out of plazas", () => {
    const d = dashes([v(0, 0), v(10, 0)], 1, 1);
    expect(d).toHaveLength(5);
    expect(d[0]).toEqual([0, 0, 1, 0]);
    const edges = roadEdges(STRAIGHT);
    expect(edges.some(([x1, z1]) => Math.abs(x1 - 30) < 6 && Math.abs(Math.abs(z1) - 4) < 0.01)).toBe(false);
  });

  it("puts the spur stub at the door end", () => {
    const stub = spurStub(STRAIGHT.spurs[0]);
    expect(stub.to).toEqual(v(10, -9.2));
    expect(stub.from.z).toBeCloseTo(-7.2);
  });
});

describe("space rules", () => {
  const base = {
    bounds: { minX: -6, maxX: 66, minZ: -20, maxZ: 20 } as Rect,
    obstacles: [
      { minX: 9, maxX: 11, minZ: -14, maxZ: -12 },
      { minX: 49, maxX: 51, minZ: 12, maxZ: 14 },
    ] as Rect[],
    doors: [
      { room: "L2:a", at: v(10, -9.2), facing: v(0, -1) },
      { room: "L2:b", at: v(50, 9.2), facing: v(0, 1) },
    ] as DoorTrigger[],
    network: STRAIGHT,
    start: v(2, 0),
  };

  it("passes a roomy layout", () => {
    expectSpaceRules(base);
  });

  it("measures gaps between rectangles", () => {
    expect(rectGap({ minX: 0, maxX: 1, minZ: 0, maxZ: 1 }, { minX: 4, maxX: 5, minZ: 0, maxZ: 1 })).toBe(3);
    expect(rectGap({ minX: 0, maxX: 1, minZ: 0, maxZ: 1 }, { minX: 1, maxX: 2, minZ: 0, maxZ: 1 })).toBe(0);
  });

  const rules = (input: Partial<typeof base>) => spaceViolations({ ...base, ...input }).map((x) => x.rule);

  it("passes a narrow gap only when a third obstacle fills the whole strip between the two (no floor there)", () => {
    const a = { minX: 0, maxX: 2, minZ: 0, maxZ: 4 };
    const b = { minX: 5, maxX: 7, minZ: 0, maxZ: 4 };
    expect(gapFilled(a, b, [a, b, { minX: 2, maxX: 5, minZ: -1, maxZ: 4 }])).toBe(true);
    // Covering only part of the strip leaves floor between them.
    expect(gapFilled(a, b, [a, b, { minX: 2, maxX: 5, minZ: 1, maxZ: 4 }])).toBe(false);
    expect(gapFilled(a, b, [a, b, { minX: 2, maxX: 4.5, minZ: 0, maxZ: 4 }])).toBe(false);
    // Diagonal neighbours: the corner rect between them.
    expect(gapFilled(a, { minX: 4, maxX: 6, minZ: 6, maxZ: 8 }, [{ minX: 1, maxX: 4.5, minZ: 3, maxZ: 6.5 }])).toBe(true);
    expect(gapFilled(a, b, [a, b])).toBe(false);
  });

  it("flags narrow roads and small plazas", () => {
    const network = { ...STRAIGHT, roads: [{ ...STRAIGHT.roads[0], width: 6 }], plazas: [{ ...STRAIGHT.plazas[0], w: 12 }] };
    expect(rules({ network })).toEqual(expect.arrayContaining(["road-width", "plaza-size"]));
  });

  it("flags obstacles on the road and tight gaps", () => {
    expect(rules({ obstacles: [...base.obstacles, { minX: 20, maxX: 21, minZ: 2, maxZ: 3 }] })).toContain("road-blocked");
    expect(rules({ obstacles: [...base.obstacles, { minX: 13, maxX: 14, minZ: -14, maxZ: -12 }] })).toContain("obstacle-gap");
    expect(rules({ obstacles: [...base.obstacles, { minX: 30, maxX: 31, minZ: 15, maxZ: 17 }] })).toContain("bounds-gap");
  });

  it("flags doors without a spur and spurs off the road", () => {
    expect(rules({ doors: [...base.doors, { room: "L2:c", at: v(30, -12), facing: v(0, -1) }] })).toContain("door-spur");
    const network = { ...STRAIGHT, spurs: [...STRAIGHT.spurs, { room: "L2:c" as const, from: v(20, -7), to: v(20, -10) }] };
    expect(rules({ network })).toContain("spur-detached");
  });

  it("flags doors behind a gap narrower than 6 u", () => {
    // A wall across the north side with a 4 u opening: the door behind it is cut off.
    const wall: Rect[] = [
      { minX: -6, maxX: 8, minZ: -6.5, maxZ: -6 },
      { minX: 12, maxX: 66, minZ: -6.5, maxZ: -6 },
    ];
    expect(rules({ obstacles: [...base.obstacles, ...wall] })).toContain("door-gap");
  });
});

describe("space rules on a slab with a wing", () => {
  // Main slab plus a south wing touching it at x -10 to 10 (concave corners at (-10, 20) and (10, 20)).
  const input = {
    bounds: { minX: -30, maxX: 30, minZ: -20, maxZ: 20 } as Rect,
    wings: [{ minX: -10, maxX: 10, minZ: 20, maxZ: 50 }] as Rect[],
    obstacles: [] as Rect[],
    doors: [] as DoorTrigger[],
    network: { roads: [], plazas: [], spurs: [] } as RoadNetwork,
    start: v(0, 0),
  };
  const rules = (obstacles: Rect[]) => spaceViolations({ ...input, obstacles }).map((x) => x.rule);

  it("measures obstacles against the union's outer edges, 6 u from the joint corner passing and 3 u failing", () => {
    expectSpaceRules(input);
    expect(rules([{ minX: 8, maxX: 12, minZ: 12, maxZ: 14 }])).toEqual([]);
    expect(rules([{ minX: 8, maxX: 12, minZ: 15, maxZ: 17 }])).toContain("bounds-gap");
    // Diagonal to the concave corner (10, 20): 4.5 u off in x and z is about 6.4 u, 3 u off is about 4.2 u.
    expect(rules([{ minX: 2, maxX: 5.5, minZ: 12, maxZ: 15.5 }])).toEqual([]);
    expect(rules([{ minX: 4, maxX: 7, minZ: 14, maxZ: 17 }])).toContain("bounds-gap");
    expect(rules([{ minX: 11, maxX: 13, minZ: 14, maxZ: 17 }])).toContain("bounds-gap");
  });

  it("does not treat the joint as an edge", () => {
    expect(rules([{ minX: -2, maxX: 2, minZ: 21, maxZ: 23 }])).toEqual([]);
    expect(rules([{ minX: -2, maxX: 2, minZ: 16, maxZ: 19 }])).toEqual([]);
  });

  it("reaches pads in the wing across the joint and keeps them on the union", () => {
    const pad = (id: string, x: number, z: number): PadTrigger => ({ id, kind: "teleport", at: v(x, z), face: 0 });
    const pads = (p: PadTrigger[]) => padViolations({ ...input, pads: p }).map((x) => x.rule);
    expect(pads([pad("t:wing", 0, 40), pad("t:joint", 0, 20)])).toEqual([]);
    expect(pads([pad("t:corner", 20, 30)])).toContain("pad-bounds");
  });
});
