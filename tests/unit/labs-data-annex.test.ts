import { describe, expect, it } from "vitest";
import { buildExperienceData } from "@/content/experience";
import { zoneAt } from "@/experience/camera/orbit";
import { buildFloorLayouts, ROVER } from "@/experience/config";
import { buildLabsLayout, directoryStop, HUB_WINGS, LABS, tourOrder, WING_TINT } from "@/experience/floors/labs/layout";
import { REACTOR } from "@/experience/floors/labs/reactor";
import { roadGlow } from "@/experience/floors/labs/techReactor";
import { labsWalk } from "@/experience/missions/walks";
import { distanceToRect } from "@/experience/nav/collision";
import { buildNavGrid, isWalkable } from "@/experience/nav/navgrid";
import { inPlaza, onNetwork } from "@/experience/nav/road";
import { roadRoute } from "@/experience/nav/roadRoute";
import { padViolations, rectGap } from "@/experience/nav/space";
import type { LabPod, Rect } from "@/experience/types";
import { expectSpaceRules } from "../helpers/space";

/**
 * The Data and ML annex (owner request 2026-10-14): a third wing east of the Tech Reactor. The hub
 * wings, the reactor, the Express Return pad and the inner pocket (x 91 to 103, |z| 9 to 20, a parallel
 * session's Ops Control Room) keep their geometry.
 */
const FLOOR_NAMES = { L1: "Lobby", L2: "Career Archive", L3: "Labs", L4: "Library", RF: "Roof" };
const real = buildExperienceData("en", FLOOR_NAMES).labs.pods;
const hubPods = real.filter((p) => p.wing !== "data");

const pod = (slug: string, wing: LabPod["wing"], tier: LabPod["tier"], order: number, hasGallery = false): LabPod => ({
  id: slug,
  slug,
  title: slug,
  tier,
  wing,
  accent: "amber",
  hologram: "chart",
  order,
  hasHologramView: tier === "hero",
  hasGallery,
});
const dataPods = Array.from({ length: 6 }, (_, i) => pod(`d${i}`, "data", "featured", i));
const base = buildLabsLayout(hubPods);
const layout = buildLabsLayout([...hubPods, ...dataPods]);
const { floor, network } = layout;
const POCKET: Rect = { minX: 91, maxX: 103, minZ: 9, maxZ: 20 };
const mirror = (r: Rect): Rect => ({ minX: r.minX, maxX: r.maxX, minZ: -r.maxZ, maxZ: -r.minZ });
const overlaps = (a: Rect, b: Rect) => a.minX < b.maxX && b.minX < a.maxX && a.minZ < b.maxZ && b.minZ < a.maxZ;

