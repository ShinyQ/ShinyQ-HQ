import { describe, expect, it } from "vitest";
import { getSideProjects, getYears } from "@/content/load";
import { buildFloorLayouts } from "@/experience/config";
import {
  BENCH,
  buildCareerRoad,
  CAREER_ROAD,
  labelFade,
  LABEL_FADE,
  placeAt,
  plazaLength,
  roadZAt,
  scrubTarget,
  WORKSHOP_ROOM,
} from "@/experience/floors/career/layout";
import { CAREER_TONE } from "@/experience/fx/holoIcons";
import { distanceToRect } from "@/experience/nav/collision";
import { DOOR_SIZE } from "@/experience/nav/doors";
import { PAD } from "@/experience/nav/pads";
import { buildNavGrid, findPath, isWalkable } from "@/experience/nav/navgrid";
import { onNetwork, pathBetween, roadRoute } from "@/experience/nav/road";
import type { CareerLayoutInput, CareerType, Rect } from "@/experience/types";
import { expectSpaceRules } from "../helpers/space";

const year = (y: number, types: CareerType[]) => ({ year: y, entries: types.map((type, i) => ({ slug: `e${y}-${i}`, type })) });

const SAMPLE: CareerLayoutInput = {
  years: [year(2019, ["milestone", "award", "job", "freelance", "education"]), year(2020, ["job"]), year(2021, ["award", "job"])],
  benches: 5,
};

const real: CareerLayoutInput = {
  years: getYears().map(({ year, entries }) => ({ year, entries: entries.map((e) => ({ slug: e.slug, type: e.type })) })),
  benches: getSideProjects().length,
};

const inside = (r: Rect, outer: Rect) => r.minX >= outer.minX && r.maxX <= outer.maxX && r.minZ >= outer.minZ && r.maxZ <= outer.maxZ;
const roomRect = (r: { center: { x: number; z: number }; w: number; d: number }): Rect => ({
  minX: r.center.x - r.w / 2,
  maxX: r.center.x + r.w / 2,
  minZ: r.center.z - r.d / 2,
  maxZ: r.center.z + r.d / 2,
});

