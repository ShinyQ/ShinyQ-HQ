import { describe, expect, it } from "vitest";
import { buildFloorLayouts, LOBBY, ROVER } from "@/experience/config";
import { zoneAt, zoneView } from "@/experience/camera/orbit";
import { followPose } from "@/experience/camera/rigs";
import { SHAFT_EAST_FACE } from "@/experience/config";
import { kioskBounds, kioskFacing } from "@/experience/floors/lobby/kiosk";
import { globeInstances, OBSERVATORY, observatoryPanelYaw, observatoryParts, observatoryText, type ObservatoryLabels } from "@/experience/floors/lobby/observatory";
import { OLD_VISITS_ROOM, VISITS_ROOM, visitsRoomFromHash } from "@/experience/floors/lobby/visitsRoom";
import { canonicalRoom } from "@/experience/missions/roomAliases";
import { buildNavGrid, findPath, isWalkable } from "@/experience/nav/navgrid";
import { rectGap } from "@/experience/nav/space";
import { STATS_FIXTURE } from "@/lib/visits/contract";
import { landCells } from "@/lib/visits/geo";
import { visitsView } from "@/lib/visits/model";

const o = LOBBY.observatory;
const l1 = buildFloorLayouts(8).L1;
const labels: ObservatoryLabels = {
  title: "Visitor Observatory",
  offline: "Stats offline",
  approx: (n) => `about ${n}`,
  visits30: "visits, last 30 days",
  visitsAll: "since launch",
  countries: "countries",
  questions: "questions asked",
  topFloor: (f) => `most explored: ${f}`,
  split: (a, b) => `3D ${a}% · Classic ${b}%`,
  source: "Cloudflare Web Analytics, sampled estimates",
  updated: "Updated daily",
  delayed: (d) => `Delayed: last updated ${d}`,
  floors: { L1: "Home", L2: "Journey", L3: "Work", L4: "Writing", RF: "About" },
};
const inside = (x: number, z: number) => x >= o.minX && x <= o.maxX && z >= o.minZ && z <= o.maxZ;
const door = l1.doors!.find((d) => d.room === VISITS_ROOM)!;

