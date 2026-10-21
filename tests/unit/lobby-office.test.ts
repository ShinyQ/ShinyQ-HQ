import { describe, expect, it } from "vitest";
import { RoomIdSchema } from "@/content/schema";
import { yawLooking } from "@/experience/camera/look";
import { zoneAt, zoneView } from "@/experience/camera/orbit";
import { buildFloorLayouts, kioskRect, LOBBY, ROVER, ROVER_HEIGHT } from "@/experience/config";
import { signPlate } from "@/experience/fx/signLayout";
import { HALL } from "@/experience/floors/lobby/hallLayout";
import {
  isOfficeRoom,
  OFFICE,
  OFFICE_ROOMS,
  OFFICE_SEAT_COUNT,
  OFFICE_WING,
  officeDeskRoom,
  officeDock,
  officeDockPad,
  officeObstacles,
  officeRiser,
  officeRoad,
  officeSlots,
  officeStops,
  officeTall,
  officeTower,
  officeTowerColumn,
  officeTowerTall,
  officeTowerYaw,
  officeWallRect,
  turnedHalf,
  officeWing,
  officeZone,
  rowSlots,
  type OfficeSlot,
  type OfficeWing,
} from "@/experience/floors/lobby/officeLayout";
import { CREW } from "@/experience/floors/lobby/office/crew";
import { OFFICE_ROVER } from "@/experience/floors/lobby/office/officeVisual";
import { OFFICE_SLOTS, officeBounds, officeShellBoxes, officeSign, wingBounds } from "@/experience/floors/lobby/officeShell";
import { buildNavGrid, componentsOf, findPath, isWalkable, nearestWalkable } from "@/experience/nav/navgrid";
import { buildRoadGraph, routeUsesRoad } from "@/experience/nav/road";
import { roadRoute } from "@/experience/nav/roadRoute";
import { inSlab, slabRects } from "@/experience/nav/slab";
import { gapFilled, rectGap, SPACE_RULES, spaceViolations, wideGrid } from "@/experience/nav/space";
import type { Rect, Vec2 } from "@/experience/types";
import { OFFICE_SEATS } from "@/lib/office/protocol";

const l1 = buildFloorLayouts(8).L1;
const W = LOBBY.officeWing;
const S = LOBBY.bounds.maxZ;
const slots = officeSlots(W);
const inside = (r: Rect, b: Rect) => r.minX >= b.minX - 1e-9 && r.maxX <= b.maxX + 1e-9 && r.minZ >= b.minZ - 1e-9 && r.maxZ <= b.maxZ + 1e-9;
const leadRect = (w: OfficeWing): Rect => ({ minX: w.lead.x - w.lead.width / 2, maxX: w.lead.x + w.lead.width / 2, minZ: w.lead.from, maxZ: w.lead.to });
type Floor = Parameters<typeof buildNavGrid>[0];
/** Whether a rover drive (the rover-radius navgrid) gets from `from` (its nearest walkable cell) to `to`. */
const reachable = (layout: Floor, from: Vec2, to: Vec2) => {
  const grid = buildNavGrid(layout, ROVER.radius);
  const start = nearestWalkable(grid, from);
  const end = start && findPath(grid, start, to)?.at(-1);
  return Boolean(end && end.x === to.x && end.z === to.z);
};
/** Walkable navgrid cells in the wing a rover cannot reach from the spawn: pockets behind or between the office boxes. */
const pocketCells = (layout: Floor, spawn: Vec2 = LOBBY.spawn, area: Rect = W.rect) => {
  const grid = buildNavGrid(layout, ROVER.radius);
  const labels = componentsOf(grid);
  const s = nearestWalkable(grid, spawn)!;
  const at = (x: number, z: number) => Math.floor((z - grid.minZ) / grid.cell) * grid.cols + Math.floor((x - grid.minX) / grid.cell);
  const home = labels[at(s.x, s.z)];
  const out: Vec2[] = [];
  for (let k = 0; k < labels.length; k++) {
    if (labels[k] === -1 || labels[k] === home) continue;
    const p = { x: grid.minX + ((k % grid.cols) + 0.5) * grid.cell, z: grid.minZ + (Math.floor(k / grid.cols) + 0.5) * grid.cell };
    if (p.x >= area.minX && p.x <= area.maxX && p.z >= area.minZ && p.z <= area.maxZ) out.push(p);
  }
  return out;
};
const sameRect = (a: Rect, b: Rect) => a.minX === b.minX && a.maxX === b.maxX && a.minZ === b.minZ && a.maxZ === b.maxZ;

