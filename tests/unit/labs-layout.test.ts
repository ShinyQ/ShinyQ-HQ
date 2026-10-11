import { describe, expect, it } from "vitest";
import { buildExperienceData } from "@/content/experience";
import { zoneAt } from "@/experience/camera/orbit";
import { followPose } from "@/experience/camera/rigs";
import { buildFloorLayouts, ROVER, SHAFT } from "@/experience/config";
import { buildLabsLayout, directoryStop, LABS, tourOrder, WING_SIDE } from "@/experience/floors/labs/layout";
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

  it("puts the Software Wing north (z < 0) and the AI Wing south (z > 0)", () => {
    for (const p of layout.placed) expect(Math.sign(p.center.z)).toBe(WING_SIDE[p.pod.wing]);
  });

  it("docks hero pods nearest the hub, then featured pods, alternating sides of the wing road", () => {
    for (const wing of ["software", "ai"] as const) {
      const docked = layout.placed.filter((p) => p.pod.wing === wing);
      expect(docked.map((p) => p.pod.slug)).toEqual(tourOrder(pods.filter((p) => p.wing === wing)).map((p) => p.slug));
      docked.forEach((p, i) => expect(p.row).toBe(i % 2 === 0 ? "outer" : "inner"));
      for (const row of ["outer", "inner"] as const) {
        const xs = docked.filter((p) => p.row === row).map((p) => p.center.x);
        expect(xs).toEqual([...xs].sort((a, b) => a - b));
      }
      const lastHero = Math.max(...docked.filter((p) => p.pod.tier === "hero").map((p) => p.rect.minX));
      const firstFeatured = Math.min(...docked.filter((p) => p.pod.tier === "featured").map((p) => p.rect.minX));
      expect(lastHero).toBeLessThan(firstFeatured);
    }
  });

  it("gives both wings mirror-image placement (equal billing)", () => {
    const slots = (wing: "software" | "ai") => layout.placed.filter((p) => p.pod.wing === wing).map((p) => `${p.pod.tier}@${p.center.x},${Math.abs(p.center.z)}`);
    const sw = slots("software");
    const ai = slots("ai");
    const shared = Math.min(sw.length, ai.length);
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

  it("stands the directory boards on the hub, with walkable stops in front that turn the camera to them", () => {
    const grid = buildNavGrid(floor, ROVER.radius);
    for (const wing of ["software", "ai"] as const) {
      const board = layout.boards[wing];
      const stop = directoryStop(wing);
      expect(stop).toEqual(board.stop);
      expect(isWalkable(grid, stop)).toBe(true);
      expect(Math.sign(stop.z)).toBe(WING_SIDE[wing]);
      expect(stop.x).toBeGreaterThan(board.maxX);
      expect(inPlaza(layout.hub, stop)).toBe(true);
      expect(inPlaza(layout.hub, board.center, 1)).toBe(true);
      expect(zoneAt("L3", stop, floor.viewZones)?.id).toBe(`L3:directory:${wing}`);
    }
    // The lead road from the elevator never turns the camera.
    expect(zoneAt("L3", layout.hub.center, floor.viewZones)).toBeNull();
  });

  it("parks deep links and elevator arrivals at the hub overview, with the shaft behind the camera", () => {
    expect(floor.spawn).toEqual(LABS.overview);
    expect(floor.arrival).toEqual(LABS.overview);
    expect(inPlaza(layout.hub, LABS.overview)).toBe(true);
    expect(isWalkable(buildNavGrid(floor, ROVER.radius), LABS.overview)).toBe(true);
    const zone = zoneAt("L3", LABS.overview, floor.viewZones);
    expect(zone?.id).toBe("L3:overview");
    for (const cls of ["desktop", "tablet", "mobile"] as const) {
      const [cx, , cz] = followPose(cls, [LABS.overview.x, 0, LABS.overview.z], zone!.yaw).position;
      // The camera looks east along the floor from west of the rover, and stays clear of the shaft column.
      expect(cx).toBeLessThan(LABS.overview.x);
      expect(Math.abs(cz - LABS.overview.z)).toBeLessThan(0.01);
      expect(cx).toBeGreaterThan(SHAFT.x + SHAFT.size / 2 + 3);
    }
    // Driving the roads never swings the camera to the overview.
    for (const road of network.roads)
      for (let i = 0; i < road.points.length - 1; i++)
        for (let k = 0; k <= 40; k++) {
          const a = road.points[i];
          const b = road.points[i + 1];
          const p = { x: a.x + ((b.x - a.x) * k) / 40, z: a.z + ((b.z - a.z) * k) / 40 };
          expect(zoneAt("L3", p, floor.viewZones)?.id, `${road.id} at ${p.x},${p.z}`).not.toBe("L3:overview");
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
    const walk = labsWalk(pods, { wings: { software: "Software Wing", ai: "AI Wing" }, more: "More projects here", moreSub: "" });
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