describe("buildCareerRoad", () => {
  const c = buildCareerRoad(SAMPLE);

  it("makes one plaza per year in ascending order, sized by entry count, meandering in z", () => {
    expect(c.years.map((y) => y.year)).toEqual([2019, 2020, 2021]);
    expect(c.years.map((y) => y.plaza.w)).toEqual([plazaLength(5), plazaLength(1), plazaLength(2)]);
    expect(c.years.map((y) => y.plaza.center.z)).toEqual([0, CAREER_ROAD.meander, 0]);
    expect(c.years.map((y) => y.plaza.d)).toEqual([CAREER_ROAD.plazaDepth, CAREER_ROAD.plazaDepth, CAREER_ROAD.plazaDepth]);
    // The first plaza starts `lead` after the elevator approach; one `link` between plazas.
    expect(c.years[0].plaza.center.x - c.years[0].plaza.w / 2).toBe(CAREER_ROAD.approach.x + CAREER_ROAD.lead);
    const gap = c.years[1].plaza.center.x - c.years[1].plaza.w / 2 - (c.years[0].plaza.center.x + c.years[0].plaza.w / 2);
    expect(gap).toBeCloseTo(CAREER_ROAD.link);
  });

  it("keeps x increasing along the road, so the rail camera and scrubbing still work", () => {
    const xs = c.network.roads[0].points.map((p) => p.x);
    for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeGreaterThan(xs[i - 1]);
    expect(c.stops).toEqual([...c.stops].sort((a, b) => a - b));
  });

  it("docks rooms on both plaza edges in one row, alternating and staggered", () => {
    const rooms = c.years[0].rooms;
    expect(rooms.map((r) => r.side)).toEqual([-1, 1, -1, 1, -1]);
    const front = CAREER_ROAD.plazaDepth / 2 + CAREER_ROAD.apron;
    for (const r of c.rooms) {
      const zc = c.years.find((y) => y.year === r.year)!.plaza.center.z;
      expect(Math.abs(r.door.z - zc)).toBe(front);
      expect(Math.abs(r.center.z - zc)).toBe(front + CAREER_ROAD.roomDepth / 2);
    }
    // North and south rooms never share an x, so labels never stack in the side view.
    const north = new Set(rooms.filter((r) => r.side < 0).map((r) => r.center.x));
    for (const r of rooms.filter((r) => r.side > 0)) expect(north.has(r.center.x)).toBe(false);
  });

  it("uses narrower trophy plinths for awards", () => {
    expect(c.rooms.find((r) => r.type === "award")!.w).toBe(6);
    expect(c.rooms.find((r) => r.type === "job")).toMatchObject({ w: 9, d: 8 });
  });

  it("puts each door pad just outside the road-facing edge, facing into the room", () => {
    for (const room of c.rooms) {
      expect(room.at.x).toBe(room.center.x);
      expect(room.at.z).toBeCloseTo(room.door.z - (room.side * DOOR_SIZE) / 2);
      const door = c.doors.find((d) => d.room === room.id)!;
      expect(door.facing).toEqual({ x: 0, z: room.side });
    }
    expect(c.doors).toHaveLength(c.rooms.length + 1);
    expect(c.doors.at(-1)!.room).toBe(WORKSHOP_ROOM);
  });

  it("gives every room a spur in its type color and keeps pads off the road", () => {
    for (const room of c.rooms) {
      const spur = c.network.spurs.find((s) => s.room === room.id)!;
      expect(spur.to).toEqual(room.at);
      expect(spur.color).toBe(CAREER_TONE[room.type]);
      expect(onNetwork({ ...c.network, plazas: [], spurs: [] }, room.at)).toBe(false);
    }
  });

  it("blocks only the pedestals inside rooms", () => {
    for (const room of c.rooms) {
      expect(c.obstacles.some((o) => distanceToRect(room.center, o) === 0)).toBe(true);
      expect(c.obstacles.some((o) => distanceToRect(room.at, o) < 1)).toBe(false);
    }
  });

  it("fits every room, the annex and its benches on the slab, with the window at the far end", () => {
    for (const room of c.rooms) expect(inside(roomRect(room), c.bounds)).toBe(true);
    expect(c.windowX).toBe(c.bounds.maxX);
    expect(c.annex.center.x + c.annex.w / 2).toBe(c.bounds.maxX);
    expect(c.bounds.minX).toBe(-24);
    expect(c.workshop.benches).toHaveLength(5);
    for (const b of c.workshop.benches) expect(b.z).toBeGreaterThanOrEqual(BENCH.rows[0]);
    expect(c.workshop.at.z).toBeLessThan(0);
    expect(c.workshop.at.z).toBeGreaterThan(c.workshop.wall.maxZ);
  });

  it("lists scrub stops at plaza centers and the annex", () => {
    expect(c.stops).toEqual([...c.years.map((y) => y.plaza.center.x), c.annex.center.x]);
  });

  it("passes the space rules, teleporter pads included", () => {
    expectSpaceRules({ bounds: c.bounds, obstacles: c.obstacles, doors: c.doors, network: c.network, start: c.approach, pads: c.pads });
  });

  it("puts a teleporter pad on every year plaza, beside the road near the plaza start", () => {
    expect(c.pads.map((p) => p.id)).toEqual(c.years.map((y) => `teleport:${y.year}`));
    for (const y of c.years) {
      const x0 = y.plaza.center.x - y.plaza.w / 2;
      expect(y.teleport).toEqual({ x: x0 + CAREER_ROAD.teleport.inset, z: y.plaza.center.z + CAREER_ROAD.teleport.offset });
      expect(Math.abs(y.teleport.z - y.plaza.center.z) + PAD.radius).toBeLessThanOrEqual(y.plaza.d / 2);
    }
    expect(c.pads.every((p, i) => p.kind === "teleport" && p.year === c.years[i].year && p.at === c.years[i].teleport && p.face === 0)).toBe(true);
  });
});