describe("Agent Office wing (owner decision 2026-10-20)", () => {
  it("is one named wing derived from the Lobby's south edge: the L1 slab gains it, the main rect stays", () => {
    expect(W).toEqual(officeWing(S));
    expect(W.rect).toEqual({ minX: -12, maxX: 18, minZ: S, maxZ: S + 32 });
    expect(l1.bounds).toEqual(LOBBY.bounds);
    expect(l1.wings).toEqual([W.rect]);
    expect(W.stop).toEqual({ x: 3, z: S + 16.5 });
    expect(W.plaza.center).toEqual({ x: 3, z: S + 9.5 });
    expect(W.leadSpan).toEqual({ ...leadRect(W), maxZ: S });
    expect(Math.min(W.plaza.w, W.plaza.d)).toBeGreaterThanOrEqual(SPACE_RULES.plaza);
    // The wing touches the Lobby along part of its south edge, never at a corner, and keeps 6 u from the observatory.
    expect(W.rect.minX).toBeGreaterThan(LOBBY.bounds.minX);
    expect(W.rect.maxX).toBeLessThan(LOBBY.bounds.maxX);
    expect(W.rect.minX).toBeGreaterThanOrEqual(-12);
    expect(W.rect.minX - LOBBY.observatory.maxX).toBeGreaterThanOrEqual(SPACE_RULES.clear);
  });

  it("moves with the Lobby edge: built for S = 27 every z shifts by +6 and every x stays", () => {
    const a = officeWing(21);
    const b = officeWing(27);
    const shift = (r: Rect): Rect => ({ ...r, minZ: r.minZ + 6, maxZ: r.maxZ + 6 });
    const at = (p: Vec2): Vec2 => ({ x: p.x, z: p.z + 6 });
    expect(b.rect).toEqual(shift(a.rect));
    expect(b.leadSpan).toEqual(shift(a.leadSpan));
    expect(b.lead).toEqual({ ...a.lead, from: a.lead.from + 6, to: a.lead.to + 6 });
    expect(b.plaza).toEqual({ ...a.plaza, center: at(a.plaza.center) });
    expect(b.stop).toEqual(at(a.stop));
    expect(b.arc).toEqual(at(a.arc));
    expect(b.wall).toEqual(at(a.wall));
    expect(officeObstacles(b)).toEqual(officeObstacles(a).map(shift));
    expect(officeTall(b)).toEqual({ ...shift(officeTall(a)), h: officeTall(a).h });
    expect(officeTowerTall(b)).toEqual({ ...shift(officeTowerTall(a)), h: officeTowerTall(a).h });
    expect(officeTowerColumn(b)).toEqual(at(officeTowerColumn(a)));
    expect(officeDockPad(b)).toEqual(at(officeDockPad(a)));
    for (const [i, s] of officeSlots(b).entries()) {
      const o = officeSlots(a)[i];
      expect(s.desk.x).toBeCloseTo(o.desk.x, 9);
      expect(s.desk.z).toBeCloseTo(o.desk.z + 6, 9);
      expect(s.yaw).toBe(o.yaw);
    }
    expect(Object.values(officeStops(b))).toEqual(Object.values(officeStops(a)).map((p) => at(p!)));
    expect(officeZone(b).area).toEqual(shift(officeZone(a).area));
    const [ra, rb] = [officeRoad(a), officeRoad(b)];
    expect(rb.road.points).toEqual(ra.road.points.map(at));
    expect(rb.plaza.center).toEqual(at(ra.plaza.center));
  });

  it("leads in from the Lobby plaza: 8 u wide inside x -3 to 9, south of the lane ring, off the hall road zone, clear of the kiosk", () => {
    const { road, plaza } = officeRoad(W);
    expect(road.width).toBeGreaterThanOrEqual(SPACE_RULES.roadWidth);
    const r = leadRect(W);
    expect(r.minX).toBeGreaterThanOrEqual(-3);
    expect(r.maxX).toBeLessThanOrEqual(9);
    expect(rectGap(r, HALL.zone)).toBeGreaterThan(0);
    // It starts on the Lobby floor south of the lane ring (its whole width) and ends inside the wing plaza.
    const h = LOBBY.hologram;
    for (const x of [r.minX, r.maxX]) expect(Math.hypot(x - h.x, W.lead.from - h.z)).toBeGreaterThan(LOBBY.laneRadius);
    expect(W.lead.from).toBeLessThan(S);
    expect(W.lead.to).toBeGreaterThan(plaza.center.z - plaza.d / 2);
    expect(W.lead.to).toBeLessThan(plaza.center.z);
    expect(rectGap(r, kioskRect())).toBeGreaterThanOrEqual(SPACE_RULES.clear);
    // The road network carries it, and the road zone covers the wing and the lead's span in the Lobby.
    expect(l1.road!.roads).toContainEqual(road);
    expect(l1.road!.plazas).toContainEqual(plaza);
    expect(l1.roadZone).toEqual([HALL.zone, W.rect, W.leadSpan]);
    // The intro reveal rect: the wing reaching north over the lead road (narrower than the wing).
    expect(r.minX).toBeGreaterThanOrEqual(W.rect.minX);
    expect(r.maxX).toBeLessThanOrEqual(W.rect.maxX);
    expect(wingBounds()).toEqual({ minX: W.rect.minX, maxX: W.rect.maxX, minZ: W.lead.from, maxZ: W.rect.maxZ });
  });

  it("floats the wing sign (upper case) over the wing plaza's centre, on the stop's axis, above the rover", () => {
    const sign = officeSign("Agent Office", "#34d399");
    expect(sign).toMatchObject({ text: "AGENT OFFICE", x: W.lead.x, z: W.plaza.center.z });
    expect(sign.z).toBeGreaterThan(W.rect.minZ);
    expect(sign.z).toBeLessThan(W.stop.z);
    expect(sign.tilt ?? 0).toBe(0);
    // The plate's bottom edge clears the rover driving under it.
    expect(sign.y - signPlate(sign).h / 2).toBeGreaterThan(ROVER_HEIGHT + 0.5);
  });

  it("meets the space rules: the boxes touch each other and the wall or keep 6 u (or a box between fills the gap), the row and the wall 6 u from the wing's side edges", () => {
    const office = officeObstacles(W);
    expect(office).toHaveLength(6);
    for (const o of office) expect(l1.obstacles).toContainEqual(o);
    for (let i = 0; i < office.length; i++)
      for (let j = i + 1; j < office.length; j++) {
        const gap = rectGap(office[i], office[j]);
        expect(gap === 0 || gap >= SPACE_RULES.clear || gapFilled(office[i], office[j], office), `${i} ${j}: ${gap}`).toBe(true);
      }
    // Flush with the wing's south edge, inside the wing; the row and the wall 6 u from its side edges (the CI tower and
    // the ship dock fill the corners between them, touching the side edges).
    for (const o of office) {
      expect(o.maxZ).toBe(W.rect.maxZ);
      expect(inside(o, W.rect)).toBe(true);
    }
    for (const o of office.slice(0, 4)) {
      expect(o.minX - W.rect.minX).toBeGreaterThanOrEqual(SPACE_RULES.clear);
      expect(W.rect.maxX - o.maxX).toBeGreaterThanOrEqual(SPACE_RULES.clear);
    }
    // The wing stays inside x -12 to 24, and nothing of it stands near its NE corner, where the re-spacing branch's
    // hall lead road runs 2 u north of S (x 14 to 18).
    expect(W.rect.minX).toBeGreaterThanOrEqual(-12);
    expect(W.rect.maxX).toBeLessThanOrEqual(24);
    for (const o of office) expect(rectGap(o, { minX: 18, maxX: 24, minZ: S, maxZ: S })).toBeGreaterThanOrEqual(SPACE_RULES.clear);
    // Every office obstacle against every other L1 obstacle and the slab's outer edges: no violation.
    const violations = spaceViolations({ bounds: l1.bounds, wings: l1.wings, obstacles: l1.obstacles, doors: [], network: l1.road!, start: l1.approach });
    const officeLabels = office.map((o) => `${o.minX.toFixed(2)}..${o.maxX.toFixed(2)} x ${o.minZ.toFixed(2)}`);
    expect(violations.filter((v) => officeLabels.some((l) => v.detail.includes(l))).map((v) => v.detail)).toEqual([]);
    expect(violations.filter((v) => v.rule === "road-blocked")).toEqual([]);
  });

  it("puts ten desks on two arcs around one centre on the stop's axis, east to west in each row (desks 1 and 6 leftmost from the office stop), equally spaced, each facing the arc centre", () => {
    expect(slots.map((s) => s.slot)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(slots.length).toBe(OFFICE_SEATS);
    expect(OFFICE_SEAT_COUNT).toBe(OFFICE_SEATS);
    expect(slots.map((s) => s.row)).toEqual([0, 0, 0, 0, 0, 1, 1, 1, 1, 1]);
    expect(W.arc.x).toBe(W.stop.x);
    for (const [r, row] of OFFICE.rows.entries()) {
      const own = rowSlots(slots, r);
      expect(own).toHaveLength(5);
      expect(own[2].desk.x).toBeCloseTo(W.stop.x);
      const gaps = own.slice(1).map((s, i) => Math.hypot(s.desk.x - own[i].desk.x, s.desk.z - own[i].desk.z));
      for (const gap of gaps) expect(gap).toBeCloseTo(gaps[0], 6);
      for (const s of own) {
        expect(s.lift).toBe(row.lift);
        expect(Math.hypot(s.desk.x - W.arc.x, s.desk.z - W.arc.z)).toBeCloseTo(row.deskRadius);
        expect(Math.hypot(s.rover.x - W.arc.x, s.rover.z - W.arc.z)).toBeCloseTo(row.roverRadius);
        const dx = W.arc.x - s.desk.x;
        const dz = W.arc.z - s.desk.z;
        // Forward is (sin yaw, cos yaw), like the rover and `Box.yaw`.
        expect((Math.sin(s.yaw) * dx + Math.cos(s.yaw) * dz) / Math.hypot(dx, dz)).toBeCloseTo(1);
      }
      // The stop camera looks toward +z, so +x is on the left of the screen: each row's first desk is its east end.
      for (let i = 1; i < own.length; i++) expect(own[i].desk.x).toBeLessThan(own[i - 1].desk.x);
    }
    expect(OFFICE_SLOTS).toEqual(slots);
  });

  it("keeps the front row in place (slots 0 to 4: radius 11 and 12.2, 40 to -40 degrees, on the floor) and raises the back row on a riser behind it", () => {
    const [front, back] = OFFICE.rows;
    expect(front).toEqual({ deskRadius: 11, roverRadius: 12.2, deskW: 4.05, angles: [40, 20, 0, -20, -40], lift: 0 });
    expect(W.arc).toEqual({ x: 3, z: S + 11 });
    for (const s of rowSlots(slots, 0)) {
      const theta = (front.angles[s.slot] * Math.PI) / 180;
      expect(s.desk.x).toBeCloseTo(3 + 11 * Math.sin(theta), 9);
      expect(s.desk.z).toBeCloseTo(S + 11 + 11 * Math.cos(theta), 9);
      expect(s.rover.z).toBeCloseTo(S + 11 + 12.2 * Math.cos(theta), 9);
      expect(s.lift).toBe(0);
    }
    // The back row: farther out, on the riser, its desks starting where a docked front Rover's footprint ends.
    expect(back.lift).toBeGreaterThan(0);
    expect(back.deskRadius - OFFICE.desk.d / 2).toBeGreaterThanOrEqual(front.roverRadius + OFFICE.rover.radius + CREW.dock.back - 1e-9);
    expect(back.roverRadius - back.deskRadius).toBeCloseTo(front.roverRadius - front.deskRadius);
    for (const s of rowSlots(slots, 1)) {
      const riser = officeRiser(W, back, s.theta)!;
      expect(riser.yaw).toBe(s.yaw);
      expect(riser.w).toBeGreaterThanOrEqual(back.deskW);
      // Neighbouring blocks meet at their back edge (and overlap in front of it): no floor shows between them.
      const step = ((back.angles[0] - back.angles[1]) * Math.PI) / 180;
      expect(riser.w).toBeGreaterThanOrEqual(2 * (back.roverRadius + OFFICE.rover.radius) * Math.tan(step / 2));
      // From in front of the desk to past the Rover's treads docked (the riser carries the whole Rover).
      const r = Math.hypot(riser.center.x - W.arc.x, riser.center.z - W.arc.z);
      expect(r - riser.d / 2).toBeLessThan(back.deskRadius - OFFICE.desk.d / 2);
      expect(r + riser.d / 2).toBeGreaterThanOrEqual(back.roverRadius + OFFICE_ROVER.treads[0][5] / 2 + CREW.dock.back);
      // The riser's front edge stays behind a docked front Rover's treads.
      expect(r - riser.d / 2).toBeGreaterThan(front.roverRadius + OFFICE_ROVER.treads[0][5] / 2 + CREW.dock.back);
    }
    expect(officeRiser(W, front, 0)).toBeNull();
  });

  it("stands the screen wall flush with the wing's south edge, facing north, centred on the arc, 4.5 u behind the back row's middle Rover's back (7.5 u behind the front row's)", () => {
    const wall = officeWallRect(W);
    expect((wall.minX + wall.maxX) / 2).toBeCloseTo(W.arc.x);
    expect(wall.maxX - wall.minX).toBeCloseTo(OFFICE.wall.w + 2 * OFFICE.wall.frame);
    expect(wall.maxZ).toBe(W.rect.maxZ);
    expect(W.rect.maxZ).toBe(S + OFFICE_WING.depth);
    expect(wall.minZ).toBeCloseTo(W.wall.z - OFFICE.wall.t / 2);
    // The space between the console and the wall (owner request 2026-10-20), kept behind the back row (owner decision 2026-10-21).
    expect(wall.minZ - (slots[7].rover.z + OFFICE.rover.radius)).toBeCloseTo(4.5, 9);
    expect(wall.minZ - (slots[2].rover.z + OFFICE.rover.radius)).toBeCloseTo(7.5, 9);
    expect(W.wall.z).toBeCloseTo(W.rect.maxZ - 0.15, 9);
    expect(l1.tall).toContainEqual(officeTall(W));
    expect(officeTall(W).h).toBeCloseTo(OFFICE.wall.bottom + OFFICE.wall.h + OFFICE.wall.frame);
  });

  it("keeps the office in the wing, its stop on the wing plaza in front of the desks", () => {
    const b = officeBounds();
    expect(inside(b, W.rect)).toBe(true);
    const p = W.plaza;
    expect(Math.abs(W.stop.x - p.center.x)).toBeLessThanOrEqual(p.w / 2);
    expect(Math.abs(W.stop.z - p.center.z)).toBeLessThanOrEqual(p.d / 2);
    // The plaza stays clear of the desk row.
    expect(rectGap({ minX: p.center.x - p.w / 2, maxX: p.center.x + p.w / 2, minZ: p.center.z - p.d / 2, maxZ: p.center.z + p.d / 2 }, b)).toBeGreaterThan(0);
    for (const s of slots) expect(s.desk.z).toBeGreaterThan(W.stop.z + 2);
  });

  it("keeps the stop on 6 u wide floor, reachable from the spawn and the elevator through it", () => {
    const wide = wideGrid(l1);
    expect(isWalkable(wide, W.stop)).toBe(true);
    for (const from of [l1.spawn, l1.approach]) {
      // The spawn stands 3 u in front of the kiosk screen: start from the nearest 6 u wide floor.
      const start = nearestWalkable(wide, from)!;
      expect(Math.hypot(start.x - from.x, start.z - from.z)).toBeLessThan(4);
      expect(findPath(wide, start, W.stop)?.at(-1), JSON.stringify(from)).toEqual(W.stop);
    }
    const grid = buildNavGrid(l1, ROVER.radius);
    expect(isWalkable(grid, W.stop)).toBe(true);
    // Drives from the spawn to the hall still reach it.
    expect(findPath(grid, l1.spawn, HALL.lead[0])?.at(-1)).toEqual(HALL.lead[0]);
  });

  it("follows the wing road into the wing and back out, and the hall road into the hall", () => {
    const graph = buildRoadGraph(l1.road!);
    const grid = buildNavGrid(l1, ROVER.radius);
    expect(routeUsesRoad(l1, l1.spawn, W.stop)).toBe(true);
    const route = roadRoute(l1.road!, grid, l1.spawn, W.stop, graph)!;
    expect(route.at(-1)).toEqual(W.stop);
    // On the lead road's centre line through the joint into the wing.
    expect(route.some((p) => p.x === W.lead.x && p.z <= W.lead.from + 2)).toBe(true);
    expect(route.some((p) => p.x === W.lead.x && p.z >= W.lead.to - 1e-9)).toBe(true);
    const back = roadRoute(l1.road!, grid, W.stop, l1.approach, graph)!;
    expect(back.some((p) => p.x === W.lead.x && Math.abs(p.z - W.lead.from) < 1e-9)).toBe(true);
    // From the hall: out along the hall road, then in along the wing road.
    const about = l1.doors!.find((d) => d.room === "L1:highlights-about")!.at;
    const across = roadRoute(l1.road!, grid, about, W.stop, graph)!;
    const hallEnd = across.findIndex((p) => p.x === HALL.lead[0].x && p.z === HALL.lead[0].z);
    const wingIn = across.findIndex((p) => p.x === W.lead.x && p.z < S);
    expect(hallEnd).toBeGreaterThanOrEqual(0);
    expect(wingIn).toBeGreaterThan(hallEnd);
    expect(across.at(-1)).toEqual(W.stop);
  });

  it("leaves no pocket behind the desks (either row) that the rover could reach", () => {
    const grid = buildNavGrid(l1, ROVER.radius);
    for (const p of [
      { x: slots[4].rover.x, z: slots[4].rover.z + 1.5 },
      { x: slots[0].rover.x, z: slots[0].rover.z + 1.5 },
      { x: slots[9].rover.x, z: slots[9].rover.z + 1.5 },
      { x: slots[5].rover.x, z: slots[5].rover.z + 1.5 },
      { x: slots[7].rover.x, z: (slots[7].rover.z + W.wall.z) / 2 },
      { x: W.wall.x, z: W.rect.maxZ - 0.6 },
    ])
      expect(isWalkable(grid, p), JSON.stringify(p)).toBe(false);
  });

  it("is on the slab the minimap and point-and-go read: the wing's floor counts, the corners beside it do not", () => {
    expect(slabRects(l1)).toEqual([LOBBY.bounds, W.rect]);
    expect(inSlab(W.stop, l1)).toBe(true);
    expect(inSlab({ x: W.rect.minX - 1, z: S + 5 }, l1)).toBe(false);
    expect(inSlab({ x: W.rect.maxX + 1, z: S + 5 }, l1)).toBe(false);
  });

  it("names the rooms, stops every office drive at the stop and turns the camera south there", () => {
    expect(OFFICE_ROOMS).toEqual(["L1:office", "L1:office-github", ...Array.from({ length: 10 }, (_, i) => `L1:office-desk-${i + 1}`)]);
    expect(officeDeskRoom(0)).toBe("L1:office-desk-1");
    expect(officeDeskRoom(9)).toBe("L1:office-desk-10");
    for (const room of OFFICE_ROOMS) {
      expect(RoomIdSchema.safeParse(room).success, room).toBe(true);
      expect(isOfficeRoom(room)).toBe(true);
      expect(l1.stops?.[room]).toEqual(W.stop);
    }
    expect(isOfficeRoom("L1:visits")).toBe(false);
    expect(isOfficeRoom("L1:officer")).toBe(false);
    expect(isOfficeRoom(null)).toBe(false);
    const zones = l1.viewZones ?? [];
    const zone = zoneAt("L1", W.stop, zones);
    expect(zone?.id).toBe("L1:office");
    expect(zone?.yaw).toBeCloseTo(yawLooking({ x: 0, z: 1 }));
    expect(zoneView(zone!, "desktop")).toEqual({ yaw: zone!.yaw, ...OFFICE.view.desktop });
    expect(zoneView(zone!, "tablet")).toEqual({ yaw: zone!.yaw, ...OFFICE.view.tablet });
    expect(zoneView(zone!, "mobile")).toEqual({ yaw: zone!.yaw, ...OFFICE.view.mobile });
    expect(zoneAt("L1", l1.spawn, zones)?.id).toBe("L1:kiosk");
    expect(zones.filter((z) => z.prime).map((z) => z.id)).toEqual(["L1:kiosk"]);
  });

  it("draws the furniture shell inside the obstacles: 10 desk tops in two continuous consoles, 20 legs, 5 riser blocks, the wall frame, the CI tower (plinth and column) and the dock pad", () => {
    const boxes = officeShellBoxes();
    expect(boxes).toHaveLength(39);
    // Every point of every box (sampled over its turned footprint) stands on an obstacle: no invisible floor gaps.
    const obstacles = officeObstacles(W);
    for (const b of boxes) {
      const c = Math.cos(b.yaw ?? 0);
      const sn = Math.sin(b.yaw ?? 0);
      for (let u = -0.5; u <= 0.5; u += 0.1)
        for (let v = -0.5; v <= 0.5; v += 0.25) {
          // Local x is (cos yaw, -sin yaw), local z (sin yaw, cos yaw) in floor x and z.
          const p = { x: b.x + u * b.w * c + v * b.d * sn, z: b.z - u * b.w * sn + v * b.d * c };
          expect(obstacles.some((o) => inside({ minX: p.x, maxX: p.x, minZ: p.z, maxZ: p.z }, o)), JSON.stringify({ b, p })).toBe(true);
        }
    }
    // The desk tops are the desks, on their row's floor: neighbours meet at their back edge (each console has no gap).
    for (const row of OFFICE.rows) {
      const tops = boxes.filter((b) => b.y === row.lift + OFFICE.desk.top - OFFICE.desk.slab);
      expect(tops).toHaveLength(5);
      for (const t of tops) expect(t.w).toBe(row.deskW);
      const legs = boxes.filter((b) => b.y === row.lift && b.w === OFFICE.desk.leg);
      expect(legs).toHaveLength(10);
    }
    // The riser blocks stand on the floor, as high as the back row's floor, under its desks and Rovers.
    const risers = boxes.filter((b) => b.y === 0 && b.h === OFFICE.rows[1].lift);
    expect(risers).toHaveLength(5);
    for (const [i, s] of rowSlots(slots, 1).entries()) {
      const r = officeRiser(W, OFFICE.rows[1], s.theta)!;
      expect(risers[i]).toEqual({ x: r.center.x, y: 0, z: r.center.z, w: r.w, h: OFFICE.rows[1].lift, d: r.d, yaw: r.yaw });
    }
    // The tallest is the CI tower column (on its plinth), then the wall frame.
    const heights = boxes.map((b) => b.y + b.h).sort((x, y) => y - x);
    expect(heights[0]).toBeCloseTo(OFFICE.tower.plinth + OFFICE.tower.h);
    expect(heights[1]).toBeCloseTo(OFFICE.wall.bottom + OFFICE.wall.h + OFFICE.wall.frame);
    // The tower plinth and the dock pad fill their corners; the column stands on the plinth, turned toward the stop.
    const [plinth, column, pad] = boxes.slice(-3);
    const tower = officeTower(W);
    const dock = officeDock(W);
    expect(plinth).toMatchObject({ y: 0, h: OFFICE.tower.plinth, w: tower.maxX - tower.minX, d: tower.maxZ - tower.minZ });
    expect(column).toMatchObject({ ...officeTowerColumn(W), y: OFFICE.tower.plinth, w: OFFICE.tower.column, d: OFFICE.tower.column, h: OFFICE.tower.h });
    expect(Math.sin(column.yaw!) * (W.stop.x - column.x) + Math.cos(column.yaw!) * (W.stop.z - column.z)).toBeCloseTo(Math.hypot(W.stop.x - column.x, W.stop.z - column.z));
    expect(pad).toMatchObject({ ...officeDockPad(W), y: 0, h: OFFICE.dock.pad, w: dock.maxX - dock.minX, d: dock.maxZ - dock.minZ });
    expect(column.yaw).toBe(officeTowerYaw(W));
  });

  it("makes the CI tower a slim LED-lane column (owner decision 2026-10-20) on low floor pads, the corners' obstacles unchanged", () => {
    expect(OFFICE.tower.column).toBeCloseTo(1.2);
    expect(OFFICE.tower.h).toBe(9);
    // The tower plinth and the dock pad read as floor pads, 0.08 u to 0.12 u high.
    for (const h of [OFFICE.tower.plinth, OFFICE.dock.pad]) {
      expect(h).toBeGreaterThanOrEqual(0.08);
      expect(h).toBeLessThanOrEqual(0.12);
    }
    expect(officeObstacles(W).slice(4)).toEqual([officeTower(W), officeDock(W)]);
  });

  it("makes each row one continuous console: neighbouring desks touch, so the boxes touch honestly and hide little open floor", () => {
    // Each desk spans its share of its row's arc at its back edge, so neighbouring tops meet there.
    for (const row of OFFICE.rows) {
      const step = ((row.angles[0] - row.angles[1]) * Math.PI) / 180;
      for (let i = 1; i < row.angles.length; i++) expect(row.angles[i - 1] - row.angles[i]).toBeCloseTo(row.angles[0] - row.angles[1]);
      // Per row: wide enough to meet at the back edge, rounded up by under 0.02 u (no overlap along the depth).
      const meet = 2 * (row.deskRadius + OFFICE.desk.d / 2) * Math.tan(step / 2);
      expect(row.deskW).toBeGreaterThanOrEqual(meet);
      expect(row.deskW - meet).toBeLessThan(0.02);
    }
    // Per-slot desk-and-Rover footprints in each row: neighbours overlap; the others are bridged by the touching desks
    // between them (a chain), never a sliver of floor under 6 u. rectGap per pair (desk numbers):
    const front = rowSlots(slots, 0);
    const back = rowSlots(slots, 1);
    const pairs = (row: OfficeSlot[]) => row.flatMap((a, i) => row.slice(i + 1).map((b) => `${a.slot + 1}-${b.slot + 1} ${rectGap(a.rect, b.rect).toFixed(2)}`));
    expect(pairs(front)).toEqual(["1-2 0.00", "1-3 3.21", "1-4 6.94", "1-5 10.46", "2-3 0.00", "2-4 3.41", "2-5 6.94", "3-4 0.00", "3-5 3.21", "4-5 0.00"]);
    expect(pairs(back)).toEqual(["6-7 0.00", "6-8 2.38", "6-9 5.46", "6-10 8.47", "7-8 0.00", "7-9 2.45", "7-10 5.46", "8-9 0.00", "8-10 2.38", "9-10 0.00"]);
    for (const row of [front, back])
      for (let i = 0; i < row.length; i++)
        for (let j = i + 1; j < row.length; j++) {
          const gap = rectGap(row[i].rect, row[j].rect);
          const chain = row.slice(i, j).every((s, k) => rectGap(s.rect, row[i + k + 1].rect) === 0);
          expect(gap >= SPACE_RULES.clear || chain, `desks ${row[i].slot + 1} and ${row[j].slot + 1}: ${gap}`).toBe(true);
        }
    // The rows stand close (the riser starts 0.25 u behind the middle front Rover's footprint): the strip between them is
    // inside the console's boxes (below), never open floor.
    for (const b of back) expect(Math.min(...front.map((f) => rectGap(f.rect, b.rect))), `desk ${b.slot + 1}`).toBeLessThan(0.5);
    // The row's boxes cover every footprint, and the floor they hide beyond the footprints in front of the console
    // (nearer the arc centre than the front desks' front edges) stays under 15% of the footprints' area. The rest they
    // hide lies behind the front row: the back row and the open floor between it and the wall frame.
    const row = officeObstacles(W).slice(0, 3);
    const inRect = (r: Rect, x: number, z: number) => x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ;
    const frontEdge = OFFICE.rows[0].deskRadius - OFFICE.desk.d / 2;
    const wallFront = officeWallRect(W).minZ;
    const cell = 0.05;
    let foot = 0;
    let hidden = 0;
    let deepest = 0;
    for (let x = W.rect.minX; x <= W.rect.maxX; x += cell)
      for (let z = W.arc.z; z <= W.rect.maxZ; z += cell) {
        const inFoot = slots.some((s) => inRect(s.rect, x, z));
        const inRow = row.some((r) => inRect(r, x, z));
        if (inFoot) foot += 1;
        if (inFoot && !inRow) throw new Error(`(${x}, ${z}) of a footprint outside the boxes`);
        if (inFoot || !inRow) continue;
        if (Math.hypot(x - W.arc.x, z - W.arc.z) < frontEdge) hidden += 1;
        else deepest = Math.max(deepest, wallFront - z);
      }
    expect(hidden / foot).toBeLessThan(0.15);
    // The rest lies behind the consoles (from the front row's end Rovers back to the wall frame): the floor around the
    // back row and behind it (4.5 u behind its middle Rover), open to the eye and closed to the rover, so no drive ends up
    // behind the console.
    expect(deepest).toBeCloseTo(wallFront - (front[0].rover.z + OFFICE.rover.radius), 1);
  });
});

describe("CI tower and ship dock", () => {
  const w = LOBBY.officeWing;
  const [east, , west] = officeObstacles(w);
  const tower = officeTower(w);
  const dock = officeDock(w);
  it("fill the corners beside the end row boxes, touching them and the wing's edges", () => {
    expect(tower).toMatchObject({ minX: east.maxX, maxX: w.rect.maxX, maxZ: w.rect.maxZ });
    expect(dock).toMatchObject({ minX: w.rect.minX, maxX: west.minX, maxZ: w.rect.maxZ });
    expect(tower.minZ).toBeCloseTo(east.minZ, 6);
    expect(dock.minZ).toBeCloseTo(west.minZ, 6);
    expect(officeObstacles(w).slice(4)).toEqual([tower, dock]);
    for (const r of [tower, dock]) expect(l1.obstacles).toContainEqual(r);
  });
  it("meet the space rules (touch, 6 u or a filled gap) with every other L1 obstacle", () => {
    for (const r of [tower, dock])
      for (const o of l1.obstacles.filter((o) => !sameRect(o, r))) {
        const gap = rectGap(r, o);
        // The tower keeps 3.68 u to the middle box and 0.21 u to the wall frame (the dock mirrored), but the end row
        // box between them fills that strip: no floor, the three touch as one chain (`gapFilled`).
        const filled = gapFilled(r, o, l1.obstacles.filter((x) => !sameRect(x, r) && !sameRect(x, o)));
        expect(gap === 0 || gap >= 6 - 1e-6 || filled, `${JSON.stringify(r)} vs ${JSON.stringify(o)}: ${gap}`).toBe(true);
      }
  });
  it("leave the stop reachable from the spawn and the elevator, with no pocket", () => {
    expect(reachable(l1, LOBBY.spawn, w.stop)).toBe(true);
    expect(reachable(l1, LOBBY.arrival, w.stop)).toBe(true);
    expect(pocketCells(l1)).toEqual([]);
  });
  it("keeps every Rover's footprint (radius 1) inside the office obstacles while pacing and docked", () => {
    const boxes = officeObstacles(w);
    const inside = (x: number, z: number) => boxes.some((b) => x >= b.minX - 1e-6 && x <= b.maxX + 1e-6 && z >= b.minZ - 1e-6 && z <= b.maxZ + 1e-6);
    for (const s of officeSlots(w)) {
      const across = { x: Math.cos(s.yaw), z: -Math.sin(s.yaw) };
      const fwd = { x: Math.sin(s.yaw), z: Math.cos(s.yaw) };
      for (const [dx, dz] of [[CREW.pace.amp, 0], [-CREW.pace.amp, 0], [0, -CREW.dock.back]]) {
        const cx = s.rover.x + across.x * dx + fwd.x * dz;
        const cz = s.rover.z + across.z * dx + fwd.z * dz;
        for (let k = 0; k < 32; k++) {
          const a = (k / 32) * Math.PI * 2;
          expect(inside(cx + Math.cos(a), cz + Math.sin(a)), `slot ${s.slot} at ${dx},${dz}`).toBe(true);
        }
      }
    }
  });
  it("puts the tower column on the tower and in front of the wall line", () => {
    const c = officeTowerColumn(w);
    expect(c.x).toBeGreaterThan(tower.minX);
    expect(c.x).toBeLessThan(tower.maxX);
    expect(c.z).toBeLessThan(w.wall.z);
  });
  it("puts the dock pad on the dock, and makes the tower column a camera column (plinth plus column)", () => {
    const p = officeDockPad(w);
    expect(p.x).toBeGreaterThan(dock.minX);
    expect(p.x).toBeLessThan(dock.maxX);
    expect(p.z).toBeGreaterThan(dock.minZ);
    expect(p.z).toBeLessThan(dock.maxZ);
    const c = officeTowerColumn(w);
    // The turned column's axis-aligned box.
    const half = turnedHalf(OFFICE.tower.column, OFFICE.tower.column, officeTowerYaw(w));
    expect(half.x).toBeGreaterThan(OFFICE.tower.column / 2);
    expect(half.x).toBeLessThan((OFFICE.tower.column / 2) * Math.SQRT2 + 1e-9);
    expect(officeTowerTall(w)).toEqual({ minX: c.x - half.x, maxX: c.x + half.x, minZ: c.z - half.z, maxZ: c.z + half.z, h: OFFICE.tower.plinth + OFFICE.tower.h });
    expect(inside(officeTowerTall(w), tower)).toBe(true);
    expect(l1.tall).toContainEqual(officeTowerTall(w));
    expect(l1.tall).toContainEqual(officeTall(w));
  });
});
