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
import type { Rect } from "@/experience/types";

const layouts = buildFloorLayouts(8);
const l1 = layouts.L1;
const label = (r: Rect) => `[${r.minX.toFixed(2)}..${r.maxX.toFixed(2)} x ${r.minZ.toFixed(2)}..${r.maxZ.toFixed(2)}]`;

describe("Highlights Hall layout", () => {
  it("extends the Lobby slab east and keeps the plaza, the spawn and the elevator where they were", () => {
    expect(LOBBY.bounds).toEqual({ minX: -24, maxX: 64, minZ: -21, maxZ: 21 });
    expect(l1.bounds).toEqual(LOBBY.bounds);
    expect(l1.spawn).toEqual(LOBBY.spawn);
    expect(l1.approach).toEqual({ x: -21, z: 0 });
  });

  it("passes the space rules with the real Lobby; only the skills wall, which predates them, sits near the slab edge", () => {
    const [, skills] = l1.obstacles;
    const violations = spaceViolations({ bounds: l1.bounds, obstacles: l1.obstacles, doors: l1.doors!, network: l1.road!, start: l1.approach, pads: l1.pads });
    expect(violations.map((v) => `${v.rule}: ${v.detail}`)).toEqual([
      `bounds-gap: 2.00 u between ${label(skills)} and the slab edge`,
    ]);
  });

  it("keeps the certification wall readable from the plaza: the passage runs south of it, the hall stands behind it", () => {
    const cert = l1.obstacles[2];
    for (const p of HALL.lead) expect(p.z - cert.maxZ).toBeGreaterThanOrEqual(ROVER.radius + 5);
    for (const s of HALL_LAYOUT.stations) expect(s.rect.minX).toBeGreaterThan(cert.maxX + 5);
  });

  it("gives every station one door that faces into it, with its pad on open floor 1.1 u in front", () => {
    expect(l1.doors!.map((d) => d.room)).toEqual(HIGHLIGHT_STATIONS.map(highlightRoom));
    const grid = buildNavGrid(l1, ROVER.radius);
    for (const s of HALL_LAYOUT.stations) {
      const door = l1.doors!.find((d) => d.room === s.room)!;
      expect(door.at).toEqual(s.pad);
      expect(door.facing).toEqual(s.facing);
      expect(isWalkable(grid, s.pad), s.room).toBe(true);
      expect(Math.hypot(s.pad.x - s.front.x, s.pad.z - s.front.z)).toBeCloseTo(HALL.padInset);
    }
    expect(stationOf("experience").pad.x).toBeCloseTo(59.9);
    expect(stationOf("experience").pad.z).toBe(1);
  });

  it("follows the hall road only for drives into or out of the hall", () => {
    const about = stationOf("about").pad;
    expect(routeUsesRoad(l1, l1.spawn, about)).toBe(true);
    expect(routeUsesRoad(l1, about, l1.approach)).toBe(true);
    expect(routeUsesRoad(l1, l1.spawn, { x: 6, z: -15 })).toBe(false);
    const route = roadRoute(l1.road!, buildNavGrid(l1, ROVER.radius), l1.spawn, about, buildRoadGraph(l1.road!))!;
    expect(route.at(-1)).toEqual(about);
    expect(route.some((p) => p.z >= 14 && p.x > LOBBY.certWall.x)).toBe(true);
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
    expect(zoneAt("L1", { x: 32, z: 15 }, l1.viewZones)?.id).toBe("L1:highlights-entry");
    expect(zoneAt("L1", LOBBY.spawn, l1.viewZones)).toBeNull();
  });

  it("loads the screenshots only once the rover heads for the hall", () => {
    expect(shouldLoadShots("L1", LOBBY.spawn.x)).toBe(false);
    expect(shouldLoadShots("L1", HALL.lazyX + 1)).toBe(true);
    expect(shouldLoadShots("L3", 40)).toBe(false);
  });
});
