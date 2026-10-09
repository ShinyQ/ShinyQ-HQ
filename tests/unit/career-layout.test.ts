import { describe, expect, it } from "vitest";
import { getSideProjects, getYears } from "@/content/load";
import { buildCorridor, CORRIDOR, scrubTarget, WORKSHOP_ROOM } from "@/experience/floors/career/layout";
import { distanceToRect } from "@/experience/nav/collision";
import { buildNavGrid, findPath, isWalkable } from "@/experience/nav/navgrid";
import type { CareerLayoutInput, CareerType, Rect } from "@/experience/types";

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

describe("buildCorridor", () => {
  const c = buildCorridor(SAMPLE);

  it("makes one 14 u segment per year in ascending order from x = -20", () => {
    expect(c.segments.map((s) => s.year)).toEqual([2019, 2020, 2021]);
    expect(c.segments.map((s) => s.startX)).toEqual([-20, -6, 8]);
    expect(c.segments.map((s) => s.centerX)).toEqual([-13, 1, 15]);
    expect(c.endX).toBe(22);
  });

  it("alternates sides and stacks extra rooms outward", () => {
    const rooms = c.segments[0].rooms;
    expect(rooms.map((r) => r.side)).toEqual([-1, 1, -1, 1, -1]);
    expect(rooms.map((r) => r.row)).toEqual([0, 0, 1, 1, 2]);
    expect(rooms.map((r) => r.center.z)).toEqual([-10, 10, -19, 19, -28]);
    expect(new Set(rooms.map((r) => r.center.x))).toEqual(new Set([-13]));
  });

  it("uses smaller trophy plinths for awards", () => {
    const award = c.rooms.find((r) => r.type === "award")!;
    expect([award.w, award.d]).toEqual([6, 6]);
    expect(c.rooms.find((r) => r.type === "job")).toMatchObject({ w: 9, d: 8 });
  });

  it("puts each door zone just outside the corridor-facing edge", () => {
    for (const room of c.rooms) {
      const edge = Math.abs(room.center.z) - room.d / 2;
      expect(Math.abs(room.door.z)).toBe(edge);
      expect(Math.abs(room.at.z)).toBe(edge - CORRIDOR.doorSize / 2);
      expect(Math.sign(room.at.z)).toBe(room.side);
      expect(room.at.x).toBe(room.center.x);
      // Never on the corridor center line, so driving along the corridor never opens a room.
      expect(Math.abs(room.at.z)).toBeGreaterThanOrEqual(CORRIDOR.halfWidth + CORRIDOR.doorSize / 2);
    }
    expect(c.doors).toHaveLength(c.rooms.length + 1);
    expect(c.doors.at(-1)!.room).toBe(WORKSHOP_ROOM);
  });

  it("blocks only the pedestals inside rooms", () => {
    for (const room of c.rooms) {
      expect(c.obstacles.some((o) => distanceToRect(room.center, o) === 0)).toBe(true);
      expect(c.obstacles.some((o) => distanceToRect(room.at, o) < 1)).toBe(false);
    }
  });

  it("fits every room and the Workshop annex on the slab", () => {
    for (const room of c.rooms) expect(inside(roomRect(room), c.bounds)).toBe(true);
    expect(inside(c.annex, c.bounds)).toBe(true);
    expect(c.annex.minX).toBe(c.endX);
    expect(c.annex.maxX - c.annex.minX).toBe(CORRIDOR.annexLength);
    expect(c.windowX).toBe(c.bounds.maxX);
    expect(c.bounds.minX).toBe(-24);
  });

  it("places benches in front of the repo wall and the workshop door in front of the wall", () => {
    expect(c.workshop.benches).toHaveLength(5);
    for (const b of c.workshop.benches) expect(b.z).toBeGreaterThan(0);
    expect(c.workshop.at.z).toBeLessThan(0);
    expect(c.workshop.at.z).toBeGreaterThan(c.workshop.wall.maxZ);
  });

  it("lists scrub stops at segment centers and the annex", () => {
    expect(c.stops).toEqual([-13, 1, 15, 32]);
  });
});

describe("the real Career Archive", () => {
  const c = buildCorridor(real);
  const grid = buildNavGrid(c, 1);

  it("covers every year from getYears with every entry", () => {
    expect(c.segments.map((s) => s.year)).toEqual(getYears().map((y) => y.year));
    expect(c.rooms).toHaveLength(getYears().reduce((n, y) => n + y.entries.length, 0));
    expect(c.rooms.find((r) => r.slug === "prologue-2016")?.year).toBe(2019);
  });

  it("can reach every door zone from the elevator", () => {
    const start = { x: -21, z: 0 };
    for (const door of c.doors) {
      const path = findPath(grid, start, door.at);
      expect(path, door.room).not.toBeNull();
      const end = path!.at(-1)!;
      expect(Math.abs(end.x - door.at.x), door.room).toBeLessThanOrEqual(1);
      expect(Math.abs(end.z - door.at.z), door.room).toBeLessThanOrEqual(1);
    }
    expect(isWalkable(grid, { x: c.stops.at(-1)!, z: 0 })).toBe(true);
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
