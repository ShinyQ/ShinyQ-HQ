import { describe, expect, it } from "vitest";
import { buildExperienceData } from "@/content/experience";
import { ROVER } from "@/experience/config";
import { CONCEPT_BUILDERS } from "@/experience/floors/library/concepts";
import {
  dockAlong,
  LIBRARY_CONCEPTS,
  LIBRARY_FLOOR,
  libraryLayoutInput,
  stationYaw,
  tagLinks,
  type LibraryLayoutInput,
} from "@/experience/floors/library/model";
import { distanceToRect } from "@/experience/nav/collision";
import { doorAt, onPad } from "@/experience/nav/doors";
import { buildNavGrid, isWalkable } from "@/experience/nav/navgrid";
import { pathBetween, roadRoute } from "@/experience/nav/road";
import { rectGap } from "@/experience/nav/space";
import type { Rect, Vec2 } from "@/experience/types";
import { expectSpaceRules } from "../helpers/space";

const FLOOR_NAMES = { L1: "Lobby", L2: "Career Archive", L3: "Labs", L4: "Library", RF: "Roof" };
const real = libraryLayoutInput(buildExperienceData("en", FLOOR_NAMES).library);

const fixture = (posts: number, shelves = 1): LibraryLayoutInput => ({
  posts: Array.from({ length: posts }, (_, i) => ({
    slug: `p${i}`,
    date: `${2026 - Math.floor(i / 3)}-0${(i % 9) + 1}-01`,
    tags: i % 2 ? ["odd", `t${i}`] : ["even"],
    external: i % 4 === 3,
  })),
  research: shelves,
  models: shelves,
  talks: shelves,
});

const INPUTS: [string, LibraryLayoutInput][] = [
  ["real content", real],
  ["one post", fixture(1)],
  ["20 posts (archive)", fixture(20)],
  ["no shelves", fixture(5, 0)],
];

const overlaps = (a: Rect, b: Rect) => a.minX < b.maxX && b.minX < a.maxX && a.minZ < b.maxZ && b.minZ < a.maxZ;
const inside = (p: Vec2, r: Rect) => p.x >= r.minX && p.x <= r.maxX && p.z >= r.minZ && p.z <= r.maxZ;

describe("dockAlong", () => {
  it("docks stations 6 u apart on the requested side, pads between the road and the station", () => {
    const { stations, end } = dockAlong(
      [
        { room: "L4:a", zone: "blog" },
        { room: "L4:b", zone: "blog" },
      ],
      { a: { x: 0, z: 0 }, b: { x: 10, z: 0 }, side: -1, start: 2 },
    );
    expect(stations.map((s) => s.center)).toEqual([
      { x: 4, z: -9 },
      { x: 14, z: -9 },
    ]);
    expect(rectGap(stations[0].rect, stations[1].rect)).toBe(6);
    expect(stations[0].facing).toEqual({ x: 0, z: -1 });
    expect(stations[0].door).toEqual({ x: 4, z: -5.9 });
    expect(stations[0].from).toEqual({ x: 4, z: 0 });
    expect(end).toBe(16);
  });

  it("turns the camera toward the station for every facing", () => {
    expect(stationYaw({ x: 0, z: -1 })).toBe(0);
    expect(stationYaw({ x: 0, z: 1 })).toBe(Math.PI / 2);
    expect(stationYaw({ x: -1, z: 0 })).toBe(Math.PI / 4);
    expect(stationYaw({ x: 1, z: 0 })).toBe(-Math.PI / 2);
  });

  it("links docked posts that share a tag, newer post first", () => {
    const links = tagLinks(fixture(4));
    expect(links).toEqual([
      ["L4:p0", "L4:p2"],
      ["L4:p1", "L4:p3"],
    ]);
  });
});

