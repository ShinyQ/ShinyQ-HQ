import { describe, expect, it } from "vitest";
import { RoomIdSchema } from "@/content/schema";
import { yawLooking } from "@/experience/camera/look";
import { zoneAt, zoneView } from "@/experience/camera/orbit";
import { buildFloorLayouts, kioskRect, LOBBY, ROVER } from "@/experience/config";
import { HALL } from "@/experience/floors/lobby/hallLayout";
import {
  isOfficeRoom,
  OFFICE,
  OFFICE_ROOMS,
  OFFICE_WING,
  officeDeskRoom,
  officeObstacles,
  officeRoad,
  officeSlots,
  officeStops,
  officeTall,
  officeWallRect,
  officeWing,
  officeZone,
  type OfficeWing,
} from "@/experience/floors/lobby/officeLayout";
import { OFFICE_SLOTS, officeBounds, officeShellBoxes, officeSign, wingBounds } from "@/experience/floors/lobby/officeShell";
import { buildNavGrid, findPath, isWalkable, nearestWalkable } from "@/experience/nav/navgrid";
import { buildRoadGraph, routeUsesRoad } from "@/experience/nav/road";
import { roadRoute } from "@/experience/nav/roadRoute";
import { inSlab, slabRects } from "@/experience/nav/slab";
import { rectGap, SPACE_RULES, spaceViolations, wideGrid } from "@/experience/nav/space";
import type { Rect, Vec2 } from "@/experience/types";

const l1 = buildFloorLayouts(8).L1;
const W = LOBBY.officeWing;
const S = LOBBY.bounds.maxZ;
const slots = officeSlots(W);
const inside = (r: Rect, b: Rect) => r.minX >= b.minX - 1e-9 && r.maxX <= b.maxX + 1e-9 && r.minZ >= b.minZ - 1e-9 && r.maxZ <= b.maxZ + 1e-9;
const leadRect = (w: OfficeWing): Rect => ({ minX: w.lead.x - w.lead.width / 2, maxX: w.lead.x + w.lead.width / 2, minZ: w.lead.from, maxZ: w.lead.to });

