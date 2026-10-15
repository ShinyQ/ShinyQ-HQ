import { describe, expect, it } from "vitest";
import { buildExperienceData } from "@/content/experience";
import { zoneAt } from "@/experience/camera/orbit";
import { buildFloorLayouts, ROVER } from "@/experience/config";
import { buildLabsLayout, directoryStop, LABS, tourOrder, WING_SIDE, WING_TINT } from "@/experience/floors/labs/layout";
import { REACTOR } from "@/experience/floors/labs/reactor";
import { roadGlow } from "@/experience/floors/labs/techReactor";
import { labsWalk } from "@/experience/missions/walks";
import { distanceToRect } from "@/experience/nav/collision";
import { buildNavGrid, isWalkable } from "@/experience/nav/navgrid";
import { roadRoute } from "@/experience/nav/roadRoute";
import { padViolations, rectGap } from "@/experience/nav/space";
import type { LabPod } from "@/experience/types";
import { expectSpaceRules } from "../helpers/space";

/** The Data and ML spine (Round 7 G, Option 1): the centre path from the hub fork to the Tech Reactor. */
const FLOOR_NAMES = { L1: "Lobby", L2: "Career Archive", L3: "Labs", L4: "Library", RF: "Roof" };
const real = buildExperienceData("en", FLOOR_NAMES).labs.pods;
const sidePods = real.filter((p) => p.wing !== "data");
const pod = (slug: string, wing: LabPod["wing"], tier: LabPod["tier"], order: number): LabPod => ({
  id: slug, slug, title: slug, tier, wing, accent: "amber", hologram: "chart", order, hasHologramView: tier === "hero", hasGallery: false,
});
const layout = buildLabsLayout(real);
const { floor, network } = layout;
const spinePods = layout.placed.filter((p) => p.pod.wing === "data");

