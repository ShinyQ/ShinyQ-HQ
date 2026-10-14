import { describe, expect, it } from "vitest";
import { buildExperienceData } from "@/content/experience";
import { buildFloorLayouts, ROVER } from "@/experience/config";
import { NEWSROOM } from "@/experience/floors/library/concepts/newsroom";
import { buildLibraryLayout } from "@/experience/floors/library/layout";
import { LIBRARY_FLOOR, libraryLayoutInput, type LibraryLayoutInput } from "@/experience/floors/library/model";
import { TOPICS_ROOM } from "@/experience/floors/library/topicHash";
import { distanceToRect } from "@/experience/nav/collision";
import { distanceToElevator, FAST_RETURN } from "@/experience/nav/fastReturn";
import { buildNavGrid, isWalkable } from "@/experience/nav/navgrid";
import { PAD } from "@/experience/nav/pads";
import { roadRoute } from "@/experience/nav/roadRoute";
import type { Rect, Vec2 } from "@/experience/types";
import { expectPadRules, expectSpaceRules } from "../helpers/space";

const FLOOR_NAMES = { L1: "Lobby", L2: "Career Archive", L3: "Labs", L4: "Library", RF: "Roof" };
const data = buildExperienceData("en", FLOOR_NAMES);
const real = libraryLayoutInput(data.library);
const crowded: LibraryLayoutInput = {
  ...real,
  posts: Array.from({ length: LIBRARY_FLOOR.maxPosts + 6 }, (_, i) => ({ slug: `p${i}`, date: `${2026 - Math.floor(i / 4)}-01-01`, tags: ["case-study"], external: false })),
};
const inside = (p: Vec2, r: Rect) => p.x >= r.minX && p.x <= r.maxX && p.z >= r.minZ && p.z <= r.maxZ;
/** Shortest distance from a point to the segment a to b. */
function segDist(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1)));
  return Math.hypot(p.x - (a.x + t * dx), p.z - (a.z + t * dz));
}

describe.each([
  ["real content", real],
  ["crowded (archive board)", crowded],
  ["no research metrics", { ...real, metrics: false }],
])("L4 end plaza with %s", (_, input) => {
  const layout = buildLibraryLayout(input);
  const end = layout.end!;
  const floors = buildFloorLayouts(data.years.length, { library: input });
  const L4 = floors.L4;
  const grid = buildNavGrid(L4, ROVER.radius);

  it("passes the space and pad rules with the constellation core, the monument and the pads", () => {
    expectSpaceRules({ bounds: L4.bounds, obstacles: L4.obstacles, doors: L4.doors ?? [], network: L4.road!, start: L4.approach, pads: L4.pads });
    expectPadRules({ bounds: L4.bounds, obstacles: L4.obstacles, doors: L4.doors ?? [], network: L4.road, start: L4.approach, pads: L4.pads ?? [] });
  });

  it("puts the constellation core on the end plaza center, inside a closed ring road the timeline ends on", () => {
    const plaza = layout.network.plazas.find((p) => p.id === "end")!;
    expect(plaza.center).toEqual(end.center);
    expect(plaza.round).toBe(true);
    expect(plaza.w).toBe(NEWSROOM.end.plaza);
    expect(plaza.core).toBe(NEWSROOM.end.core);
    expect(L4.obstacles).toContainEqual(end.core);
    const ring = layout.network.roads.find((r) => r.id === "end-ring")!;
    expect(ring.closed).toBe(true);
    const timeline = layout.network.roads.find((r) => r.id === "timeline")!;
    expect(timeline.points.at(-1)).toEqual(end.ringStop);
    expect(Math.hypot(end.ringStop.x - end.center.x, end.ringStop.z - end.center.z)).toBeCloseTo(NEWSROOM.end.ring);
    expect(L4.stops?.[TOPICS_ROOM]).toEqual(end.ringStop);
  });

  it("keeps the plaza clear of every station and the timeline unchanged", () => {
    const r = NEWSROOM.end.plaza / 2;
    for (const s of layout.stations) expect(distanceToRect(end.center, s.rect), s.room).toBeGreaterThan(r);
    // The press plaza, the stations and the year marks do not move.
    expect(layout.stations.map((s) => s.rect)).toEqual(buildLibraryLayout({ ...input, metrics: false }).stations.map((s) => s.rect));
  });

  it("routes from the elevator to the constellation, the monument and the board around the core", () => {
    const targets = [end.ringStop, ...(end.monument ? [end.monument.stop] : []), ...(layout.board ? [layout.board.stop] : [])];
    for (const t of targets) {
      expect(isWalkable(grid, t)).toBe(true);
      const route = roadRoute(L4.road!, grid, L4.approach, t)!;
      expect(route).not.toBeNull();
      const pts = [L4.approach, ...route];
      for (let i = 1; i < pts.length; i++) expect(segDist(end.center, pts[i - 1], pts[i])).toBeGreaterThan(NEWSROOM.end.core + ROVER.radius);
    }
  });

  it("docks the monument north of the plaza (only with metrics), facing the plaza, a tall camera column", () => {
    if (!input.metrics) {
      expect(end.monument).toBeNull();
      return;
    }
    const m = end.monument!;
    expect(m.center.x).toBe(end.center.x);
    expect(m.rect.maxZ).toBeLessThan(end.center.z - NEWSROOM.end.plaza / 2);
    expect(L4.obstacles).toContainEqual(m.rect);
    expect(L4.tall).toContainEqual({ ...m.rect, h: NEWSROOM.end.monument.h });
    expect(m.stop.z).toBeGreaterThan(m.rect.maxZ);
    const zone = L4.viewZones!.find((z) => z.id === "L4:metrics")!;
    expect(inside(m.stop, zone.area)).toBe(true);
    expect(zone.yaw).toBe(NEWSROOM.end.lookNorth);
  });

  it("sets the Return pad south of the plaza, far from the elevator and off the ring road", () => {
    expect(L4.returnPad).toEqual(end.returnPad);
    const pad = L4.pads!.find((p) => p.kind === "return")!;
    expect(pad.id).toBe("return:L4");
    expect(distanceToElevator(pad.at, L4)).toBeGreaterThan(FAST_RETURN.beamDistance);
    expect(Math.hypot(pad.at.x - end.center.x, pad.at.z - end.center.z)).toBeGreaterThan(NEWSROOM.end.plaza / 2 + PAD.radius);
    expect(pad.at.z).toBeGreaterThan(end.center.z);
    expect(isWalkable(grid, pad.at)).toBe(true);
  });

  it("lists the core (and the board) as tall camera columns and turns the camera at the constellation stop", () => {
    expect(L4.tall).toContainEqual({ ...end.core, h: NEWSROOM.end.coreHeight });
    if (layout.board) expect(L4.tall).toContainEqual({ ...layout.board.rect, h: NEWSROOM.board.h });
    const zone = L4.viewZones!.find((z) => z.id === TOPICS_ROOM)!;
    expect(inside(end.ringStop, zone.area)).toBe(true);
  });
});