describe.each(LIBRARY_CONCEPTS)("L4 concept %s", (concept) => {
  const build = CONCEPT_BUILDERS[concept];

  it.each(INPUTS)("passes the space rules with %s", (_, input) => {
    const { floor, network } = build(input);
    expectSpaceRules({ bounds: floor.bounds, obstacles: floor.obstacles, doors: floor.doors ?? [], network, start: floor.approach });
  });

  it.each(INPUTS)("keeps the elevator call pad spot free with %s", (_, input) => {
    const layout = build(input);
    const zone = LIBRARY_FLOOR.padZone;
    for (const o of layout.floor.obstacles) expect(overlaps(o, zone), JSON.stringify(o)).toBe(false);
    for (const s of layout.stations) expect(overlaps(s.rect, zone) || inside(s.door, zone), s.room).toBe(false);
    for (const sign of Object.values(layout.signs)) expect(inside(sign.at, zone)).toBe(false);
    expect(inside(layout.floor.spawn, zone)).toBe(false);
  });

  it.each(INPUTS)("gives every docked post and every shelf one station, in walk order, with %s", (_, input) => {
    const layout = build(input);
    const posts = layout.stations.filter((s) => s.zone === "blog").map((s) => s.room);
    const docked = input.posts.slice(0, LIBRARY_FLOOR.maxPosts).map((p) => `L4:${p.slug}`);
    expect([...posts].sort()).toEqual([...docked].sort());
    expect(layout.archive).toEqual(input.posts.slice(LIBRARY_FLOOR.maxPosts).map((p) => p.slug));
    expect(layout.board === null).toBe(layout.archive.length === 0);
    const zones = layout.stations.map((s) => s.zone);
    expect(zones.indexOf("research")).toBe(input.research ? posts.length : -1);
    if (input.talks) expect(zones.at(-1)).toBe("talks");
    expect(layout.floor.doors!.map((d) => d.room)).toEqual(layout.stations.map((s) => s.room));
  });

  it("parks every station door on clear floor, reachable along the road from the elevator", () => {
    const { floor, network, stations, board } = build(real);
    const grid = buildNavGrid(floor, ROVER.radius);
    for (const s of stations) {
      for (const o of floor.obstacles) expect(distanceToRect(s.door, o)).toBeGreaterThanOrEqual(ROVER.radius);
      expect(isWalkable(grid, s.door), s.room).toBe(true);
      expect(Math.hypot(s.facing.x, s.facing.z)).toBeCloseTo(1);
      // The pad sits between the road and the station front.
      expect((s.center.x - s.door.x) * s.facing.x + (s.center.z - s.door.z) * s.facing.z).toBeGreaterThan(0);
      const route = roadRoute(network, grid, floor.approach, s.door);
      expect(route, s.room).not.toBeNull();
      const end = route!.at(-1)!;
      expect(Math.hypot(end.x - s.door.x, end.z - s.door.z)).toBeLessThan(1);
    }
    if (board) expect(isWalkable(grid, board.stop)).toBe(true);
  });

  it("spawns deep links and elevator arrivals on walkable floor outside every pad", () => {
    const { floor } = build(real);
    expect(isWalkable(buildNavGrid(floor, ROVER.radius), floor.spawn)).toBe(true);
    expect(doorAt(floor.doors, floor.spawn)).toBeNull();
    expect(doorAt(floor.doors, floor.approach)).toBeNull();
    expect(floor.arrival).toEqual(floor.spawn);
    expect(floor.door).toEqual({ x: -24, z: 0 });
    expect(floor.bounds.minX).toBe(-24);
  });

  it("writes zone names on the road in front of each zone, upright for the default camera", () => {
    const layout = build(real);
    for (const zone of ["blog", "research", "models", "talks"] as const) {
      const sign = layout.signs[zone];
      expect([JSON.stringify({ x: 1, z: 0 }), JSON.stringify({ x: 0, z: -1 })]).toContain(JSON.stringify(sign.heading));
      const first = layout.stations.find((s) => s.zone === zone)!;
      expect(Math.hypot(sign.at.x - first.from.x, sign.at.z - first.from.z)).toBeLessThanOrEqual(LIBRARY_FLOOR.road / 2);
    }
  });

  it("turns the camera at every door", () => {
    const { floor, stations } = build(real);
    for (const s of stations) {
      const zone = floor.viewZones!.find((z) => z.id === s.room)!;
      expect(inside(s.door, zone.area)).toBe(true);
      expect(zone.yaw).toBe(stationYaw(s.facing));
    }
  });

  it("joins every road into one network (the far end of each road is reachable from the lead road)", () => {
    const { network, floor } = build(real);
    for (const road of network.roads) {
      const path = pathBetween(network, floor.approach, road.points.at(-1)!);
      expect(path, road.id).not.toBeNull();
    }
  });

  it("links only docked posts that share a tag", () => {
    const layout = build(fixture(20));
    const rooms = new Set(layout.stations.map((s) => s.room));
    for (const [a, b] of layout.links) {
      expect(rooms.has(a)).toBe(true);
      expect(rooms.has(b)).toBe(true);
    }
  });

  it("keeps the pads of neighbouring stations apart", () => {
    const { stations } = build(fixture(20));
    for (const a of stations) for (const b of stations) if (a !== b) expect(onPad({ room: a.room, at: a.door, facing: a.facing }, b.door)).toBe(false);
  });
});