describe("Agent Office wing (owner decision 2026-10-20)", () => {
  it("is one named wing derived from the Lobby's south edge: the L1 slab gains it, the main rect stays", () => {
    expect(W).toEqual(officeWing(S));
    expect(W.rect).toEqual({ minX: -12, maxX: 18, minZ: S, maxZ: S + 25 });
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

  it("floats the wing sign (upper case) over the lead road just before it enters the wing, above the rover", () => {
    const sign = officeSign("Agent Office", "#34d399");
    expect(sign).toMatchObject({ text: "AGENT OFFICE", x: W.lead.x, z: W.rect.minZ - 2 });
    expect(sign.z).toBeGreaterThan(W.lead.from);
    expect(sign.tilt ?? 0).toBe(0);
    expect(sign.y).toBeGreaterThan(5);
  });

  it("meets the space rules: the desk boxes touch each other and the wall or keep 6 u, and keep 6 u to the wing's side edges", () => {
    const office = officeObstacles(W);
    expect(office).toHaveLength(4);
    for (const o of office) expect(l1.obstacles).toContainEqual(o);
    for (let i = 0; i < office.length; i++)
      for (let j = i + 1; j < office.length; j++) {
        const gap = rectGap(office[i], office[j]);
        expect(gap === 0 || gap >= SPACE_RULES.clear, `${i} ${j}: ${gap}`).toBe(true);
      }
    // Flush with the wing's south edge, inside the wing, 6 u from its side edges.
    for (const o of office) {
      expect(o.maxZ).toBe(W.rect.maxZ);
      expect(inside(o, W.rect)).toBe(true);
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

  it("puts five desks on one arc on the stop's axis, east to west (desk 1 leftmost from the office stop), equally spaced, each facing the arc centre", () => {
    expect(slots.map((s) => s.slot)).toEqual([0, 1, 2, 3, 4]);
    expect(W.arc.x).toBe(W.stop.x);
    expect(slots[2].desk.x).toBeCloseTo(W.stop.x);
    const gaps = slots.slice(1).map((s, i) => Math.hypot(s.desk.x - slots[i].desk.x, s.desk.z - slots[i].desk.z));
    for (const gap of gaps) expect(gap).toBeCloseTo(gaps[0], 6);
    for (const s of slots) {
      expect(Math.hypot(s.desk.x - W.arc.x, s.desk.z - W.arc.z)).toBeCloseTo(OFFICE.deskRadius);
      expect(Math.hypot(s.rover.x - W.arc.x, s.rover.z - W.arc.z)).toBeCloseTo(OFFICE.roverRadius);
      const dx = W.arc.x - s.desk.x;
      const dz = W.arc.z - s.desk.z;
      // Forward is (sin yaw, cos yaw), like the rover and `Box.yaw`.
      expect((Math.sin(s.yaw) * dx + Math.cos(s.yaw) * dz) / Math.hypot(dx, dz)).toBeCloseTo(1);
    }
    // The stop camera looks toward +z, so +x is on the left of the screen: desk 1 (slot 0) is the east end.
    for (let i = 1; i < slots.length; i++) expect(slots[i].desk.x).toBeLessThan(slots[i - 1].desk.x);
    expect(OFFICE_SLOTS).toEqual(slots);
  });

  it("stands the screen wall flush with the wing's south edge, facing north, centred on the arc, clear of the middle Rover's back", () => {
    const wall = officeWallRect(W);
    expect((wall.minX + wall.maxX) / 2).toBeCloseTo(W.arc.x);
    expect(wall.maxX - wall.minX).toBeCloseTo(OFFICE.wall.w + 2 * OFFICE.wall.frame);
    expect(wall.maxZ).toBe(W.rect.maxZ);
    expect(W.rect.maxZ).toBe(S + OFFICE_WING.depth);
    expect(wall.minZ).toBeCloseTo(W.wall.z - OFFICE.wall.t / 2);
    expect(wall.minZ - (slots[2].rover.z + OFFICE.rover.radius)).toBeGreaterThanOrEqual(0.2);
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

  it("leaves no pocket behind the desks that the rover could reach", () => {
    const grid = buildNavGrid(l1, ROVER.radius);
    for (const p of [
      { x: slots[4].rover.x, z: slots[4].rover.z + 1.5 },
      { x: slots[0].rover.x, z: slots[0].rover.z + 1.5 },
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
    expect(OFFICE_ROOMS).toEqual(["L1:office", "L1:office-github", "L1:office-desk-1", "L1:office-desk-2", "L1:office-desk-3", "L1:office-desk-4", "L1:office-desk-5"]);
    expect(officeDeskRoom(0)).toBe("L1:office-desk-1");
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
    expect(zoneView(zone!, "desktop")).toEqual({ yaw: zone!.yaw, zoom: OFFICE.view.desktop.zoom, pitch: undefined });
    expect(zoneView(zone!, "tablet")).toEqual({ yaw: zone!.yaw, ...OFFICE.view.tablet });
    expect(zoneView(zone!, "mobile")).toEqual({ yaw: zone!.yaw, ...OFFICE.view.mobile });
    expect(zoneAt("L1", l1.spawn, zones)?.id).toBe("L1:kiosk");
    expect(zones.filter((z) => z.prime).map((z) => z.id)).toEqual(["L1:kiosk"]);
  });

  it("draws the furniture shell inside the obstacles: 5 desk tops meeting in one console, 10 legs and the wall frame", () => {
    const boxes = officeShellBoxes();
    expect(boxes).toHaveLength(16);
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
    // The desk tops are the desks: neighbours meet at their back edge (the console has no gap).
    const tops = boxes.filter((b) => b.y > 0);
    expect(tops).toHaveLength(5);
    for (const t of tops) expect(t.w).toBe(OFFICE.desk.w);
    const top = Math.max(...boxes.map((b) => b.y + b.h));
    expect(top).toBeCloseTo(OFFICE.wall.bottom + OFFICE.wall.h + OFFICE.wall.frame);
  });

  it("is one continuous console: neighbouring desks touch, so the boxes touch honestly and hide little open floor", () => {
    // Each desk spans its 20 degree share of the arc at its back edge, so neighbouring tops meet.
    const step = ((OFFICE.angles[0] - OFFICE.angles[1]) * Math.PI) / 180;
    for (let i = 1; i < OFFICE.angles.length; i++) expect(OFFICE.angles[i - 1] - OFFICE.angles[i]).toBeCloseTo(OFFICE.angles[0] - OFFICE.angles[1]);
    expect(OFFICE.desk.w).toBeGreaterThanOrEqual(2 * (OFFICE.deskRadius + OFFICE.desk.d / 2) * Math.tan(step / 2));
    // Per-slot desk-and-Rover footprints: neighbours overlap; the others are bridged by the touching desks between
    // them (a chain), never a sliver of floor under 6 u. rectGap per pair (desk numbers):
    const gaps = slots.flatMap((a, i) => slots.slice(i + 1).map((b) => `${a.slot + 1}-${b.slot + 1} ${rectGap(a.rect, b.rect).toFixed(2)}`));
    expect(gaps).toEqual(["1-2 0.00", "1-3 3.21", "1-4 6.94", "1-5 10.46", "2-3 0.00", "2-4 3.41", "2-5 6.94", "3-4 0.00", "3-5 3.21", "4-5 0.00"]);
    for (let i = 0; i < slots.length; i++)
      for (let j = i + 1; j < slots.length; j++) {
        const gap = rectGap(slots[i].rect, slots[j].rect);
        const chain = slots.slice(i, j).every((s, k) => rectGap(s.rect, slots[i + k + 1].rect) === 0);
        expect(gap >= SPACE_RULES.clear || chain, `desks ${i + 1} and ${j + 1}: ${gap}`).toBe(true);
      }
    // The row's boxes cover every footprint, and the floor they hide beyond the footprints in front of the console
    // (nearer the arc centre than the desks' front edges) stays under 15% of the footprints' area. The rest they hide
    // lies behind the console, under 6 u from the wall frame: a pocket the space rules forbid, so the boxes close it.
    const row = officeObstacles(W).slice(0, 3);
    const inRect = (r: Rect, x: number, z: number) => x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ;
    const front = OFFICE.deskRadius - OFFICE.desk.d / 2;
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
        if (Math.hypot(x - W.arc.x, z - W.arc.z) < front) hidden += 1;
        else deepest = Math.max(deepest, wallFront - z);
      }
    expect(hidden / foot).toBeLessThan(0.15);
    expect(deepest).toBeLessThan(SPACE_RULES.clear);
  });
});
