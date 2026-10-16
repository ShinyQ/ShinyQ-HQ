import { describe, expect, it } from "vitest";
import { buildExperienceData } from "@/content/experience";
import { zoneAt, zoneView } from "@/experience/camera/orbit";
import { FOLLOW_LOOK_AHEAD, followForward, followPose } from "@/experience/camera/rigs";
import { buildFloorLayouts, ROVER, ROVER_HEIGHT, SHAFT, SHAFT_EAST_FACE } from "@/experience/config";
import { careerLayoutInput } from "@/experience/floors/career/layout";
import { libraryLayoutInput } from "@/experience/floors/library/model";
import { chevronMarks } from "@/experience/nav/roadGeometry";
import { buildLabsLayout, directoryBoard, directoryStop, LABS, LABS_WINGS, lookAlong, SIDE_WINGS, tourOrder, wallPosts, WING_SIDE } from "@/experience/floors/labs/layout";
import { REACTOR, ringEntry } from "@/experience/floors/labs/reactor";
import { HINT } from "@/experience/hints/select";
import { distanceToRect } from "@/experience/nav/collision";
import { DOOR_WIDTH } from "@/experience/nav/doors";
import { buildNavGrid, findPath, isWalkable } from "@/experience/nav/navgrid";
import { inPlaza, onNetwork, pathBetween, projectOnRoad } from "@/experience/nav/road";
import { roadRoute } from "@/experience/nav/roadRoute";
import { rectGap } from "@/experience/nav/space";
import type { LabPod, Vec2 } from "@/experience/types";
import { expectSpaceRules } from "../helpers/space";

const FLOOR_NAMES = { L1: "Lobby", L2: "Career Archive", L3: "Labs", L4: "Library", RF: "Roof" };
const pods = buildExperienceData("en", FLOOR_NAMES).labs.pods;
const layout = buildLabsLayout(pods);
const { floor, network } = layout;

const pod = (slug: string, wing: LabPod["wing"], tier: LabPod["tier"], order: number): LabPod => ({
  id: slug,
  slug,
  title: slug,
  tier,
  wing,
  accent: "cyan",
  hologram: "pipeline",
  order,
  hasHologramView: tier === "hero",
  hasGallery: false,
});

