import { describe, expect, it } from "vitest";
import { buildExperienceData } from "@/content/experience";
import { zoneAt } from "@/experience/camera/orbit";
import { FOLLOW_LOOK_AHEAD, followPose } from "@/experience/camera/rigs";
import { buildFloorLayouts, ROVER, SHAFT } from "@/experience/config";
import { careerLayoutInput } from "@/experience/floors/career/layout";
import { libraryLayoutInput } from "@/experience/floors/library/model";
import { chevronMarks } from "@/experience/nav/roadGeometry";
import { buildLabsLayout, directoryStop, LABS, tourOrder, WING_SIDE } from "@/experience/floors/labs/layout";
import { HINT } from "@/experience/hints/select";
import { labsWalk } from "@/experience/missions/walks";
import { distanceToRect } from "@/experience/nav/collision";
import { DOOR_WIDTH } from "@/experience/nav/doors";
import { buildNavGrid, findPath, isWalkable } from "@/experience/nav/navgrid";
import { inPlaza, onNetwork, pathBetween, roadRoute } from "@/experience/nav/road";
import { rectGap } from "@/experience/nav/space";
import type { LabPod } from "@/experience/types";
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
    expect(north.points[0]).toEqual(layout.hub.center);
    expect(south.points[0]).toEqual(layout.hub.center);
    expect(north.points.at(-1)).toEqual(layout.east.center);
    expect(south.points.at(-1)).toEqual(layout.east.center);
    expect(Math.min(layout.east.w, layout.east.d)).toBeGreaterThanOrEqual(16);
    // No dead ends: the far end of each wing is reachable along the road both ways round the loop.
    const path = pathBetween(network, { x: north.points[2].x, z: north.points[2].z }, { x: south.points[2].x, z: south.points[2].z });
    expect(path).not.toBeNull();
    for (const p of path!) expect(onNetwork(network, p)).toBe(true);
  });

  it("ends each wing road one tail past its last docked pod, so no stretch of road runs on empty (owner request 2026-10-13)", () => {
    for (const wing of ["software", "ai"] as const) {
      const road = network.roads.find((r) => r.id === wing)!;
      const docked = layout.placed.filter((p) => p.pod.wing === wing);
      const lastEdge = Math.max(...docked.map((p) => p.rect.maxX));
      expect(road.points[2].x, wing).toBe(lastEdge + LABS.tail);
      // From the last door to the turn is at most half a hero pod plus the tail.
      const lastDoor = Math.max(...docked.map((p) => p.door.x));
      expect(road.points[2].x - lastDoor, wing).toBeLessThanOrEqual(LABS.hero.w / 2 + LABS.tail);
      expect(road.points.at(-1)).toEqual(layout.east.center);
    }
    // The east plaza sits on the later of the two turns, on the axis between the wings.
    const turns = network.roads.filter((r) => r.id !== "lead").map((r) => r.points[2].x);
    expect(layout.east.center).toEqual({ x: Math.max(...turns), z: 0 });
  });

  it("ends the slab one plaza radius and a margin past the east plaza, right after the last pods", () => {
    const lastEdge = Math.max(...layout.placed.map((p) => p.rect.maxX));
    expect(floor.bounds.maxX).toBe(layout.east.center.x + LABS.east / 2 + LABS.margin);
    expect(floor.bounds.maxX - lastEdge).toBe(LABS.tail + LABS.east / 2 + LABS.margin);
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
    expect(ai.points[2].x).toBe(aiEdge + LABS.tail);
    expect(ai.points[2].x).toBeLessThan(software.points[2].x);
    expect(ai.points.at(-1)).toEqual(lopsided.east.center);
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
    for (const p of layout.placed) expect(Math.sign(p.center.z)).toBe(WING_SIDE[p.pod.wing]);
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
    expect([...layout.directory.software, ...layout.directory.ai].map((p) => p.slug).sort()).toEqual(listed.map((p) => p.slug).sort());
    const many = Array.from({ length: LABS.maxPerWing + 2 }, (_, i) => pod(`f${i}`, "ai", "featured", i));
    const crowded = buildLabsLayout(many);
    expect(crowded.placed).toHaveLength(LABS.maxPerWing);
    expect(crowded.directory.ai.map((p) => p.slug)).toEqual([`f${LABS.maxPerWing}`, `f${LABS.maxPerWing + 1}`]);
  });

  it("docks the MII Microsoft Solutions Website on the Product Engineering road, third in site order (R4-J)", () => {
    const software = layout.placed.filter((p) => p.pod.wing === "software").map((p) => p.pod.slug);
    const ai = layout.placed.filter((p) => p.pod.wing === "ai").map((p) => p.pod.slug);
    expect(software.slice(0, 3)).toEqual(["anime-figure-ecommerce", "vulnerability-scanning-automation", "solutions-marketing-site"]);
    expect(ai).toContain("ai-solutions-assistant");
    expect(software).toHaveLength(ai.length);
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
      const road = WING_SIDE[p.pod.wing] * LABS.wingZ;
      expect(Math.abs(p.forecourt.maxZ - p.forecourt.minZ)).toBeCloseTo(LABS.forecourt);
      expect(Math.min(Math.abs(p.rect.minZ - road), Math.abs(p.rect.maxZ - road))).toBeCloseTo(LABS.road / 2 + LABS.forecourt);
    }
  });

  it("puts every door on clear floor, facing its wing road, reachable along the road from the elevator", () => {
    const grid = buildNavGrid(floor, ROVER.radius);
    expect(floor.doors).toHaveLength(layout.placed.length);
    for (const p of layout.placed) {
      for (const o of floor.obstacles) expect(distanceToRect(p.door, o)).toBeGreaterThanOrEqual(ROVER.radius);
      expect(Math.sign(p.door.z - p.center.z)).toBe(p.facing);
      expect(Math.sign(WING_SIDE[p.pod.wing] * LABS.wingZ - p.center.z)).toBe(p.facing);
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

  it("starts the packet spine east of the directory wall, so no lane runs under it", () => {
    const [spine] = layout.lanes;
    expect(spine[0]).toEqual([LABS.board.x + LABS.board.w / 2 + 1, 0]);
    expect(spine[1][0]).toBe(layout.east.center.x - LABS.east / 2 - 1);
  });

  it("stands the directory wall where the wing roads fork, its panels facing west with walkable stops that turn the camera to them", () => {
    const grid = buildNavGrid(floor, ROVER.radius);
    // Two touching panels on z = 0, Product Engineering north.
    expect(layout.boards.software.maxZ).toBeCloseTo(0);
    expect(layout.boards.ai.minZ).toBeCloseTo(0);
    expect(rectGap(layout.boards.software, layout.boards.ai)).toBe(0);
    for (const wing of ["software", "ai"] as const) {
      const board = layout.boards[wing];
      const stop = directoryStop(wing);
      expect(stop).toEqual(board.stop);
      expect(Math.sign(board.center.z)).toBe(WING_SIDE[wing]);
      // East of the hub, between the wing roads, 6 u clear of every pod.
      expect(board.minX).toBeGreaterThan(layout.hub.center.x + layout.hub.w / 2);
      expect(board.maxZ).toBeLessThan(LABS.wingZ - LABS.road / 2);
      expect(board.minZ).toBeGreaterThan(-(LABS.wingZ - LABS.road / 2));
      for (const p of layout.placed) expect(rectGap(board, p.rect), p.room).toBeGreaterThanOrEqual(6);
      // The stop is 3 u in front of the west face, walkable, reached along the road, and turns the camera to the panel.
      expect(stop.x).toBeCloseTo(board.minX - LABS.boardStop);
      expect(stop.z).toBe(board.center.z);
      expect(isWalkable(grid, stop)).toBe(true);
      expect(roadRoute(network, grid, floor.approach, stop)).not.toBeNull();
      const zone = zoneAt("L3", stop, floor.viewZones);
      expect(zone?.id).toBe(`L3:directory:${wing}`);
      expect(zone?.yaw).toBeCloseTo((-3 * Math.PI) / 4);
      expect(zone?.zoom).toBe(LABS.boardZoom);
    }
    // The lead road from the elevator never turns the camera.
    expect(zoneAt("L3", layout.hub.center, floor.viewZones)).toBeNull();
  });

  it("parks deep links and elevator arrivals on the hub's east rim facing the wall, with the shaft behind the camera", () => {
    expect(floor.spawn).toEqual(LABS.overview);
    expect(floor.arrival).toEqual(LABS.overview);
    expect(inPlaza(layout.hub, LABS.overview)).toBe(true);
    expect(LABS.overview.x).toBeLessThan(layout.boards.software.minX);
    expect(isWalkable(buildNavGrid(floor, ROVER.radius), LABS.overview)).toBe(true);
    // No hint bubble pops over the wall on arrival: both board stops lie beyond the hint radius.
    for (const wing of ["software", "ai"] as const) {
      const stop = directoryStop(wing);
      expect(Math.hypot(stop.x - LABS.overview.x, stop.z - LABS.overview.z), wing).toBeGreaterThan(HINT.radius);
    }
    const zone = zoneAt("L3", LABS.overview, floor.viewZones);
    expect(zone?.id).toBe("L3:overview");
    for (const cls of ["desktop", "tablet", "mobile"] as const) {
      // The Director aims FOLLOW_LOOK_AHEAD ahead of the rover along the camera's forward (+x here).
      const [cx, , cz] = followPose(cls, [LABS.overview.x + FOLLOW_LOOK_AHEAD[cls], 0, LABS.overview.z], zone!.yaw, zone!.zoom).position;
      // The camera looks east along the floor from west of the rover, and stays clear of the shaft column.
      expect(cx).toBeLessThan(LABS.overview.x);
      expect(Math.abs(cz - LABS.overview.z)).toBeLessThan(0.01);
      expect(cx).toBeGreaterThan(SHAFT.x + SHAFT.size / 2 + 3);
    }
    // Driving the roads never swings the camera to the overview or a panel.
    for (const road of network.roads)
      for (let i = 0; i < road.points.length - 1; i++)
        for (let k = 0; k <= 40; k++) {
          const a = road.points[i];
          const b = road.points[i + 1];
          const p = { x: a.x + ((b.x - a.x) * k) / 40, z: a.z + ((b.z - a.z) * k) / 40 };
          const id = zoneAt("L3", p, floor.viewZones)?.id ?? "";
          expect(id === "L3:overview" || id.startsWith("L3:directory:"), `${road.id} at ${p.x},${p.z}`).toBe(false);
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
    for (const x of [0, 30, 60]) for (const wing of ["software", "ai"] as const) expect(zoneAt("L3", { x, z: WING_SIDE[wing] * LABS.wingZ }, floor.viewZones)).toBeNull();
  });

  it("feeds the tour in docking order, wing by wing, ending at the directory boards", () => {
    const walk = labsWalk(pods, { wings: { software: "Product Engineering", ai: "AI Engineering" }, more: "More projects here", moreSub: "" });
    const rooms = walk.stops.filter((s) => s.room).map((s) => s.room);
    expect(rooms).toEqual(layout.placed.map((p) => p.room));
    expect(walk.stops.slice(-2).map((s) => s.to)).toEqual([directoryStop("software"), directoryStop("ai")]);
  });

  it("is what buildFloorLayouts uses for L3 when pods are given", () => {
    const layouts = buildFloorLayouts(8, { labs: pods });
    expect(layouts.L3.doors).toEqual(floor.doors);
    expect(layouts.L3.road).toEqual(network);
    expect(buildFloorLayouts(8).L3.doors).toEqual([]);
  });
});
