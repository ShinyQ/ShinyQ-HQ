import type { RoomId } from "@/content/schema";
import { yawLooking } from "../../camera/look";
import type { ViewZone } from "../../camera/orbit";
import type { Rect, Vec2 } from "../../types";
import type { Box } from "../roof/solids";

/**
 * L1 Agent Office (owner decisions D1 and D7, 2026-10-18): one curved console row of five desks with a Rover
 * behind each (facing the plaza) and a screen wall on the south edge of the plaza strip (x about -6 to 13,
 * z 12 to 21). Pure and import-light: config.ts reads it (obstacles, camera column, stops, the view zone),
 * the main-path `OfficeMount` draws the furniture shell from it, and the lazy office chunk places the rest.
 * tests/unit/lobby-office.test.ts asserts every clearance.
 */

/** Resolves a key of the `office` messages namespace (Experience passes its translator for that namespace down to the Lobby). */
export type OfficeTranslate = (key: string, values?: Record<string, string | number>) => string;

export const OFFICE = {
  center: { x: 3.5, z: 10 },
  deskRadius: 8,
  roverRadius: 9.2,
  /** Desk angles (degrees from +z toward +x), slot 0 at the west end. */
  angles: [-51.3, -25.65, 0, 25.65, 51.3],
  /** Tangential width, radial depth, top height, top slab and leg thickness. */
  desk: { w: 2.6, d: 0.9, top: 0.95, slab: 0.08, leg: 0.12 },
  rover: { radius: 1 },
  /** The screen (17 x 4 u, bottom at y 0.6) inside a frame `frame` u wide, its plane at z 20.7 facing north. */
  wall: { x: 3.5, z: 20.7, w: 17, h: 4, bottom: 0.6, t: 0.3, frame: 0.2 },
  /** Point-and-go stop of every office room, in the concave front of the row. */
  stop: { x: 3.5, z: 14.2 },
  /** `L1:office` view zone: zoom per camera class and the half size of its area around the stop. */
  view: { zoom: 1.3, tablet: 1.25, mobile: 1.2, half: { x: 2, z: 1.4 } },
  /** The chunk loads once the rover (or the elevator arrival point during a ride to L1) is this close to the stop. */
  loadRadius: 40,
  /** `LOBBY.bounds.maxZ` (config.ts imports this module, so it cannot import config.ts). */
  slabEdge: 21,
} as const;

export const OFFICE_ROOM = "L1:office" as RoomId;
export const OFFICE_GITHUB_ROOM = "L1:office-github" as RoomId;
export const officeDeskRoom = (slot: number): RoomId => `L1:office-desk-${slot + 1}` as RoomId;
export const OFFICE_ROOMS: readonly RoomId[] = [OFFICE_ROOM, OFFICE_GITHUB_ROOM, ...OFFICE.angles.map((_, slot) => officeDeskRoom(slot))];

/** The office rooms have no route of their own (they keep /{locale}, like the Visitor Observatory). */
export function isOfficeRoom(room: string | null | undefined): boolean {
  return Boolean(room) && (room === OFFICE_ROOM || room!.startsWith("L1:office-"));
}

export interface OfficeSlot {
  slot: number;
  /** Angle from +z toward +x (radians). */
  theta: number;
  /** Turn of the desk and its Rover (three `rotation.y`): forward (sin, cos) points at the arc centre. */
  yaw: number;
  desk: Vec2;
  rover: Vec2;
  /** Axis-aligned box of the turned desk and the Rover's circle. */
  rect: Rect;
}

const DEG = Math.PI / 180;
const onArc = (theta: number, r: number): Vec2 => ({ x: OFFICE.center.x + r * Math.sin(theta), z: OFFICE.center.z + r * Math.cos(theta) });

/** Half extents of a w x d box turned by `yaw` (local x is the width, local z the depth). */
export function turnedHalf(w: number, d: number, yaw: number): Vec2 {
  const c = Math.abs(Math.cos(yaw));
  const s = Math.abs(Math.sin(yaw));
  return { x: (w / 2) * c + (d / 2) * s, z: (w / 2) * s + (d / 2) * c };
}