describe("L3 Data and ML spine", () => {
  it("passes the space rules and the pad rules with the real pods, six spine pods, a hero spine pod and none", () => {
    const sets = [
      real,
      [...sidePods, ...Array.from({ length: 6 }, (_, i) => pod(`d${i}`, "data", "featured", i))],
      [...sidePods, pod("hero-data", "data", "hero", 0), pod("f-data", "data", "featured", 1)],
      sidePods,
      [],
    ];
    for (const pods of sets) {
      const l = buildLabsLayout(pods);
      expectSpaceRules({ bounds: l.floor.bounds, obstacles: l.floor.obstacles, doors: l.floor.doors ?? [], network: l.network, start: l.floor.approach });
      const pads = buildFloorLayouts(8, { labs: pods }).L3.pads ?? [];
      expect(padViolations({ bounds: l.floor.bounds, obstacles: l.floor.obstacles, doors: l.floor.doors ?? [], network: l.network, start: l.floor.approach, pads })).toEqual([]);
    }
  });

  it("docks spine pods alternating north and south from x = 24, doors facing the spine, 6 u from the inner wing rows", () => {
    expect(spinePods.map((p) => p.pod.slug)).toEqual(tourOrder(real.filter((p) => p.wing === "data")).map((p) => p.slug));
    spinePods.forEach((p, i) => {
      expect(Math.sign(p.center.z), p.room).toBe(i % 2 === 0 ? -1 : 1);
      expect(p.roadZ).toBe(0);
      expect(Math.sign(0 - p.center.z)).toBe(p.facing);
      expect(Math.min(Math.abs(p.rect.minZ), Math.abs(p.rect.maxZ))).toBeCloseTo(LABS.road / 2 + LABS.forecourt);
    });
    const north = spinePods.filter((p) => p.center.z < 0);
    const south = spinePods.filter((p) => p.center.z > 0);
    expect(north[0].center.x).toBe(LABS.data.start + LABS.slot / 2);
    expect(south[0].center.x - north[0].center.x).toBe(LABS.innerStart - LABS.outerStart);
    const inner = layout.placed.filter((p) => p.pod.wing !== "data" && p.row === "inner");
    for (const s of spinePods) for (const w of inner) expect(rectGap(s.rect, w.rect), `${s.room} ${w.room}`).toBeGreaterThanOrEqual(LABS.rowGap);
    expect(Math.min(...inner.map((w) => Math.min(Math.abs(w.rect.minZ), Math.abs(w.rect.maxZ)))) - Math.max(...spinePods.map((s) => Math.max(Math.abs(s.rect.minZ), Math.abs(s.rect.maxZ))))).toBeCloseTo(LABS.rowGap);
  });

  it("widens the wing roads just enough for the spine and keeps the reactor plaza, Ops Control Room and Return pad x", () => {
    expect(layout.wingZ).toBe(36);
    expect(buildLabsLayout([]).wingZ).toBeGreaterThanOrEqual(LABS.wingZ);
    expect(layout.east.center).toEqual({ x: 107, z: 0 });
    expect(layout.ops.rect.minX).toBe(97);
    expect(floor.returnPad).toEqual({ x: 117, z: 9 });
    expect(floor.bounds.maxX).toBe(layout.east.center.x + LABS.east / 2 + LABS.margin);
    expect(floor.stops!["L3:reactor"]).toEqual({ x: layout.east.center.x + REACTOR.ring, z: 0 });
  });

  it("reaches every spine door along the road from the elevator, the camera turning at each", () => {
    const grid = buildNavGrid(floor, ROVER.radius);
    for (const p of spinePods) {
      expect(isWalkable(grid, p.door), p.room).toBe(true);
      const route = roadRoute(network, grid, floor.approach, p.door)!;
      expect(Math.hypot(route.at(-1)!.x - p.door.x, route.at(-1)!.z - p.door.z)).toBeLessThan(1);
      expect(zoneAt("L3", p.door, floor.viewZones)?.id).toBe(p.room);
      expect(distanceToRect(floor.returnPad!, p.rect)).toBeGreaterThanOrEqual(6);
    }
  });

  it("sends spine pods past its capacity and listed data pods to the data directory", () => {
    const many = Array.from({ length: LABS.data.maxPods + 2 }, (_, i) => pod(`m${i}`, "data", "featured", i));
    const crowded = buildLabsLayout([...sidePods, ...many, pod("listed-data", "data", "listed", 99)]);
    expect(crowded.placed.filter((p) => p.pod.wing === "data")).toHaveLength(LABS.data.maxPods);
    expect(crowded.directory.data.map((p) => p.slug)).toEqual([`m${LABS.data.maxPods}`, `m${LABS.data.maxPods + 1}`, "listed-data"]);
    expectSpaceRules({ bounds: crowded.floor.bounds, obstacles: crowded.floor.obstacles, doors: crowded.floor.doors ?? [], network: crowded.network, start: crowded.floor.approach });
  });

  it("glows the spine from the reactor ring back to the westmost lit spine pod", () => {
    const lit = [spinePods[1], spinePods[3]];
    const segs = roadGlow(layout, lit);
    const entry = network.roads.find((r) => r.id === "data")!.points.at(-1)!;
    expect(segs).toContainEqual({ a: entry, b: { x: Math.min(...lit.map((p) => p.door.x)), z: 0 } });
    for (const p of lit) expect(segs).toContainEqual({ a: { x: p.door.x, z: 0 }, b: p.door });
    expect(segs).toHaveLength(1 + lit.length);
  });

  it("tours Product, AI, then Data and ML, ending at all three boards of the wall", () => {
    const walk = labsWalk(real, { wings: { software: "Product Engineering", ai: "AI Engineering", data: "Data and ML" }, more: "More projects here", moreSub: "" });
    const rooms = walk.stops.filter((s) => s.room).map((s) => s.room);
    const by = (w: LabPod["wing"]) => layout.placed.filter((p) => p.pod.wing === w).map((p) => p.room);
    expect(rooms).toEqual([...by("software"), ...by("ai"), ...by("data")]);
    expect(walk.stops.slice(-3).map((s) => s.to)).toEqual([directoryStop("software"), directoryStop("ai"), directoryStop("data")]);
    expect(WING_TINT.data).toBe("#fbbf24");
    expect(WING_SIDE).toEqual({ software: -1, ai: 1 });
  });

  it("has no Product Engineering directory stop when there are only AI pods", () => {
    const walk = labsWalk(real.filter((p) => p.wing === "ai"), { wings: { software: "Product Engineering", ai: "AI Engineering", data: "Data and ML" }, more: "More projects here", moreSub: "" });
    expect(walk.stops.some((s) => s.group === "Product Engineering" && s.title === "More projects here")).toBe(false);
  });

  it("puts one floating sign at each road: wing signs past their mouths, the spine sign over the spine before the wall", () => {
    for (const wing of ["software", "ai"] as const) {
      const road = network.roads.find((r) => r.id === wing)!;
      expect(layout.signs[wing].at).toEqual(road.points[1]);
      expect(Math.hypot(layout.signs[wing].float.x - road.points[1].x, layout.signs[wing].float.z - road.points[1].z)).toBeCloseTo(LABS.signAlong);
    }
    expect(layout.signs.data.float).toEqual({ x: LABS.spineSignX, z: 0 });
    expect(layout.signs.data.float.x).toBeLessThan(layout.boards.data.minX);
    expect(Object.keys(layout.signs).sort()).toEqual(["ai", "data", "software"]);
  });
});