describe("Visitor Observatory parts", () => {
  it("keeps the globe, the panel and the solids on the station footprint, under the camera column", () => {
    const p = observatoryParts();
    expect(inside(p.globe.x, p.globe.z)).toBe(true);
    expect(p.globe.y + p.globe.r).toBeLessThanOrEqual(o.h);
    expect(p.globe.x - p.globe.r).toBeGreaterThanOrEqual(o.minX);
    expect(p.globe.x + p.globe.r).toBeLessThanOrEqual(o.maxX);
    expect(p.globe.z + p.globe.r).toBeLessThanOrEqual(o.maxZ);
    for (const b of p.solids) expect(inside(b.x, b.z)).toBe(true);
    // The panel stays inside the footprint at its turn and below the camera column.
    const half = p.panel.w / 2;
    for (const s of [-1, 1]) expect(inside(p.panel.x + s * half * Math.cos(p.panel.yaw), p.panel.z - s * half * Math.sin(p.panel.yaw))).toBe(true);
    expect(p.panel.bottom + p.panel.h).toBeLessThanOrEqual(o.h);
    expect(l1.tall).toContainEqual(o);
  });

  it("turns the panel to the spawn view (back along the kiosk axis) and to the elevator arrival (north)", () => {
    const yaw = observatoryPanelYaw();
    const n = { x: Math.sin(yaw), z: Math.cos(yaw) };
    const f = kioskFacing();
    expect(n.x * f.x + n.z * f.z).toBeGreaterThan(0.8);
    expect(-n.z).toBeGreaterThan(0.8);
  });

  it("places one land dot per land cell (half on lite) and one dot per known country", () => {
    const full = globeInstances(OBSERVATORY.globeRadius, "full", ["ID", "US", "ZZ"]);
    expect(full.land.count).toBe(landCells().length);
    expect(globeInstances(OBSERVATORY.globeRadius, "lite", []).land.count).toBe(landCells(2).length);
    expect(full.countries.count).toBe(2);
    // Every land dot sits on the sphere (instance matrix translation).
    const m = full.land.matrices;
    for (let i = 0; i < full.land.count; i += 97) expect(Math.hypot(m[i * 16 + 12], m[i * 16 + 13], m[i * 16 + 14])).toBeCloseTo(OBSERVATORY.globeRadius * 1.005, 2);
    // Two triangles per dot: well under the RF triangle budget.
    expect((full.land.count + full.countries.count) * 2).toBeLessThan(3000);
  });

  it("writes the numbers with the window, the source and the cadence", () => {
    const rows = observatoryText(observatoryParts(), { view: visitsView(STATS_FIXTURE, "d30", "all"), allVisits: STATS_FIXTURE.visits.all, freshness: "fresh", lastDay: "13 Oct 2026" }, labels, "en");
    const text = rows.map((r) => r.text);
    expect(text).toEqual([
      "VISITOR OBSERVATORY",
      "about 340",
      "visits, last 30 days",
      "about 520 since launch",
      "9 countries · 64 questions asked",
      "most explored: Work",
      "3D 68% · Classic 32%",
      "Cloudflare Web Analytics, sampled estimates",
      "Updated daily",
    ]);
    expect(rows.every((r) => r.yaw === observatoryParts().panel.yaw)).toBe(true);
  });

  it("notes a delayed snapshot and shows the offline state without data", () => {
    const parts = observatoryParts();
    const delayed = observatoryText(parts, { view: visitsView(STATS_FIXTURE, "d30", "all"), allVisits: STATS_FIXTURE.visits.all, freshness: "delayed", lastDay: "13 Oct 2026" }, labels, "en");
    expect(delayed.at(-1)?.text).toBe("Delayed: last updated 13 Oct 2026");
    expect(delayed.at(-2)?.text).toBe(labels.source);
    const offline = observatoryText(parts, null, labels, "en").map((r) => r.text);
    expect(offline).toEqual(["VISITOR OBSERVATORY", "Stats offline", "", "", "", "", "", "", ""]);
  });
});

describe("Visitor Observatory in the Lobby (owner decision 2026-10-14)", () => {
  it("stands in the south-west corner, flush with the slab edges, between the elevator and the kiosk", () => {
    expect(o.minX).toBe(LOBBY.bounds.minX);
    expect(o.maxZ).toBe(LOBBY.bounds.maxZ);
    expect(l1.obstacles).toContainEqual({ minX: o.minX, maxX: o.maxX, minZ: o.minZ, maxZ: o.maxZ });
    // Clear of the elevator call pad and its lane (z = 0), and of the kiosk (the rover passes).
    const pad = l1.pads!.find((p) => p.kind === "elevator")!;
    expect(o.minZ - pad.at.z).toBeGreaterThanOrEqual(10);
    expect(rectGap(o, kioskBounds())).toBeGreaterThanOrEqual(6);
    // Clear of the lane ring by the same walkway as the walls.
    const near = Math.hypot(Math.max(o.minX - LOBBY.hologram.x, 0, LOBBY.hologram.x - o.maxX), Math.max(o.minZ - LOBBY.hologram.z, 0, LOBBY.hologram.z - o.maxZ));
    expect(near - (LOBBY.laneRadius + ROVER.radius + 0.5)).toBeGreaterThanOrEqual(4);
  });

  it("has one door pad on open floor, facing into the station, reachable from the elevator", () => {
    expect(door.facing).toEqual({ x: 0, z: 1 });
    expect(door.at.z).toBeCloseTo(o.minZ - 1.1);
    expect(door.at.x).toBeCloseTo((o.minX + o.maxX) / 2);
    const grid = buildNavGrid(l1, ROVER.radius);
    expect(isWalkable(grid, door.at)).toBe(true);
    expect(findPath(grid, l1.approach, door.at)?.length).toBeGreaterThan(0);
    expect(findPath(grid, l1.spawn, door.at)?.length).toBeGreaterThan(0);
  });

  it("turns the camera at the door, the spawn and the elevator arrival, and nowhere else it did before", () => {
    const zones = l1.viewZones ?? [];
    expect(zoneAt("L1", door.at, zones)?.id).toBe("L1:visits");
    expect(zoneAt("L1", l1.spawn, zones)?.id).toBe("L1:kiosk");
    expect(zoneAt("L1", l1.approach, zones)?.id).toBe("L1:arrival");
    // The hologram plaza, the skills wall and the certification wall keep their own views.
    expect(zoneAt("L1", { x: LOBBY.hologram.x + 10, z: LOBBY.hologram.z }, zones)).toBeNull();
    expect(zoneAt("L1", { x: LOBBY.skillsWall.x, z: LOBBY.skillsWall.z + 2.6 }, zones)?.id).toBe("L1:skills");
  });
});

