import { describe, expect, it } from "vitest";
import { buildExperienceData } from "@/content/experience";
import { ROVER } from "@/experience/config";
import { buildNewsroomLayout as build } from "@/experience/floors/library/concepts/newsroom";
import {
  dockAlong,
  LIBRARY_FLOOR,
  libraryLayoutInput,
  roomOfPost,
  stationYaw,
  trackRoom,
  type LibraryLayout,
  type LibraryLayoutInput,
} from "@/experience/floors/library/model";
import { SHELF, shelfSize } from "@/experience/floors/library/shelf";
import { distanceToRect } from "@/experience/nav/collision";
import { doorAt, onPad } from "@/experience/nav/doors";
import { buildNavGrid, isWalkable } from "@/experience/nav/navgrid";
import { pathBetween } from "@/experience/nav/road";
import { roadRoute } from "@/experience/nav/roadRoute";
import { rectGap } from "@/experience/nav/space";
import type { Rect, Vec2 } from "@/experience/types";
import { expectSpaceRules } from "../helpers/space";

const FLOOR_NAMES = { L1: "Lobby", L2: "Career Archive", L3: "Labs", L4: "Library", RF: "Roof" };
const real = libraryLayoutInput(buildExperienceData("en", FLOOR_NAMES).library);

/** `posts` synthetic posts (newest first) dealt over `tracks` tracks, so the first tracks hold the most posts. */
const fixture = (posts: number, shelves = 1, tracks = 1): LibraryLayoutInput => {
  const list = Array.from({ length: posts }, (_, i) => ({
    slug: `p${i}`,
    date: `${2026 - Math.floor(i / 3)}-0${(i % 9) + 1}-01`,
    tags: i % 2 ? ["odd", `t${i}`] : ["even"],
    external: i % 4 === 3,
  }));
  return {
    posts: list,
    tracks: Array.from({ length: tracks }, (_, t) => ({ slug: `track-${t}`, posts: list.filter((_, i) => i % tracks === t).map((p) => p.slug) })).filter((t) => t.posts.length),
    research: shelves,
    models: shelves,
    talks: shelves,
  };
};

const INPUTS: [string, LibraryLayoutInput][] = [
  ["real content", real],
  ["one post", fixture(1)],
  ["12 posts over 4 tracks", fixture(12, 1, 4)],
  ["39 posts over 5 tracks", fixture(39, 1, 5)],
  ["60 posts over 6 tracks", fixture(60, 1, 6)],
  ["120 posts over 4 tracks", fixture(120, 1, 4)],
  ["120 posts over 6 tracks", fixture(120, 1, 6)],
  ["no shelves", fixture(5, 0, 2)],
];

/** Every door pad of the floor as a station-like record: the stage, the bays and the desks. */
const docked = (layout: LibraryLayout) => [...layout.stations, ...layout.bays];

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

  it("docks an item with its own length along the road, across the bay depth for a track", () => {
    const { stations, end } = dockAlong(
      [
        { room: "L4:track:a", zone: "track", along: 12 },
        { room: "L4:research", zone: "research" },
      ],
      { a: { x: 0, z: 0 }, b: { x: 10, z: 0 }, side: 1, start: 2 },
    );
    expect(stations[0].rect).toEqual({ minX: 2, maxX: 14, minZ: 7, maxZ: 7 + SHELF.across });
    expect(stations[1].rect.minX).toBe(20);
    expect(end).toBe(30);
  });
});