describe("L3 Data and ML annex", () => {
  it("keeps the hub wings, the reactor and the Express Return pad exactly where they were", () => {
    const hub = (l: typeof layout) => l.placed.filter((p) => p.pod.wing !== "data");
    expect(hub(layout)).toEqual(hub(base));
    for (const id of ["lead", "directory", "software", "ai", "east-ring"]) {
      expect(network.roads.find((r) => r.id === id), id).toEqual(base.network.roads.find((r) => r.id === id));
    }
    expect(layout.east).toEqual(base.east);
    expect(layout.reactor).toEqual(base.reactor);
    for (const wing of HUB_WINGS) {
      expect(layout.boards[wing]).toEqual(base.boards[wing]);
      expect(layout.signs[wing]).toEqual(base.signs[wing]);
    }
    expect(floor.returnPad).toEqual(base.floor.returnPad);
    expect(layout.lanes).toEqual(base.lanes);
    expect(floor.bounds.minX).toBe(base.floor.bounds.minX);
    expect(floor.bounds.minZ).toBe(base.floor.bounds.minZ);
    expect(floor.bounds.maxZ).toBe(base.floor.bounds.maxZ);
    // Every view zone of the hub floor is still there, unchanged and in the same order.
    expect(floor.viewZones!.filter((z) => base.floor.viewZones!.some((b) => b.id === z.id))).toEqual(base.floor.viewZones);
    // No annex without data pods.
    expect(base.boards.data).toBeUndefined();
    expect(base.network.roads.some((r) => r.id === "data")).toBe(false);
  });

  it("passes the space rules and the pad rules with the annex", () => {
    expectSpaceRules({ bounds: floor.bounds, obstacles: floor.obstacles, doors: floor.doors ?? [], network, start: floor.approach });
    const layouts = buildFloorLayouts(8, { labs: [...hubPods, ...dataPods] });
    expect(layouts.L3.road).toEqual(network);
    expect(padViolations({ bounds: floor.bounds, obstacles: floor.obstacles, doors: floor.doors ?? [], network, start: floor.approach, pads: layouts.L3.pads ?? [] })).toEqual([]);
  });

  it("runs the data road east from the reactor ring's east point into a round data plaza", () => {
    const road = network.roads.find((r) => r.id === "data")!;
    expect(road.points[0]).toEqual({ x: layout.east.center.x + REACTOR.ring, z: 0 });
    const plaza = layout.dataPlaza!;
    expect(plaza.round).toBe(true);
    expect(Math.min(plaza.w, plaza.d)).toBeGreaterThanOrEqual(16);
    expect(road.points.at(-1)).toEqual(plaza.center);
    expect(network.plazas).toContainEqual(plaza);
    expect(floor.bounds.maxX).toBe(layout.boards.data!.maxX + LABS.margin);
  });

  it("docks the data pods east of the old slab end, alternating north and south, doors facing the data road", () => {
    const docked = layout.placed.filter((p) => p.pod.wing === "data");
    expect(docked.map((p) => p.pod.slug)).toEqual(tourOrder(dataPods).map((p) => p.slug));
    docked.forEach((p, i) => {
      expect(Math.sign(p.center.z), p.room).toBe(i % 2 === 0 ? -1 : 1);
      expect(p.rect.minX, p.room).toBeGreaterThanOrEqual(base.floor.bounds.maxX);
      expect(Math.sign(p.door.z - p.center.z)).toBe(p.facing);
      expect(Math.sign(0 - p.center.z)).toBe(p.facing);
      expect(Math.min(Math.abs(p.rect.minZ), Math.abs(p.rect.maxZ))).toBeCloseTo(LABS.road / 2 + LABS.forecourt);
    });
    const rects = layout.placed.map((p) => p.rect);
    rects.forEach((a, i) => rects.slice(i + 1).forEach((b) => expect(rectGap(a, b)).toBeGreaterThanOrEqual(6)));
    // Mirror-image slots: the north row starts at the annex start, the south row half a pitch later.
    const north = docked.filter((p) => p.center.z < 0).map((p) => p.center.x);
    const south = docked.filter((p) => p.center.z > 0).map((p) => p.center.x);
    expect(south[0] - north[0]).toBe(LABS.innerStart - LABS.outerStart);
  });

  it("keeps clear of the inner pocket, the reactor stop and the Express Return pad", () => {
    const annex = [...layout.placed.filter((p) => p.pod.wing === "data").map((p) => p.rect), layout.boards.data!];
    for (const r of annex) {
      expect(overlaps(r, POCKET)).toBe(false);
      expect(overlaps(r, mirror(POCKET))).toBe(false);
      expect(distanceToRect(floor.returnPad!, r)).toBeGreaterThanOrEqual(6);
    }
    const road = network.roads.find((r) => r.id === "data")!;
    for (const p of road.points) expect(p.x).toBeGreaterThan(POCKET.maxX);
    expect(floor.stops!["L3:reactor"]).toEqual(road.points[0]);
  });

  it("reaches every data door along the road from the elevator", () => {
    const grid = buildNavGrid(floor, ROVER.radius);
    for (const p of layout.placed.filter((x) => x.pod.wing === "data")) {
      expect(isWalkable(grid, p.door), p.room).toBe(true);
      const route = roadRoute(network, grid, floor.approach, p.door);
      expect(route, p.room).not.toBeNull();
      const end = route!.at(-1)!;
      expect(Math.hypot(end.x - p.door.x, end.z - p.door.z)).toBeLessThan(1);
      expect(zoneAt("L3", p.door, floor.viewZones)?.id).toBe(p.room);
    }
  });

  it("stands the data directory panel past the plaza, facing west, its stop on the plaza turning the camera to it", () => {
    const board = layout.boards.data!;
    const plaza = layout.dataPlaza!;
    expect(board.minX).toBeGreaterThan(plaza.center.x + plaza.w / 2);
    expect(board.center.z).toBe(0);
    expect(board.maxX - board.minX).toBeCloseTo(LABS.board.w);
    expect(board.maxZ - board.minZ).toBeCloseTo(LABS.board.d);
    expect(board.stop).toEqual({ x: board.minX - LABS.boardStop, z: 0 });
    expect(inPlaza(plaza, board.stop)).toBe(true);
    expect(onNetwork(network, board.stop)).toBe(true);
    expect(directoryStop("data", layout)).toEqual(board.stop);
    expect(floor.directoryStops).toEqual({ software: layout.boards.software!.stop, ai: layout.boards.ai!.stop, data: board.stop });
    const zone = zoneAt("L3", board.stop, floor.viewZones);
    expect(zone?.id).toBe("L3:directory:data");
    expect(zone?.zoom).toBe(LABS.boardZoom);
    expect(floor.tall).toContainEqual({ minX: board.minX, maxX: board.maxX, minZ: board.minZ, maxZ: board.maxZ, h: LABS.board.h });
    // The data wing sign floats over the data road, before the first data pod.
    const sign = layout.signs.data!;
    expect(sign.float.z).toBe(0);
    expect(sign.float.x).toBeLessThan(Math.min(...layout.placed.filter((p) => p.pod.wing === "data").map((p) => p.rect.minX)));
    expect(sign.float.x).toBeGreaterThan(layout.east.center.x + LABS.east / 2);
    expect(WING_TINT.data).toBe("#fbbf24");
  });

  it("sends data pods past the annex capacity and listed data pods to the data directory", () => {
    const many = Array.from({ length: LABS.data.maxPods + 2 }, (_, i) => pod(`m${i}`, "data", "featured", i));
    const crowded = buildLabsLayout([...hubPods, ...many, pod("listed-data", "data", "listed", 99)]);
    expect(crowded.placed.filter((p) => p.pod.wing === "data")).toHaveLength(LABS.data.maxPods);
    expect(crowded.directory.data.map((p) => p.slug)).toEqual([`m${LABS.data.maxPods}`, `m${LABS.data.maxPods + 1}`, "listed-data"]);
    expectSpaceRules({ bounds: crowded.floor.bounds, obstacles: crowded.floor.obstacles, doors: crowded.floor.doors ?? [], network: crowded.network, start: crowded.floor.approach });
  });

  it("builds an annex with only listed data pods: a short road to the plaza and its panel", () => {
    const only = buildLabsLayout([...hubPods, pod("listed-only", "data", "listed", 0)]);
    expect(only.placed.some((p) => p.pod.wing === "data")).toBe(false);
    expect(only.boards.data).toBeDefined();
    expectSpaceRules({ bounds: only.floor.bounds, obstacles: only.floor.obstacles, doors: only.floor.doors ?? [], network: only.network, start: only.floor.approach });
  });

  it("glows the data road from the reactor ring out to the farthest lit data pod", () => {
    const docked = layout.placed.filter((p) => p.pod.wing === "data");
    const lit = [docked[1], docked[3]];
    const segs = roadGlow(layout, lit);
    const start = network.roads.find((r) => r.id === "data")!.points[0];
    expect(segs[0]).toEqual({ a: start, b: { x: Math.max(...lit.map((p) => p.door.x)), z: 0 } });
    for (const p of lit) expect(segs).toContainEqual({ a: { x: p.door.x, z: 0 }, b: p.door });
    expect(segs).toHaveLength(1 + lit.length);
  });

  it("tours the hub wings, then the data wing, ending at all three directory panels", () => {
    const pods = [...hubPods, ...dataPods];
    const walk = labsWalk(pods, { wings: { software: "Product Engineering", ai: "AI Engineering", data: "Data and ML" }, more: "More projects here", moreSub: "" });
    const rooms = walk.stops.filter((s) => s.room).map((s) => s.room);
    expect(rooms).toEqual([...layout.placed.filter((p) => p.pod.wing !== "data"), ...layout.placed.filter((p) => p.pod.wing === "data")].map((p) => p.room));
    expect(walk.stops.slice(-3).map((s) => s.to)).toEqual([layout.boards.software!.stop, layout.boards.ai!.stop, layout.boards.data!.stop]);
    expect(walk.filters?.map((f) => f.id)).toEqual(["software", "ai", "data"]);
  });
});