describe("Lobby views around the observatory", () => {
  const zones = l1.viewZones ?? [];
  const oc = { x: (o.minX + o.maxX) / 2, z: (o.minZ + o.maxZ) / 2 };
  /** Horizontal angle (radians) between the camera's view and the direction from the camera to `p`. */
  const offAxis = (cls: "desktop" | "mobile", at: { x: number; z: number }, p: { x: number; z: number }) => {
    const zone = zoneAt("L1", at, zones)!;
    const { yaw, zoom } = zoneView(zone, cls);
    const pose = followPose(cls, [at.x, 1, at.z], yaw, zoom ?? 1);
    const [cx, , cz] = pose.position;
    const look = Math.atan2(at.z - cz, at.x - cx);
    const to = Math.atan2(p.z - cz, p.x - cx);
    return { angle: Math.abs(Math.atan2(Math.sin(to - look), Math.cos(to - look))), camera: { x: cx, z: cz } };
  };

  it("frames the observatory ahead right after the elevator, from east of the glass shaft", () => {
    for (const cls of ["desktop", "mobile"] as const) {
      const { angle, camera } = offAxis(cls, l1.approach, oc);
      expect(angle, cls).toBeLessThan(0.1);
      expect(camera.x, cls).toBeGreaterThan(SHAFT_EAST_FACE);
    }
    // The kiosk stands in the wide frame too (desktop half angle about 30 degrees).
    expect(offAxis("desktop", l1.approach, LOBBY.kiosk).angle).toBeLessThan(0.45);
  });

  it("starts the session on a view of the rover at the kiosk with the observatory behind it", () => {
    for (const cls of ["desktop", "mobile"] as const) {
      expect(offAxis(cls, l1.spawn, LOBBY.kiosk).angle, cls).toBeLessThan(cls === "mobile" ? 0.05 : 0.45);
      expect(offAxis(cls, l1.spawn, oc).angle, cls).toBeLessThan(cls === "mobile" ? 0.05 : 0.45);
    }
  });
});

describe("L1:visits room ids and deep links", () => {
  it("maps the old roof id to the Lobby room", () => {
    expect(OLD_VISITS_ROOM).toBe("RF:visits");
    expect(canonicalRoom("RF:visits")).toBe("L1:visits");
    expect(canonicalRoom("L1:visits")).toBe("L1:visits");
    expect(canonicalRoom("RF:contact")).toBe("RF:contact");
    expect(canonicalRoom(null)).toBeNull();
  });

  it("opens the observatory from #visits on the old roof route and on the Lobby route only", () => {
    expect(visitsRoomFromHash("RF", "#visits")).toBe("L1:visits");
    expect(visitsRoomFromHash(undefined, "#Visits")).toBe("L1:visits");
    expect(visitsRoomFromHash("L3", "#visits")).toBeNull();
    expect(visitsRoomFromHash("RF", "#cv")).toBeNull();
  });
});