describe("L4 concept newsroom", () => {
  it.each(INPUTS)("passes the space rules with %s", (_, input) => {
    const { floor, network } = build(input);
    expectSpaceRules({ bounds: floor.bounds, obstacles: floor.obstacles, doors: floor.doors ?? [], network, start: floor.approach });
  });

  it.each(INPUTS)("keeps the elevator call pad spot free with %s", (_, input) => {
    const layout = build(input);
    const zone = LIBRARY_FLOOR.padZone;
    for (const o of layout.floor.obstacles) expect(overlaps(o, zone), JSON.stringify(o)).toBe(false);
    for (const s of docked(layout)) expect(overlaps(s.rect, zone) || inside(s.door, zone), s.room).toBe(false);
    for (const sign of Object.values(layout.signs)) expect(inside(sign.at, zone)).toBe(false);
    expect(inside(layout.floor.spawn, zone)).toBe(false);
  });

  it.each(INPUTS)("gives every track one bay and every shelf one station, in order, with %s", (_, input) => {
    const layout = build(input);
    const featured = input.posts.find((p) => !p.external);
    expect(layout.stations.filter((s) => s.zone === "blog").map((s) => s.room)).toEqual(featured ? [roomOfPost(featured.slug)] : []);
    expect(layout.bays.map((b) => b.room)).toEqual(input.tracks.map((t) => trackRoom(t.slug)));
    layout.bays.forEach((bay, i) => {
      expect(bay.posts).toEqual(input.tracks[i].posts);
      expect(bay.slots).toHaveLength(bay.posts.length);
      expect(bay.facing.z).toBe(i % 2 === 0 ? -1 : 1);
      const along = bay.rect.maxX - bay.rect.minX;
      expect(along).toBeCloseTo(shelfSize(bay.posts.length).along);
      for (const slot of bay.slots) expect(slot.rect.minX >= bay.rect.minX - 1e-6 && slot.rect.maxX <= bay.rect.maxX + 1e-6 && slot.rect.minZ >= bay.rect.minZ - 1e-6 && slot.rect.maxZ <= bay.rect.maxZ + 1e-6, slot.slug).toBe(true);
    });
    const zones = layout.stations.map((s) => s.zone);
    expect(zones.indexOf("research")).toBe(input.research ? (featured ? 1 : 0) : -1);
    if (input.talks) expect(zones.at(-1)).toBe("talks");
    expect(layout.floor.doors!.map((d) => d.room)).toEqual([...layout.stations.filter((s) => s.zone === "blog"), ...layout.bays, ...layout.stations.filter((s) => s.zone !== "blog")].map((s) => s.room));
    expect(layout).not.toHaveProperty("board");
    expect(layout).not.toHaveProperty("archive");
    expect(layout.extras).not.toHaveProperty("years");
  });

  it.each(INPUTS)("resolves every post room through its bay stop or a door, each reachable on the road, with %s", (_, input) => {
    const layout = build(input);
    const { floor, network } = layout;
    const grid = buildNavGrid(floor, ROVER.radius);
    const doors = new Map((floor.doors ?? []).map((d) => [d.room, d.at]));
    for (const p of input.posts) {
      const room = roomOfPost(p.slug);
      const at = doors.get(room) ?? floor.stops?.[room];
      expect(at, room).toBeDefined();
      if (!doors.has(room)) expect(at).toEqual(layout.bays.find((b) => b.posts.includes(p.slug))!.door);
    }
    for (const [room, stop] of Object.entries(floor.stops ?? {})) {
      expect(isWalkable(grid, stop!), room).toBe(true);
      const route = roadRoute(network, grid, floor.approach, stop!);
      expect(route, room).not.toBeNull();
      const end = route!.at(-1)!;
      expect(Math.hypot(end.x - stop!.x, end.z - stop!.z), room).toBeLessThan(1);
    }
  });

  it("parks every door on clear floor, reachable along the road from the elevator", () => {
    const layout = build(real);
    const { floor, network } = layout;
    const grid = buildNavGrid(floor, ROVER.radius);
    for (const s of docked(layout)) {
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
    const layout = build(real);
    const { floor } = layout;
    for (const s of docked(layout)) {
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

  it("keeps the pads of neighbouring stations apart", () => {
    const stations = docked(build(fixture(120, 1, 6)));
    for (const a of stations) for (const b of stations) if (a !== b) expect(onPad({ room: a.room, at: a.door, facing: a.facing }, b.door)).toBe(false);
  });
});