describe("L3 Project Roads layout", () => {
  it("passes the space rules with the real pods", () => {
    expectSpaceRules({ bounds: floor.bounds, obstacles: floor.obstacles, doors: floor.doors ?? [], network, start: floor.approach });
  });

  it("keeps the global shaft outside the slab and lands the rover on the lead road into the hub", () => {
    expect(SHAFT.x + SHAFT.size / 2).toBeLessThanOrEqual(floor.bounds.minX);
    expect(floor.door).toEqual({ x: -24, z: 0 });
    expect(onNetwork(network, floor.approach)).toBe(true);
    expect(floor.road).toBe(network);
    const lead = network.roads.find((r) => r.id === "lead")!;
    expect(lead.points.at(-1)).toEqual(layout.hub.center);
  });

  it("has a round hub of at least 20 u and wing roads that loop at the east plaza", () => {
    expect(layout.hub.round).toBe(true);
    expect(Math.min(layout.hub.w, layout.hub.d)).toBeGreaterThanOrEqual(20);
    const north = network.roads.find((r) => r.id === "software")!;
    const south = network.roads.find((r) => r.id === "ai")!;
    const r = LABS.hub.size / 2;
    for (const [road, side] of [[north, -1], [south, 1]] as const) {
      expect(road.points[0]).toEqual(layout.hub.center);
      expect(road.points[1].x).toBeCloseTo(layout.hub.center.x + r * Math.cos(Math.PI / 6));
      expect(road.points[1].z).toBeCloseTo(side * r * Math.sin(Math.PI / 6));
      expect(road.points[2]).toEqual({ x: LABS.wingStartX, z: side * layout.wingZ });
    }
    // They end on the ring road around the reactor core in the east plaza (spectacle round), where the line from
    // their turn meets it: due north or south for the later wing, at an angle for a shorter one.
    for (const [road, side] of [[north, -1], [south, 1]] as const) {
      const entry = road.points.at(-1)!;
      expect(entry).toEqual(ringEntry(layout.east.center, road.points.at(-2)!));
      expect(Math.hypot(entry.x - layout.east.center.x, entry.z - layout.east.center.z)).toBeCloseTo(REACTOR.ring);
      expect(Math.sign(entry.z)).toBe(side);
    }
    expect(Math.min(layout.east.w, layout.east.d)).toBeGreaterThanOrEqual(16);
    // No dead ends: the far end of each wing is reachable along the road both ways round the loop.
    const path = pathBetween(network, { x: north.points[3].x, z: north.points[3].z }, { x: south.points[3].x, z: south.points[3].z });
    expect(path).not.toBeNull();
    for (const p of path!) expect(onNetwork(network, p)).toBe(true);
  });

  it("ends each wing road one tail past its last docked pod, so no stretch of road runs on empty (owner request 2026-10-13)", () => {
    const spine = layout.placed.filter((p) => p.pod.wing === "data");
    const spineEdge = Math.max(-Infinity, ...spine.map((p) => p.rect.maxX));
    for (const wing of ["software", "ai"] as const) {
      const road = network.roads.find((r) => r.id === wing)!;
      const docked = layout.placed.filter((p) => p.pod.wing === wing);
      const lastEdge = Math.max(...docked.map((p) => p.rect.maxX));
      // The turn is a tail past the wing's own last pod, the last spine pod beside it, or (AI) the Ops Control Room.
      const opsTurn = wing === "ai" ? layout.ops.rect.maxX + LABS.road / 2 : -Infinity;
      expect(road.points[3].x, wing).toBe(Math.max(lastEdge + LABS.tail, spineEdge + LABS.tail, opsTurn, LABS.wingStartX + LABS.east + LABS.margin));
      // From the last door along it (its own pods, the spine pods beside it, the Ops room) to the turn is at most half a hero pod plus the tail.
      const doors = [...docked, ...spine].map((p) => p.door.x);
      if (wing === "ai") doors.push(layout.ops.door.x);
      expect(road.points[3].x - Math.max(...doors), wing).toBeLessThanOrEqual(LABS.hero.w / 2 + LABS.tail);
      expect(road.points.at(-1)).toEqual(ringEntry(layout.east.center, road.points[3]));
    }
    // The east plaza sits on the later of the two turns (and a tail plus its radius past the last spine pod), on the axis between the wings.
    const turns = network.roads.filter((r) => r.id === "software" || r.id === "ai").map((r) => r.points[3].x);
    const lastSpineEdge = Math.max(...layout.placed.filter((p) => p.pod.wing === "data").map((p) => p.rect.maxX));
    expect(layout.east.center).toEqual({ x: Math.max(...turns, lastSpineEdge + LABS.tail + LABS.east / 2), z: 0 });
  });

  it("ends the slab one plaza radius and a margin past the east plaza, right after the last pods or the Ops room (without spine pods)", () => {
    const hubOnly = buildLabsLayout(pods.filter((p) => p.wing !== "data"));
    const lastEdge = Math.max(...hubOnly.placed.map((p) => p.rect.maxX));
    const lastTurn = Math.max(lastEdge + LABS.tail, hubOnly.ops.rect.maxX + LABS.road / 2);
    expect(hubOnly.floor.bounds.maxX).toBe(hubOnly.east.center.x + LABS.east / 2 + LABS.margin);
    expect(hubOnly.floor.bounds.maxX - lastTurn).toBe(LABS.east / 2 + LABS.margin);
  });

  it("keeps a lopsided floor and an empty floor inside the space rules, a shorter wing cutting across to the plaza", () => {
    const lopsided = buildLabsLayout([
      ...Array.from({ length: 9 }, (_, i) => pod(`s${i}`, "software", i % 3 ? "featured" : "hero", i)),
      ...Array.from({ length: 3 }, (_, i) => pod(`a${i}`, "ai", "hero", i)),
    ]);
    expectSpaceRules({ bounds: lopsided.floor.bounds, obstacles: lopsided.floor.obstacles, doors: lopsided.floor.doors ?? [], network: lopsided.network, start: lopsided.floor.approach });
    const ai = lopsided.network.roads.find((r) => r.id === "ai")!;
    const software = lopsided.network.roads.find((r) => r.id === "software")!;
    const aiEdge = Math.max(...lopsided.placed.filter((p) => p.pod.wing === "ai").map((p) => p.rect.maxX));
    expect(ai.points[3].x).toBe(aiEdge + LABS.tail);
    expect(ai.points[3].x).toBeLessThan(software.points[3].x);
    expect(ai.points.at(-1)).toEqual(ringEntry(lopsided.east.center, ai.points[3]));
    expect(Math.hypot(ai.points.at(-1)!.x - lopsided.east.center.x, ai.points.at(-1)!.z - lopsided.east.center.z)).toBeCloseTo(REACTOR.ring);
    const empty = buildLabsLayout([]);
    expectSpaceRules({ bounds: empty.floor.bounds, obstacles: empty.floor.obstacles, doors: empty.floor.doors ?? [], network: empty.network, start: empty.floor.approach });
    expect(empty.east.center.x).toBe(LABS.wingStartX + LABS.east + LABS.margin);
  });

  it("paints no chevrons on L3 (owner request 2026-10-13) while every other walkable floor keeps them", () => {
    const experience = buildExperienceData("en", FLOOR_NAMES);
    const layouts = buildFloorLayouts(experience.years.length, {
      labs: experience.labs.pods,
      career: careerLayoutInput(experience.career),
      library: libraryLayoutInput(experience.library),
    });
    expect(network.chevrons).toBe(false);
    expect(layouts.L3.road?.chevrons).toBe(false);
    expect(chevronMarks(layouts.L3.road!, 5)).toEqual([]);
    for (const id of ["L1", "L2", "L4", "RF"] as const) {
      expect(layouts[id].road?.chevrons, id).toBeUndefined();
      expect(chevronMarks(layouts[id].road!, 5).length, id).toBeGreaterThan(0);
    }
  });

  it("puts the Product Engineering wing north (z < 0) and the AI Engineering wing south (z > 0)", () => {
    for (const p of layout.placed) if (p.pod.wing !== "data") expect(Math.sign(p.center.z)).toBe(WING_SIDE[p.pod.wing]);
  });

  it("docks pods in site order (gallery pods nearest the hub), alternating sides of the wing road", () => {
    for (const wing of ["software", "ai"] as const) {
      const docked = layout.placed.filter((p) => p.pod.wing === wing);
      expect(docked.map((p) => p.pod.slug)).toEqual(tourOrder(pods.filter((p) => p.wing === wing)).map((p) => p.slug));
      docked.forEach((p, i) => expect(p.row).toBe(i % 2 === 0 ? "outer" : "inner"));
      for (const row of ["outer", "inner"] as const) {
        const inRow = docked.filter((p) => p.row === row);
        const xs = inRow.map((p) => p.center.x);
        expect(xs).toEqual([...xs].sort((a, b) => a - b));
        const gallery = inRow.map((p) => p.pod.hasGallery);
        expect(gallery, `${wing} ${row}`).toEqual([...gallery].sort((a, b) => Number(b) - Number(a)));
      }
    }
  });

  it("docks a featured pod with a gallery ahead of a hero pod without one", () => {
    const mixed = buildLabsLayout([pod("hero-plain", "software", "hero", 0), { ...pod("featured-shots", "software", "featured", 5), hasGallery: true }]);
    expect(mixed.placed.map((p) => p.pod.slug)).toEqual(["featured-shots", "hero-plain"]);
    expect(mixed.placed[0].center.x).toBeLessThan(mixed.placed[1].center.x);
  });

  it("gives both wings mirror-image placement (equal billing), whatever the tiers in each slot", () => {
    const slots = (wing: "software" | "ai") => layout.placed.filter((p) => p.pod.wing === wing).map((p) => `${p.row}@${p.center.x},${Math.abs(p.door.z)}`);
    const sw = slots("software");
    const ai = slots("ai");
    const shared = Math.min(sw.length, ai.length);
    expect(shared).toBeGreaterThan(0);
    expect(sw.slice(0, shared)).toEqual(ai.slice(0, shared));
  });

  it("sends listed pods and overflow to the wing directory only", () => {
    const listed = pods.filter((p) => p.tier === "listed");
    expect(layout.placed.some((p) => p.pod.tier === "listed")).toBe(false);
    expect(layout.placed).toHaveLength(pods.length - listed.length);
    expect([...layout.directory.software, ...layout.directory.ai, ...layout.directory.data].map((p) => p.slug).sort()).toEqual(listed.map((p) => p.slug).sort());
    const many = Array.from({ length: LABS.maxPerWing + 2 }, (_, i) => pod(`f${i}`, "ai", "featured", i));
    const crowded = buildLabsLayout(many);
    expect(crowded.placed).toHaveLength(LABS.maxPerWing);
    expect(crowded.directory.ai.map((p) => p.slug)).toEqual([`f${LABS.maxPerWing}`, `f${LABS.maxPerWing + 1}`]);
  });

  it("docks the vendor portal first and the MII Microsoft Solutions Website fourth on the Product Engineering road (R4-J, gallery first)", () => {
    const software = layout.placed.filter((p) => p.pod.wing === "software").map((p) => p.pod.slug);
    const ai = layout.placed.filter((p) => p.pod.wing === "ai").map((p) => p.pod.slug);
    expect(software.slice(0, 4)).toEqual(["vendor-management-portal", "anime-figure-ecommerce", "vulnerability-scanning-automation", "solutions-marketing-site"]);
    expect(ai).toContain("ai-solutions-assistant");
    // Wings dock what their content gives them (the AI wing may hold more pods than Product): no equal-length assumption.
    expect(software.length).toBeGreaterThan(0);
    expect(ai.length).toBeGreaterThan(0);
    expect(layout.directory.ai.map((p) => p.slug)).not.toContain("solutions-marketing-site");
    expect(layout.directory.software.map((p) => p.slug)).toContain("event-tech-search-backend");
  });

  it("keeps pods inside the slab, on forecourts off the road, at least 6 u apart", () => {
    const rects = layout.placed.map((p) => p.rect);
    for (const r of rects) {
      expect(r.minX).toBeGreaterThanOrEqual(floor.bounds.minX);
      expect(r.maxX).toBeLessThanOrEqual(floor.bounds.maxX);
      expect(r.minZ).toBeGreaterThanOrEqual(floor.bounds.minZ);
      expect(r.maxZ).toBeLessThanOrEqual(floor.bounds.maxZ);
    }
    rects.forEach((a, i) => rects.slice(i + 1).forEach((b) => expect(rectGap(a, b)).toBeGreaterThanOrEqual(6)));
    for (const p of layout.placed) {
      const road = p.roadZ;
      expect(p.roadZ).toBe(p.pod.wing === "data" ? 0 : WING_SIDE[p.pod.wing] * layout.wingZ);
      expect(Math.abs(p.forecourt.maxZ - p.forecourt.minZ)).toBeCloseTo(LABS.forecourt);
      expect(Math.min(Math.abs(p.rect.minZ - road), Math.abs(p.rect.maxZ - road))).toBeCloseTo(LABS.road / 2 + LABS.forecourt);
    }
  });

  it("puts every door on clear floor, facing its wing road, reachable along the road from the elevator", () => {
    const grid = buildNavGrid(floor, ROVER.radius);
    // Every pod, plus the Ops Control Room (tests/unit/labs-ops.test.ts).
    expect(floor.doors).toHaveLength(layout.placed.length + 1);
    const ops = floor.doors!.find((d) => d.room === "L3:ops")!;
    expect(isWalkable(grid, ops.at)).toBe(true);
    expect(Math.hypot(roadRoute(network, grid, floor.approach, ops.at)!.at(-1)!.x - ops.at.x, roadRoute(network, grid, floor.approach, ops.at)!.at(-1)!.z - ops.at.z)).toBeLessThan(1);
    for (const p of layout.placed) {
      for (const o of floor.obstacles) expect(distanceToRect(p.door, o)).toBeGreaterThanOrEqual(ROVER.radius);
      expect(Math.sign(p.door.z - p.center.z)).toBe(p.facing);
      expect(Math.sign(p.roadZ - p.center.z)).toBe(p.facing);
      expect(isWalkable(grid, p.door)).toBe(true);
      expect(findPath(grid, floor.approach, p.door), p.room).not.toBeNull();
      const route = roadRoute(network, grid, floor.approach, p.door);
      expect(route, p.room).not.toBeNull();
      const end = route!.at(-1)!;
      expect(Math.hypot(end.x - p.door.x, end.z - p.door.z)).toBeLessThan(1);
    }
  });

  it("keeps every packet lane off every door pad", () => {
    const half = DOOR_WIDTH / 2 + 0.375 + 0.1;
    for (const lane of layout.lanes)
      for (let i = 0; i < lane.length - 1; i++)
        for (let k = 0; k <= 40; k++) {
          const x = lane[i][0] + ((lane[i + 1][0] - lane[i][0]) * k) / 40;
          const z = lane[i][1] + ((lane[i + 1][1] - lane[i][1]) * k) / 40;
          for (const d of floor.doors!) expect(Math.abs(x - d.at.x) < half && Math.abs(z - d.at.z) < half, `${d.room} at ${x},${z}`).toBe(false);
        }
  });

  it("runs the Data and ML spine straight from the hub centre to the reactor ring's west point", () => {
    const spine = network.roads.find((r) => r.id === "data")!;
    expect(spine.points).toEqual([layout.hub.center, ringEntry(layout.east.center, layout.hub.center)]);
    expect(spine.points[1]).toEqual({ x: layout.east.center.x - REACTOR.ring, z: 0 });
    expect(network.roads.some((r) => r.id === "directory")).toBe(false);
    expect(onNetwork(network, LABS.overview)).toBe(true);
    expect(onNetwork(network, directoryStop("data"))).toBe(true);
  });

  it("drives from the arrival spot to every board stop along the spine, never back toward the hub", () => {
    const grid = buildNavGrid(floor, ROVER.radius);
    const length = (route: Vec2[]) => route.reduce((sum, p, i) => sum + Math.hypot(p.x - (i ? route[i - 1] : LABS.overview).x, p.z - (i ? route[i - 1] : LABS.overview).z), 0);
    for (const wing of LABS_WINGS) {
      const stop = directoryStop(wing);
      const route = roadRoute(network, grid, LABS.overview, stop)!;
      expect(route.at(-1)!.x).toBeCloseTo(stop.x);
      expect(route.at(-1)!.z).toBeCloseTo(stop.z);
      if (wing === "data") {
        for (const p of route) expect(p.x, `${wing} ${p.x},${p.z}`).toBeGreaterThanOrEqual(LABS.overview.x - 1e-6);
        expect(length(route), wing).toBeLessThan(14);
        continue;
      }
      // The side stops hang straight off the spine (plan amendment 2026-10-16), so the drive never turns back toward the hub.
      for (const p of route) expect(p.x, `${wing} ${p.x},${p.z}`).toBeGreaterThanOrEqual(LABS.overview.x - 1e-6);
      expect(length(route), wing).toBeLessThan(16);
    }
  });

  it("frames each side board from its stop whatever the arrival heading, and the data board only eastbound", () => {
    for (const wing of SIDE_WINGS) {
      for (const heading of [Math.PI - 0.4, -(Math.PI - 0.4), 0.4, -0.4, Math.PI / 2, -Math.PI / 2]) {
        expect(zoneAt("L3", { ...directoryStop(wing), heading }, floor.viewZones)?.id, `${wing} ${heading}`).toBe(`L3:directory:${wing}`);
      }
    }
    expect(zoneAt("L3", { ...directoryStop("data"), heading: 0 }, floor.viewZones)?.id).toBe("L3:directory:data");
    expect(zoneAt("L3", { ...directoryStop("data"), heading: -Math.PI / 2 }, floor.viewZones)?.id).not.toBe("L3:directory:data");
  });

  it("runs two packet spines between the spine pods and the inner wing pods, with a branch into each back wall", () => {
    const laneZ = LABS.road / 2 + LABS.forecourt + Math.max(...layout.placed.filter((p) => p.pod.wing === "data").map((p) => p.depth)) + LABS.rowGap / 2;
    const spines = layout.lanes.filter((l) => l[0][1] === l[1][1]);
    expect(spines).toEqual([
      [[LABS.board.dataX + LABS.board.w / 2 + 1, -laneZ], [layout.east.center.x - LABS.east / 2, -laneZ]],
      [[LABS.board.dataX + LABS.board.w / 2 + 1, laneZ], [layout.east.center.x - LABS.east / 2, laneZ]],
    ]);
    const fed = layout.placed.filter((p) => p.pod.wing === "data" || p.row === "inner");
    expect(layout.lanes.length).toBe(2 + fed.length);
    for (const p of fed) {
      const back = p.facing > 0 ? p.rect.minZ : p.rect.maxZ;
      expect(layout.lanes).toContainEqual([[p.center.x, Math.sign(p.center.z) * laneZ], [p.center.x, back]]);
    }
  });

  it("pins the board decisions of the neat entrance (plan 2026-10-16)", () => {
    expect(LABS.board).toEqual({ w: 0.6, base: 3.2, h: 9.6, width: 9, post: 0.4, pylon: { across: 0.4, along: 0.8 }, dataX: 18, side: { x: 16, z: 11.2 }, turn: 0.33 });
  });

  it("stands three free-standing boards: the Data and ML gate over the spine, the side boards turned toward the axis", () => {
    const { data, software, ai } = layout.boards;
    expect(data.normal).toEqual({ x: -1, z: 0 });
    expect(data.center).toEqual({ x: LABS.board.dataX, z: 0 });
    for (const b of Object.values(layout.boards)) {
      expect(Math.hypot(b.normal.x, b.normal.z)).toBeCloseTo(1, 12);
      expect(b.along.x).toBeCloseTo(b.normal.z, 12);
      expect(b.along.z).toBeCloseTo(-b.normal.x, 12);
      expect(b.yaw).toBeCloseTo(Math.atan2(b.normal.x, b.normal.z), 12);
    }
    // Mirror images across the spine.
    expect(ai.center.x).toBeCloseTo(software.center.x, 12);
    expect(ai.center.z).toBeCloseTo(-software.center.z, 12);
    expect(ai.normal.x).toBeCloseTo(software.normal.x, 12);
    expect(ai.normal.z).toBeCloseTo(-software.normal.z, 12);
    for (const wing of SIDE_WINGS) {
      const b = layout.boards[wing];
      expect(Math.sign(b.center.z)).toBe(WING_SIDE[wing]);
      expect(Math.acos(-b.normal.x), wing).toBeLessThanOrEqual(0.35);
      // Toward the axis: the normal points back across z = 0.
      expect(Math.sign(b.normal.z), wing).toBe(-WING_SIDE[wing]);
    }
    for (const wing of LABS_WINGS) {
      const b = layout.boards[wing];
      expect(b).toEqual(directoryBoard(wing));
      const corners = [-1, 1].flatMap((s) => [-1, 1].map((t) => ({ x: b.center.x + (s * b.along.x * LABS.board.width) / 2 + (t * b.normal.x * LABS.board.w) / 2, z: b.center.z + (s * b.along.z * LABS.board.width) / 2 + (t * b.normal.z * LABS.board.w) / 2 })));
      expect(b.minX).toBeCloseTo(Math.min(...corners.map((c) => c.x)), 12);
      expect(b.maxX).toBeCloseTo(Math.max(...corners.map((c) => c.x)), 12);
      expect(b.minZ).toBeCloseTo(Math.min(...corners.map((c) => c.z)), 12);
      expect(b.maxZ).toBeCloseTo(Math.max(...corners.map((c) => c.z)), 12);
    }
    // Neighbouring boards stand apart: their front faces' end points are at least 2 u from each other.
    const ends = (wing: (typeof LABS_WINGS)[number]) => {
      const b = layout.boards[wing];
      const face = { x: b.center.x + (b.normal.x * LABS.board.w) / 2, z: b.center.z + (b.normal.z * LABS.board.w) / 2 };
      return [-1, 1].map((s) => ({ x: face.x + (s * b.along.x * LABS.board.width) / 2, z: face.z + (s * b.along.z * LABS.board.width) / 2 }));
    };
    for (const wing of SIDE_WINGS)
      for (const a of ends(wing)) for (const b of ends("data")) expect(Math.hypot(a.x - b.x, a.z - b.z), wing).toBeGreaterThanOrEqual(2);
  });

  it("carries the gate on two posts outside the spine road and each side board on one pylon, every post a floor obstacle", () => {
    const posts = wallPosts();
    expect(posts.map((p) => p.wing)).toEqual(["data", "data", "software", "ai"]);
    for (const p of posts) {
      expect(floor.obstacles).toContainEqual(p.rect);
      const b = directoryBoard(p.wing);
      expect(p.yaw).toBeCloseTo(b.yaw, 12);
    }
    for (const p of posts.filter((p) => p.wing === "data")) {
      expect(p.across).toBe(LABS.board.w);
      expect(p.along).toBe(LABS.board.post);
      expect(Math.min(Math.abs(p.rect.minZ), Math.abs(p.rect.maxZ))).toBeGreaterThan(LABS.road / 2);
      expect(Math.max(Math.abs(p.rect.minZ), Math.abs(p.rect.maxZ))).toBeCloseTo(LABS.board.width / 2, 12);
    }
    for (const wing of SIDE_WINGS) {
      const p = posts.find((q) => q.wing === wing)!;
      expect(p.center).toEqual(directoryBoard(wing).center);
      expect({ across: p.across, along: p.along }).toEqual(LABS.board.pylon);
    }
    // The rover (2.8 u) drives under every board.
    expect(LABS.board.base).toBeGreaterThan(ROVER_HEIGHT);
  });

  it("puts each board stop in front of its board, the side stops on spurs straight off the spine", () => {
    const grid = buildNavGrid(floor, ROVER.radius);
    for (const wing of LABS_WINGS) {
      const b = layout.boards[wing];
      // No board blocks the floor; each is a tall camera column up to its top.
      expect(floor.obstacles).not.toContainEqual({ minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ });
      expect(floor.tall).toContainEqual({ minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ, h: 9.6 });
      const stop = directoryStop(wing);
      expect(stop).toEqual(b.stop);
      expect(stop.x).toBeCloseTo(b.center.x + b.normal.x * (LABS.board.w / 2 + LABS.boardStop), 12);
      expect(stop.z).toBeCloseTo(b.center.z + b.normal.z * (LABS.board.w / 2 + LABS.boardStop), 12);
      expect(isWalkable(grid, stop), wing).toBe(true);
      expect(onNetwork(network, stop), wing).toBe(true);
      expect(Math.hypot(stop.x - LABS.overview.x, stop.z - LABS.overview.z), wing).toBeGreaterThan(HINT.radius);
      for (const p of layout.placed) expect(rectGap(b, p.rect), p.room).toBeGreaterThanOrEqual(6);
    }
    expect(directoryStop("data")).toEqual({ x: LABS.board.dataX - LABS.board.w / 2 - LABS.boardStop, z: 0 });
    const spine = network.roads.find((r) => r.id === "data")!;
    for (const wing of SIDE_WINGS) {
      const spur = network.spurs.find((s) => s.room === `L3:directory:${wing}`)!;
      expect(spur.from, wing).toEqual({ x: directoryStop(wing).x, z: 0 });
      expect(projectOnRoad(spine, spur.from).distance, wing).toBeLessThan(1e-6);
      expect(spur.to).toEqual(directoryStop(wing));
    }
    expect(floor.directoryStops).toEqual({ software: directoryStop("software"), ai: directoryStop("ai"), data: directoryStop("data") });
  });

  it("frames each board from its stop: the side boards head on, the data board looking east", () => {
    for (const wing of LABS_WINGS) {
      const b = layout.boards[wing];
      const zone = zoneAt("L3", b.stop, floor.viewZones);
      expect(zone?.id).toBe(`L3:directory:${wing}`);
      expect(zone?.zoom).toBe(LABS.boardZoom);
      expect(zone?.classView?.mobile?.zoom).toBe(LABS.boardZoomPhone);
      for (const cls of ["desktop", "tablet", "mobile"] as const) {
        const forward = followForward(cls, zone!.yaw);
        expect(forward.x, `${wing} ${cls}`).toBeCloseTo(-b.normal.x, 9);
        expect(forward.z, `${wing} ${cls}`).toBeCloseTo(-b.normal.z, 9);
      }
      if (wing === "data") {
        expect(zone?.yaw).toBeCloseTo((-3 * Math.PI) / 4);
        expect(zone?.area).toEqual({ minX: b.stop.x - 1, maxX: b.minX, minZ: -LABS.board.width / 2, maxZ: LABS.board.width / 2 });
      } else expect(zone?.area).toEqual({ minX: b.stop.x - 1.5, maxX: b.stop.x + 1.5, minZ: b.stop.z - 1.5, maxZ: b.stop.z + 1.5 });
    }
    expect(zoneAt("L3", LABS.overview, floor.viewZones)?.area.maxX).toBeCloseTo(directoryStop("data").x - 1);
  });

  it("lookAlong inverts followForward for every camera class", () => {
    for (const cls of ["desktop", "tablet", "mobile"] as const)
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + 0.1;
        const d = { x: Math.cos(a), z: Math.sin(a) };
        const f = followForward(cls, lookAlong(d));
        expect(f.x, `${cls} ${i}`).toBeCloseTo(d.x, 9);
        expect(f.z, `${cls} ${i}`).toBeCloseTo(d.z, 9);
      }
    expect(lookAlong({ x: 1, z: 0 })).toBeCloseTo((-3 * Math.PI) / 4, 12);
  });

  it("keeps the boards, pylons and gate posts inside the space rules on a lopsided and an empty floor", () => {
    for (const l of [buildLabsLayout([]), buildLabsLayout([...Array.from({ length: 9 }, (_, i) => pod(`s${i}`, "software", "hero", i)), pod("d0", "data", "hero", 0)])]) {
      expectSpaceRules({ bounds: l.floor.bounds, obstacles: l.floor.obstacles, doors: l.floor.doors ?? [], network: l.network, start: l.floor.approach });
      for (const wing of LABS_WINGS) for (const p of l.placed) expect(rectGap(l.boards[wing], p.rect), `${wing} ${p.room}`).toBeGreaterThanOrEqual(6);
    }
  });

  it("parks deep links and elevator arrivals on the hub's east rim facing the wall, with the shaft behind the camera", () => {
    expect(floor.spawn).toEqual(LABS.overview);
    expect(floor.arrival).toEqual(LABS.overview);
    expect(inPlaza(layout.hub, LABS.overview)).toBe(true);
    expect(LABS.overview.x).toBeLessThan(layout.boards.software.minX);
    expect(isWalkable(buildNavGrid(floor, ROVER.radius), LABS.overview)).toBe(true);
    // No hint bubble pops over the wall on arrival: every board stop lies beyond the hint radius.
    for (const wing of LABS_WINGS) {
      const stop = directoryStop(wing);
      expect(Math.hypot(stop.x - LABS.overview.x, stop.z - LABS.overview.z), wing).toBeGreaterThan(HINT.radius);
    }
    const zone = zoneAt("L3", LABS.overview, floor.viewZones);
    expect(zone?.id).toBe("L3:overview");
    expect(zone?.classView?.mobile?.zoom).toBe(LABS.overviewZoomPhone);
    for (const cls of ["desktop", "tablet", "mobile"] as const) {
      // The Director aims FOLLOW_LOOK_AHEAD ahead of the rover along the camera's forward (+x here).
      const [cx, , cz] = followPose(cls, [LABS.overview.x + FOLLOW_LOOK_AHEAD[cls], 0, LABS.overview.z], zone!.yaw, zoneView(zone!, cls).zoom ?? 1).position;
      // The camera looks east along the floor from west of the rover, and stays clear of the shaft column.
      expect(cx).toBeLessThan(LABS.overview.x);
      expect(Math.abs(cz - LABS.overview.z)).toBeLessThan(0.01);
      expect(cx, cls).toBeGreaterThan(SHAFT_EAST_FACE + (cls === "mobile" ? 1.5 : 3));
    }
    // Driving the roads never swings the camera to the overview or a board: the wing roads, the lead road
    // and the ring either way, and the spine back toward the hub (those zones only apply heading east).
    const watched = (id: string) => id === "L3:overview" || id.startsWith("L3:directory:");
    for (const road of network.roads)
      for (const reverse of [false, true]) {
        if (road.id === "data" && !reverse) continue;
        const points = reverse ? [...road.points].reverse() : road.points;
        for (let i = 0; i < points.length - 1; i++) {
          const a = points[i];
          const b = points[i + 1];
          const heading = Math.atan2(b.x - a.x, b.z - a.z);
          for (let k = 0; k <= 40; k++) {
            const p = { x: a.x + ((b.x - a.x) * k) / 40, z: a.z + ((b.z - a.z) * k) / 40, heading };
            expect(watched(zoneAt("L3", p, floor.viewZones)?.id ?? ""), `${road.id}${reverse ? " back" : ""} at ${p.x},${p.z}`).toBe(false);
          }
        }
      }
  });

  it("turns the camera at each door so the pod is in front of the rover, never between it and the camera", () => {
    for (const p of layout.placed) {
      const zone = zoneAt("L3", p.door, floor.viewZones);
      expect(zone?.id).toBe(p.room);
      const camera = followPose("desktop", [p.door.x, 0, p.door.z], zone!.yaw).position;
      // The camera sits on the opposite side of the door from the pod.
      expect(Math.sign(camera[2] - p.door.z)).toBe(p.facing);
    }
    // Driving along a wing road does not turn the camera.
    for (const x of [0, 30, 60]) for (const wing of SIDE_WINGS) expect(zoneAt("L3", { x, z: WING_SIDE[wing] * layout.wingZ }, floor.viewZones)).toBeNull();
  });

  it("is what buildFloorLayouts uses for L3 when pods are given", () => {
    const layouts = buildFloorLayouts(8, { labs: pods });
    expect(layouts.L3.doors).toEqual(floor.doors);
    expect(layouts.L3.road).toEqual(network);
    // Without pods only the Ops Control Room stays (its content is not a pod).
    expect(buildFloorLayouts(8).L3.doors?.map((d) => d.room)).toEqual(["L3:ops"]);
  });
});
