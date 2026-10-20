import { describe, expect, it } from "vitest";
import { zoneAt } from "@/experience/camera/orbit";
import { followPose } from "@/experience/camera/rigs";
import { buildFloorLayouts, LOBBY, ROVER } from "@/experience/config";
import { HALL, HALL_LAYOUT, shouldLoadShots, stationOf } from "@/experience/floors/lobby/hallLayout";
import { HIGHLIGHT_STATIONS, highlightRoom } from "@/experience/floors/lobby/stations";
import { roomTarget } from "@/experience/missions/host3d";
import { buildNavGrid, isWalkable } from "@/experience/nav/navgrid";
import { buildRoadGraph, routeUsesRoad } from "@/experience/nav/road";
import { roadRoute } from "@/experience/nav/roadRoute";
import { spaceViolations } from "@/experience/nav/space";

const layouts = buildFloorLayouts(8);
const l1 = layouts.L1;

describe("Highlights Hall layout", () => {
  it("extends the Lobby slab east and keeps the spawn and the elevator where they belong", () => {
    // More room (owner 2026-10-19): the slab is 54 u deep and the hall starts 5 u further east.
    expect(LOBBY.bounds).toEqual({ minX: -24, maxX: 69, minZ: -27, maxZ: 27 });
    expect(l1.bounds).toEqual(LOBBY.bounds);
    expect(l1.spawn).toEqual(LOBBY.spawn);
    expect(l1.approach).toEqual({ x: -21, z: 0 });
  });

  it("passes the space rules with the real Lobby and its office wing (the skills wall's plinth now touches the north slab edge)", () => {
    // The Visitor Observatory's door (south-west corner) is reached on the navgrid like the rest of the Lobby,
    // not on the hall road: tests/unit/lobby-observatory.test.ts checks its pad.
    const hallDoors = l1.doors!.filter((d) => d.room !== "L1:visits");
    const violations = spaceViolations({ bounds: l1.bounds, wings: l1.wings, obstacles: l1.obstacles, doors: hallDoors, network: l1.road!, start: l1.approach, pads: l1.pads });
    expect(violations.map((v) => `${v.rule}: ${v.detail}`)).toEqual([]);
  });

  it("keeps the certification wall readable from the plaza: the passage runs south of it, the hall stands behind it", () => {
    const cert = l1.obstacles[2];
    for (const p of HALL.lead) expect(p.z - cert.maxZ).toBeGreaterThanOrEqual(ROVER.radius + 5);
    for (const s of HALL_LAYOUT.stations) expect(s.rect.minX).toBeGreaterThan(cert.maxX + 5);
  });

  it("gives every station one door that faces into it, with its pad on open floor 1.1 u in front", () => {
    expect(l1.doors!.map((d) => d.room)).toEqual([...HIGHLIGHT_STATIONS.map(highlightRoom), "L1:visits"]);
    const grid = buildNavGrid(l1, ROVER.radius);
    for (const s of HALL_LAYOUT.stations) {
      const door = l1.doors!.find((d) => d.room === s.room)!;
      expect(door.at).toEqual(s.pad);
      expect(door.facing).toEqual(s.facing);
      expect(isWalkable(grid, s.pad), s.room).toBe(true);
      expect(Math.hypot(s.pad.x - s.front.x, s.pad.z - s.front.z)).toBeCloseTo(HALL.padInset);
    }
    expect(stationOf("experience").pad.x).toBeCloseTo(64.9);
    expect(stationOf("experience").pad.z).toBe(1);
  });

  it("follows the hall road only for drives into or out of the hall", () => {
    const about = stationOf("about").pad;
    expect(routeUsesRoad(l1, l1.spawn, about)).toBe(true);
    expect(routeUsesRoad(l1, about, l1.approach)).toBe(true);
    expect(routeUsesRoad(l1, l1.spawn, { x: 6, z: -15 })).toBe(false);
    const route = roadRoute(l1.road!, buildNavGrid(l1, ROVER.radius), l1.spawn, about, buildRoadGraph(l1.road!))!;
    expect(route.at(-1)).toEqual(about);
    expect(route.some((p) => p.z >= HALL.lead[0].z - 1 && p.x > LOBBY.certWall.x)).toBe(true);
  });

  it("drives missions to the station doors", () => {
    for (const s of HALL_LAYOUT.stations) expect(roomTarget(undefined, s.room, layouts, [])).toEqual(s.pad);
  });

  it("turns the camera to face each station from the plaza and looks into the hall from the passage", () => {
    for (const s of HALL_LAYOUT.stations) {
      const zone = zoneAt("L1", s.pad, l1.viewZones)!;
      expect(zone.id).toBe(s.room);
      const [cx, , cz] = followPose("desktop", [s.pad.x, 0, s.pad.z], zone.yaw).position;
      // The camera sits on the plaza side, so the station is straight ahead of the rover.
      expect((s.pad.x - cx) * s.facing.x + (s.pad.z - cz) * s.facing.z).toBeGreaterThan(10);
    }
    expect(zoneAt("L1", { x: 37, z: 21 }, l1.viewZones)?.id).toBe("L1:highlights-entry");
    // The spawn (the kiosk stop) has its own view: down the kiosk axis (tests/unit/lobby-observatory.test.ts).
    expect(zoneAt("L1", LOBBY.spawn, l1.viewZones)?.id).toBe("L1:kiosk");
  });

  it("loads the screenshots only once the rover heads for the hall", () => {
    expect(shouldLoadShots("L1", LOBBY.spawn.x)).toBe(false);
    expect(shouldLoadShots("L1", HALL.lazyX + 1)).toBe(true);
    expect(shouldLoadShots("L3", 40)).toBe(false);
  });
});