export function officeSlots(): OfficeSlot[] {
  return OFFICE.angles.map((deg, slot) => {
    const theta = deg * DEG;
    const desk = onArc(theta, OFFICE.deskRadius);
    const rover = onArc(theta, OFFICE.roverRadius);
    const yaw = theta + Math.PI;
    const h = turnedHalf(OFFICE.desk.w, OFFICE.desk.d, yaw);
    const r = OFFICE.rover.radius;
    return {
      slot,
      theta,
      yaw,
      desk,
      rover,
      rect: {
        minX: Math.min(desk.x - h.x, rover.x - r),
        maxX: Math.max(desk.x + h.x, rover.x + r),
        minZ: Math.min(desk.z - h.z, rover.z - r),
        maxZ: Math.max(desk.z + h.z, rover.z + r),
      },
    };
  });
}

/** The wall frame's footprint, reaching back to the slab edge (no sliver of floor behind it). */
export function officeWallRect(): Rect {
  const { x, z, w, t, frame } = OFFICE.wall;
  return { minX: x - w / 2 - frame, maxX: x + w / 2 + frame, minZ: z - t / 2, maxZ: OFFICE.slabEdge };
}

/**
 * Navgrid obstacles: one per desk and Rover (the end ones reach back to the wall, so the rover cannot drive
 * around the row into the space behind it), then the wall. The concave floor in front of the desks stays open.
 */
export function officeObstacles(): Rect[] {
  const wall = officeWallRect();
  const slots = officeSlots();
  const last = slots.length - 1;
  return [...slots.map((s) => (s.slot === 0 || s.slot === last ? { ...s.rect, maxZ: wall.minZ } : s.rect)), wall];
}

/** Camera collision column: the wall frame. */
export function officeTall(): Rect & { h: number } {
  return { ...officeWallRect(), h: OFFICE.wall.bottom + OFFICE.wall.h + OFFICE.wall.frame };
}

/** Everything the office covers: the intro reveal rect and the in-view test. */
export function officeBounds(): Rect {
  const rects = officeObstacles();
  return {
    minX: Math.min(...rects.map((r) => r.minX)),
    maxX: Math.max(...rects.map((r) => r.maxX)),
    minZ: Math.min(...rects.map((r) => r.minZ)),
    maxZ: Math.max(...rects.map((r) => r.maxZ)),
  };
}

/** Where `drive` stops for every office room (`FloorLayout.stops`). */
export function officeStops(): Partial<Record<RoomId, Vec2>> {
  return Object.fromEntries(OFFICE_ROOMS.map((room) => [room, { x: OFFICE.stop.x, z: OFFICE.stop.z }]));
}

/** The office view: around the stop, looking south at the desks and the wall (tuned on the owner captures). */
export function officeZone(): ViewZone {
  const { stop, view } = OFFICE;
  return {
    id: "L1:office",
    area: { minX: stop.x - view.half.x, maxX: stop.x + view.half.x, minZ: stop.z - view.half.z, maxZ: stop.z + view.half.z },
    yaw: yawLooking({ x: 0, z: 1 }),
    zoom: view.zoom,
    classView: { tablet: { zoom: view.tablet }, mobile: { zoom: view.mobile } },
  };
}

/**
 * The furniture drawn on the main path (so the obstacles always show, before the chunk and if it fails):
 * five desk tops, two legs each, four cable trays along the arc between the desks, and the wall frame.
 */
export function officeShellBoxes(): Box[] {
  const { desk, wall } = OFFICE;
  const out: Box[] = [];
  const slots = officeSlots();
  for (const s of slots) {
    out.push({ x: s.desk.x, y: desk.top - desk.slab, z: s.desk.z, w: desk.w, h: desk.slab, d: desk.d, yaw: s.yaw });
    for (const side of [-1, 1]) {
      // Local x is (cos yaw, -sin yaw) in floor x and z.
      const off = side * (desk.w / 2 - 0.2);
      out.push({ x: s.desk.x + off * Math.cos(s.yaw), y: 0, z: s.desk.z - off * Math.sin(s.yaw), w: desk.leg, h: desk.top - desk.slab, d: desk.d * 0.8, yaw: s.yaw });
    }
  }
  for (let i = 0; i + 1 < slots.length; i++) {
    const a = slots[i].theta;
    const b = slots[i + 1].theta;
    const mid = (a + b) / 2;
    const at = onArc(mid, OFFICE.deskRadius);
    const chord = 2 * OFFICE.deskRadius * Math.sin((b - a) / 2);
    out.push({ x: at.x, y: 0, z: at.z, w: chord - desk.w + 0.2, h: 0.06, d: 0.3, yaw: mid + Math.PI });
  }
  out.push({ x: wall.x, y: 0, z: wall.z, w: wall.w + 2 * wall.frame, h: wall.bottom + wall.h + wall.frame, d: wall.t });
  return out;
}