describe("the real Career Road", () => {
  const c = buildCareerRoad(real);
  const grid = buildNavGrid(c, 1);

  it("covers every year from getYears with every entry", () => {
    expect(c.years.map((y) => y.year)).toEqual(getYears().map((y) => y.year));
    expect(c.rooms).toHaveLength(getYears().reduce((n, y) => n + y.entries.length, 0));
    expect(c.rooms.find((r) => r.slug === "prologue-2016")?.year).toBe(2019);
  });

  it("passes the space rules with the real content, teleporter pads included", () => {
    expectSpaceRules({ bounds: c.bounds, obstacles: c.obstacles, doors: c.doors, network: c.network, start: c.approach, pads: c.pads });
  });

  it("can reach every door pad from the elevator, along the road", () => {
    for (const door of c.doors) {
      const path = roadRoute(c.network, grid, c.approach, door.at);
      expect(path, door.room).not.toBeNull();
      const end = path!.at(-1)!;
      expect(Math.hypot(end.x - door.at.x, end.z - door.at.z), door.room).toBeLessThanOrEqual(1);
      expect(findPath(grid, c.approach, door.at), door.room).not.toBeNull();
    }
    expect(isWalkable(grid, { x: c.stops.at(-1)!, z: 0 })).toBe(true);
  });

  it("routes from the first room to the last room on the network", () => {
    const path = pathBetween(c.network, c.rooms[0].at, c.rooms.at(-1)!.at)!;
    for (const p of path) expect(onNetwork(c.network, p)).toBe(true);
  });

  it("is the L2 floor layout: road, doors, obstacles and scrub stops", () => {
    const layouts = buildFloorLayouts(real.years.length, { career: real });
    expect(layouts.L2.road).toEqual(c.network);
    expect(layouts.L2.doors).toEqual(c.doors);
    expect(layouts.L2.obstacles).toEqual(c.obstacles);
    expect(layouts.L2.scrubStops).toEqual(c.stops);
    expect(layouts.L2.bounds).toEqual(c.bounds);
  });
});

describe("placeAt", () => {
  const c = buildCareerRoad(SAMPLE);
  it("names the year from its arch on, the first year before the first arch, and the annex at the end", () => {
    expect(placeAt(c, CAREER_ROAD.approach.x)).toBe(2019);
    expect(placeAt(c, c.years[1].arch.center.x - 0.1)).toBe(2019);
    expect(placeAt(c, c.years[1].arch.center.x + 0.1)).toBe(2020);
    expect(placeAt(c, c.years[2].plaza.center.x)).toBe(2021);
    expect(placeAt(c, c.annex.center.x)).toBe("workshop");
    expect(placeAt({ years: [], annex: c.annex }, 0)).toBeNull();
  });
});

describe("labelFade", () => {
  it("is opaque near the rover and fades out by the far distance", () => {
    expect(labelFade(0)).toBe(1);
    expect(labelFade(-LABEL_FADE.near)).toBe(1);
    expect(labelFade((LABEL_FADE.near + LABEL_FADE.far) / 2)).toBeCloseTo(0.5);
    expect(labelFade(LABEL_FADE.far + 1)).toBe(0);
  });
});

describe("roadZAt", () => {
  const points = [
    { x: 0, z: 0 },
    { x: 10, z: 7 },
    { x: 20, z: 7 },
  ];
  it("interpolates along a road whose x increases, clamped at both ends", () => {
    expect(roadZAt(points, -5)).toBe(0);
    expect(roadZAt(points, 5)).toBeCloseTo(3.5);
    expect(roadZAt(points, 15)).toBe(7);
    expect(roadZAt(points, 99)).toBe(7);
    expect(roadZAt([], 3)).toBe(0);
  });
});

describe("scrubTarget", () => {
  const stops = [-13, 1, 15, 29];

  it("moves forward in time on a left swipe and back on a right swipe", () => {
    expect(scrubTarget(-13, -100, 400, stops)).toBe(1);
    expect(scrubTarget(15, 100, 400, stops)).toBe(1);
  });

  it("moves one stop per 30% of the screen width", () => {
    expect(scrubTarget(-13, -240, 400, stops)).toBe(15);
    expect(scrubTarget(-13, -400, 400, stops)).toBe(29);
  });

  it("goes to the next stop ahead when between stops", () => {
    expect(scrubTarget(-5, -50, 400, stops)).toBe(1);
    expect(scrubTarget(-5, 50, 400, stops)).toBe(-13);
  });

  it("clamps at both ends", () => {
    expect(scrubTarget(29, -500, 400, stops)).toBe(29);
    expect(scrubTarget(-21, 500, 400, stops)).toBe(-13);
    expect(scrubTarget(-21, -500, 400, stops)).toBe(29);
    expect(scrubTarget(3, 0, 400, stops)).toBe(3);
  });
});
