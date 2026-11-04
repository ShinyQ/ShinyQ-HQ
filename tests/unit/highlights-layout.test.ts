import { describe, expect, it } from "vitest";
import { zoneAt } from "@/experience/camera/orbit";
import { followPose } from "@/experience/camera/rigs";
import { buildFloorLayouts, LOBBY, ROVER } from "@/experience/config";
import * as hall from "@/experience/floors/lobby/hallLayout";
import { gatePillars, HALL, HALL_LAYOUT, hallPartitions, shouldLoadShots, stationOf } from "@/experience/floors/lobby/hallLayout";
import { HIGHLIGHT_STATIONS, highlightRoom } from "@/experience/floors/lobby/stations";
import { roomTarget } from "@/experience/missions/host3d";
import { buildNavGrid, isWalkable } from "@/experience/nav/navgrid";
import { buildRoadGraph, routeUsesRoad } from "@/experience/nav/road";
import { roadRoute } from "@/experience/nav/roadRoute";
import { spaceViolations } from "@/experience/nav/space";
import type { Rect } from "@/experience/types";

const rectGap = (a: Rect, b: Rect) => Math.max(0, a.minX - b.maxX, b.minX - a.maxX, a.minZ - b.maxZ, b.minZ - a.maxZ);
const LOBBY_CERT: Rect = { minX: LOBBY.certWall.x - LOBBY.certWall.w / 2, maxX: LOBBY.certWall.x + LOBBY.certWall.w / 2, minZ: LOBBY.certWall.z - LOBBY.certWall.d / 2, maxZ: LOBBY.certWall.z + LOBBY.certWall.d / 2 };

const layouts = buildFloorLayouts(8);
const l1 = layouts.L1;

describe("Highlights Hall layout", () => {
  it("extends the Lobby slab east and keeps the spawn and the elevator where they belong", () => {
    // More room (owner 2026-10-19): the slab is 54 u deep and the hall starts 5 u further east.
    expect(LOBBY.bounds).toEqual({ minX: -24, maxX: 69, minZ: -27, maxZ: 27 });
    // One rectangle (owner 2026-11-02): the floor's slab runs down to the office wing's south edge, and so does the hall.
    expect(l1.bounds).toEqual(LOBBY.slab);
    expect(l1.bounds).toEqual({ ...LOBBY.bounds, maxZ: 59 });
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
    // Every station stands east of the wall, or (the south stations, since the hall runs the slab's depth) south of the
    // Lobby's south edge line, out of the wall's sight line from the Lobby plaza.
    for (const s of HALL_LAYOUT.stations) expect(s.rect.minX > cert.maxX + 5 || s.rect.minZ >= LOBBY.bounds.maxZ, s.room).toBe(true);
  });

  it("runs the hall the slab's full depth: seven stations on the slab edges, one plaza between them, the spine down its axis", () => {
    expect(HALL.zone).toEqual({ minX: LOBBY.bounds.maxX - 37, maxX: LOBBY.bounds.maxX, minZ: LOBBY.slab.minZ, maxZ: LOBBY.slab.maxZ });
    expect(HALL_LAYOUT.stations.map((s) => s.station)).toEqual([...HIGHLIGHT_STATIONS]);
    // Every station touches a slab edge (north, east or south).
    for (const s of HALL_LAYOUT.stations) expect([s.rect.minZ === LOBBY.slab.minZ, s.rect.maxX === LOBBY.slab.maxX, s.rect.maxZ === LOBBY.slab.maxZ].some(Boolean), s.room).toBe(true);
    // The spine and the approach roads route only.
    const spine = HALL_LAYOUT.network.roads.find((r) => r.id === "hall-spine")!;
    expect(spine.points.every((p) => p.x === HALL.plaza.x)).toBe(true);
    // B4 (owner decision 2026-11-04): only the lead road from the Lobby to the gateway arch is drawn; no plaza fill or stubs.
    expect(HALL_LAYOUT.drawn.roads.map((r) => r.id)).toEqual(["hall-lead"]);
    expect(HALL_LAYOUT.drawn.roads[0].points.at(-1)!.x).toBe(HALL.gate.x);
    expect(HALL_LAYOUT.drawn.plazas).toEqual([]);
    expect(HALL_LAYOUT.drawn.spurs).toEqual([]);
    // A drive between two stations follows the spine: no detour through the plaza's centre.
    const graph = buildRoadGraph(l1.road!);
    const grid = buildNavGrid(l1, ROVER.radius);
    const wins = stationOf("wins").pad;
    const now = stationOf("now").pad;
    const route = roadRoute(l1.road!, grid, wins, now, graph)!;
    expect(route.at(-1)).toEqual(now);
    expect(Math.min(...route.map((p) => p.z))).toBeGreaterThanOrEqual(wins.z - 1e-9);
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

  describe("one gate (owner decision 2026-11-04)", () => {
    it("has no road from the Agent Office", () => {
      expect("hallOfficeRoad" in hall).toBe(false);
      expect("hallOfficeRoadDrawn" in hall).toBe(false);
      expect("officeRoad" in HALL).toBe(false);
      expect(l1.road!.roads.some((r) => r.id === "hall-office")).toBe(false);
    });

    it("closes the west side except the gateway opening, touching its neighbours (no gap under 6 u)", () => {
      const parts = hallPartitions();
      expect(parts).toHaveLength(4);
      const [north, ret, south, wing] = parts;
      const [pn, ps] = gatePillars();
      const touches = (a: Rect, b: Rect) => rectGap(a, b) === 0;
      // North run: from the north slab edge to the north pillar, touching it; the wing wall joins it to the about station.
      expect(north.minZ).toBe(HALL.zone.minZ);
      expect(touches(north, pn)).toBe(true);
      expect(touches(north, wing)).toBe(true);
      expect(touches(wing, stationOf("about").rect)).toBe(true);
      expect(wing.minZ).toBe(HALL.zone.minZ);
      // South return and run: from the south pillar to the hall's west edge, down to the contact station.
      expect(touches(ret, ps)).toBe(true);
      expect(touches(ret, south)).toBe(true);
      expect(south.maxZ).toBe(HALL.zone.maxZ);
      expect(touches(south, stationOf("contact").rect)).toBe(true);
      // The opening between the pillars carries the whole lead road.
      const lead = HALL.lead[0].z;
      expect(north.maxZ).toBeLessThanOrEqual(lead - 4);
      expect(ret.minZ).toBeGreaterThanOrEqual(lead + 4);
      expect(rectGap(north, LOBBY_CERT)).toBeGreaterThanOrEqual(6);
      for (const p of parts) {
        expect(HALL_LAYOUT.obstacles).toContainEqual(p);
        expect(l1.obstacles).toContainEqual(p);
      }
    });

    it("keeps the partitions low: under the certification wall, never a camera column", () => {
      expect(HALL.partition.height).toBeLessThan(LOBBY.certWall.h);
      for (const p of hallPartitions()) expect(l1.tall!.some((t) => t.minX === p.minX && t.maxX === p.maxX && t.minZ === p.minZ)).toBe(false);
    });
  });
});
