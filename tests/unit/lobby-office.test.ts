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
  officeDeskRoom,
  officeObstacles,
  officeSlots,
  officeTall,
  officeWallRect,
  turnedHalf,
} from "@/experience/floors/lobby/officeLayout";
import { officeBounds, officeShellBoxes } from "@/experience/floors/lobby/officeShell";
import { buildNavGrid, findPath, isWalkable } from "@/experience/nav/navgrid";
import { rectGap, wideGrid } from "@/experience/nav/space";
import type { Rect } from "@/experience/types";

const l1 = buildFloorLayouts(8).L1;
const slots = officeSlots();
const same = (a: Rect, b: Rect) => a.minX === b.minX && a.maxX === b.maxX && a.minZ === b.minZ && a.maxZ === b.maxZ;
const inside = (r: Rect, b: Rect) => r.minX >= b.minX - 1e-9 && r.maxX <= b.maxX + 1e-9 && r.minZ >= b.minZ - 1e-9 && r.maxZ <= b.maxZ + 1e-9;

describe("Agent Office layout (owner decisions D1 and D7)", () => {
  it("puts five desks on one arc around (3.5, 10), west to east, equally spaced, each facing the arc centre", () => {
    expect(slots.map((s) => s.slot)).toEqual([0, 1, 2, 3, 4]);
    expect(slots[2].desk.x).toBeCloseTo(3.5);
    expect(slots[2].desk.z).toBeCloseTo(18);
    expect(slots[0].desk.x).toBeCloseTo(-2.743, 2);
    expect(slots[0].desk.z).toBeCloseTo(15, 2);
    expect(slots[4].desk.x).toBeCloseTo(9.743, 2);
    expect(slots[4].desk.z).toBeCloseTo(15, 2);
    const gaps = slots.slice(1).map((s, i) => Math.hypot(s.desk.x - slots[i].desk.x, s.desk.z - slots[i].desk.z));
    for (const gap of gaps) expect(gap).toBeCloseTo(gaps[0], 6);
    for (const s of slots) {
      expect(Math.hypot(s.desk.x - OFFICE.center.x, s.desk.z - OFFICE.center.z)).toBeCloseTo(OFFICE.deskRadius);
      expect(Math.hypot(s.rover.x - OFFICE.center.x, s.rover.z - OFFICE.center.z)).toBeCloseTo(OFFICE.roverRadius);
      const dx = OFFICE.center.x - s.desk.x;
      const dz = OFFICE.center.z - s.desk.z;
      const d = Math.hypot(dx, dz);
      // Forward is (sin yaw, cos yaw), like the rover and `Box.yaw`.
      expect((Math.sin(s.yaw) * dx + Math.cos(s.yaw) * dz) / d).toBeCloseTo(1);
    }
    for (let i = 1; i < slots.length; i++) expect(slots[i].desk.x).toBeGreaterThan(slots[i - 1].desk.x);
  });

  it("stands the screen wall on the south edge, centred on the arc, clear of the middle Rover's back", () => {
    const wall = officeWallRect();
    expect((wall.minX + wall.maxX) / 2).toBeCloseTo(OFFICE.center.x);
    expect(wall.maxX - wall.minX).toBeCloseTo(OFFICE.wall.w + 2 * OFFICE.wall.frame);
    expect(OFFICE.slabEdge).toBe(LOBBY.bounds.maxZ);
    expect(wall.maxZ).toBe(LOBBY.bounds.maxZ);
    expect(wall.minZ).toBeCloseTo(OFFICE.wall.z - OFFICE.wall.t / 2);
    expect(wall.minZ - (slots[2].rover.z + OFFICE.rover.radius)).toBeGreaterThanOrEqual(0.2);
    expect(l1.tall).toContainEqual(officeTall());
    expect(officeTall().h).toBeCloseTo(OFFICE.wall.bottom + OFFICE.wall.h + OFFICE.wall.frame);
  });

  it("stays on the slab and the D7 strip, clear of the kiosk, the observatory, the lane ring and the hall lead road", () => {
    const b = officeBounds();
    expect(inside(b, LOBBY.bounds)).toBe(true);
    expect(b.minX).toBeGreaterThanOrEqual(-6);
    expect(b.maxX).toBeLessThanOrEqual(13);
    expect(b.minZ).toBeGreaterThanOrEqual(12);
    expect(slots[0].rover.x - OFFICE.rover.radius - kioskRect().maxX).toBeGreaterThanOrEqual(3);
    expect(HALL.lead[0].x - (slots[4].rover.x + OFFICE.rover.radius)).toBeGreaterThanOrEqual(2);
    expect(rectGap(b, LOBBY.observatory)).toBeGreaterThan(10);
    const h = LOBBY.hologram;
    const nearest = Math.hypot(Math.max(b.minX - h.x, 0, h.x - b.maxX), Math.max(b.minZ - h.z, 0, h.z - b.maxZ));
    expect(nearest).toBeGreaterThan(LOBBY.laneRadius + ROVER.radius);
  });

  it("adds one obstacle per desk and Rover plus the wall, more than 1 u from every other Lobby obstacle", () => {
    const office = officeObstacles();
    expect(office).toHaveLength(6);
    for (const o of office) expect(l1.obstacles).toContainEqual(o);
    const others = l1.obstacles.filter((o) => !office.some((x) => same(x, o)));
    expect(others.length).toBe(l1.obstacles.length - office.length);
    for (const o of office) for (const other of others) expect(rectGap(o, other), JSON.stringify(other)).toBeGreaterThan(1);
  });

  it("keeps the stop walkable, reachable from the spawn and the elevator, and 2 u or more in front of the middle desk", () => {
    const grid = buildNavGrid(l1, ROVER.radius);
    expect(isWalkable(grid, OFFICE.stop)).toBe(true);
    expect(findPath(grid, l1.spawn, OFFICE.stop)).not.toBeNull();
    expect(findPath(grid, l1.approach, OFFICE.stop)).not.toBeNull();
    // Drives from the spawn to the hall still pass east of the office.
    expect(findPath(grid, l1.spawn, HALL.lead[0])).not.toBeNull();
    const front = OFFICE.center.z + OFFICE.deskRadius - OFFICE.desk.d / 2;
    expect(front - OFFICE.stop.z).toBeGreaterThanOrEqual(2);
    // 6 u wide floor (the space rules' rover circle) reaches within 4 u of the stop.
    expect(isWalkable(wideGrid(l1), { x: OFFICE.stop.x, z: OFFICE.stop.z - 1.2 })).toBe(true);
  });

  it("leaves no pocket behind the desks that the rover could reach", () => {
    const grid = buildNavGrid(l1, ROVER.radius);
    for (const p of [{ x: -3, z: 18.5 }, { x: 10, z: 18.5 }, { x: 3.5, z: 20.4 }]) expect(isWalkable(grid, p), JSON.stringify(p)).toBe(false);
  });

  it("names the rooms, stops every office drive at the stop and turns the camera south there", () => {
    expect(OFFICE_ROOMS).toEqual(["L1:office", "L1:office-github", "L1:office-desk-1", "L1:office-desk-2", "L1:office-desk-3", "L1:office-desk-4", "L1:office-desk-5"]);
    expect(officeDeskRoom(0)).toBe("L1:office-desk-1");
    for (const room of OFFICE_ROOMS) {
      expect(RoomIdSchema.safeParse(room).success, room).toBe(true);
      expect(isOfficeRoom(room)).toBe(true);
      expect(l1.stops?.[room]).toEqual(OFFICE.stop);
    }
    expect(isOfficeRoom("L1:visits")).toBe(false);
    expect(isOfficeRoom("L1:officer")).toBe(false);
    expect(isOfficeRoom(null)).toBe(false);
    const zones = l1.viewZones ?? [];
    const zone = zoneAt("L1", OFFICE.stop, zones);
    expect(zone?.id).toBe("L1:office");
    expect(zone?.yaw).toBeCloseTo(yawLooking({ x: 0, z: 1 }));
    expect(zoneView(zone!, "desktop").zoom).toBe(OFFICE.view.zoom);
    expect(zoneView(zone!, "mobile").zoom).toBe(OFFICE.view.mobile);
    expect(zoneAt("L1", l1.spawn, zones)?.id).toBe("L1:kiosk");
    expect(zones.filter((z) => z.prime).map((z) => z.id)).toEqual(["L1:kiosk"]);
  });

  it("draws the furniture shell inside the obstacles: 5 desk tops, 10 legs, 4 cable trays and the wall frame", () => {
    const boxes = officeShellBoxes();
    expect(boxes).toHaveLength(20);
    const obstacles = officeObstacles();
    for (const b of boxes.filter((box) => box.h > 0.1)) {
      const h = turnedHalf(b.w, b.d, b.yaw ?? 0);
      const r = { minX: b.x - h.x, maxX: b.x + h.x, minZ: b.z - h.z, maxZ: b.z + h.z };
      expect(obstacles.some((o) => inside(r, o)), JSON.stringify(b)).toBe(true);
    }
    const top = Math.max(...boxes.map((b) => b.y + b.h));
    expect(top).toBeCloseTo(OFFICE.wall.bottom + OFFICE.wall.h + OFFICE.wall.frame);
  });
});
