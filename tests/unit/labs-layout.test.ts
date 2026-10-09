import { describe, expect, it } from "vitest";
import { buildExperienceData } from "@/content/experience";
import { buildFloorLayouts, ROVER, SHAFT } from "@/experience/config";
import { buildLabsLayout, directoryStop, LABS, WING_SIDE } from "@/experience/floors/labs/layout";
import { distanceToRect } from "@/experience/nav/collision";
import { buildNavGrid, findPath, isWalkable } from "@/experience/nav/navgrid";
import type { LabPod } from "@/experience/types";

const FLOOR_NAMES = { L1: "Lobby", L2: "Career Archive", L3: "Labs", L4: "Library", RF: "Roof" };
const pods = buildExperienceData("en", FLOOR_NAMES).labs.pods;
const layout = buildLabsLayout(pods);

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

describe("L3 Labs layout", () => {
  it("keeps the global shaft outside the slab and lands the rover in the atrium", () => {
    expect(SHAFT.x + SHAFT.size / 2).toBeLessThanOrEqual(LABS.bounds.minX);
    const { approach, door } = layout.floor;
    expect(door).toEqual({ x: -24, z: 0 });
    expect(approach.x).toBeGreaterThanOrEqual(LABS.atrium.minX);
    expect(approach.x).toBeLessThanOrEqual(LABS.atrium.maxX);
    expect(Math.abs(approach.z)).toBeLessThanOrEqual(LABS.atrium.maxZ);
  });

  it("puts the Software Wing north (z < 0) and the AI Wing south (z > 0)", () => {
    for (const p of layout.placed) expect(Math.sign(p.center.z)).toBe(WING_SIDE[p.pod.wing]);
  });

  it("places heroes nearest the atrium first, then featured pods west to east", () => {
    for (const wing of ["software", "ai"] as const) {
      const heroes = layout.placed.filter((p) => p.pod.wing === wing && p.pod.tier === "hero");
      const featured = layout.placed.filter((p) => p.pod.wing === wing && p.pod.tier === "featured");
      expect(heroes.length).toBe(Math.min(3, pods.filter((p) => p.wing === wing && p.tier === "hero").length));
      expect(heroes.map((p) => p.center.x)).toEqual([...LABS.hero.xs].slice(0, heroes.length));
      expect(heroes.map((p) => p.pod.order)).toEqual([...heroes.map((p) => p.pod.order)].sort((a, b) => a - b));
      expect(featured.every((p) => Math.abs(p.center.z) === LABS.featured.z)).toBe(true);
      expect(featured.map((p) => p.center.x)).toEqual([...featured.map((p) => p.center.x)].sort((a, b) => a - b));
    }
  });

  it("gives both wings mirror-image placement (equal billing)", () => {
    const slots = (wing: "software" | "ai") =>
      layout.placed.filter((p) => p.pod.wing === wing).map((p) => `${p.pod.tier}@${p.center.x},${Math.abs(p.center.z)}`);
    const sw = slots("software");
    const ai = slots("ai");
    const shared = Math.min(sw.length, ai.length);
    expect(sw.slice(0, shared).filter((s) => s.startsWith("hero"))).toEqual(ai.slice(0, shared).filter((s) => s.startsWith("hero")));
  });

  it("sends listed pods and overflow to the wing directory only", () => {
    const listed = pods.filter((p) => p.tier === "listed");
    expect(layout.placed.some((p) => p.pod.tier === "listed")).toBe(false);
    expect([...layout.directory.software, ...layout.directory.ai].map((p) => p.slug)).toEqual(expect.arrayContaining(listed.map((p) => p.slug)));
    const crowded = buildLabsLayout([0, 1, 2, 3].map((i) => pod(`h${i}`, "ai", "hero", i)));
    expect(crowded.placed).toHaveLength(3);
    expect(crowded.directory.ai.map((p) => p.slug)).toEqual(["h3"]);
  });

  it("keeps pods inside the slab and apart from each other", () => {
    const rects = layout.placed.map((p) => p.rect);
    for (const r of rects) {
      expect(r.minX).toBeGreaterThanOrEqual(LABS.bounds.minX);
      expect(r.maxX).toBeLessThanOrEqual(LABS.bounds.maxX);
      expect(r.minZ).toBeGreaterThanOrEqual(LABS.bounds.minZ);
      expect(r.maxZ).toBeLessThanOrEqual(LABS.bounds.maxZ);
    }
    rects.forEach((a, i) =>
      rects.slice(i + 1).forEach((b) => expect(a.maxX <= b.minX || b.maxX <= a.minX || a.maxZ <= b.minZ || b.maxZ <= a.minZ).toBe(true)),
    );
  });

  it("puts every door zone on clear floor, facing its lane, reachable from the elevator", () => {
    const grid = buildNavGrid(layout.floor, ROVER.radius);
    expect(layout.floor.doors).toHaveLength(layout.placed.length);
    for (const p of layout.placed) {
      for (const o of layout.floor.obstacles) expect(distanceToRect(p.door, o)).toBeGreaterThanOrEqual(ROVER.radius);
      expect(Math.sign(p.door.z - p.center.z)).toBe(p.facing);
      expect(isWalkable(grid, p.door)).toBe(true);
      const path = findPath(grid, layout.floor.approach, p.door);
      expect(path, p.room).not.toBeNull();
      const end = path![path!.length - 1];
      expect(Math.hypot(end.x - p.door.x, end.z - p.door.z)).toBeLessThan(1);
    }
  });

  it("stops listed items in front of their wing's directory pillar", () => {
    const grid = buildNavGrid(layout.floor, ROVER.radius);
    for (const wing of ["software", "ai"] as const) {
      const stop = directoryStop(wing);
      expect(isWalkable(grid, stop)).toBe(true);
      expect(Math.sign(stop.z)).toBe(WING_SIDE[wing]);
    }
  });

  it("is what buildFloorLayouts uses for L3 when pods are given", () => {
    const layouts = buildFloorLayouts(8, { labs: pods });
    expect(layouts.L3.doors).toEqual(layout.floor.doors);
    expect(buildFloorLayouts(8).L3.doors).toEqual([]);
  });
});
