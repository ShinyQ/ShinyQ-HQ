import type { RoomId } from "@/content/schema";
import { yawLooking } from "../../camera/look";
import type { ViewZone } from "../../camera/orbit";
import type { Plaza, Road } from "../../nav/road";
import type { Rect, Vec2 } from "../../types";

/**
 * L1 Agent Office (owner decisions D1 and D7, 2026-10-18; the south wing, 2026-10-20): its own wing of the L1
 * slab south of the Lobby, reached by a lead road from the Lobby plaza into a wing plaza, with one curved console
 * row of five desks (a Rover behind each, facing the plaza) and, 4.5 u behind the Rovers, a tall screen wall on the
 * wing's south edge (owner request 2026-10-20: a higher wall, more space between the console and the wall).
 * Pure and import-light: config.ts reads it (`LOBBY.officeWing`, obstacles, camera column, stops, the view zone,
 * the road), the main-path `OfficeMount` draws the furniture shell from it, and the lazy office chunk places the
 * rest. tests/unit/lobby-office.test.ts asserts every clearance.
 */

/** Resolves a key of the `office` messages namespace (Experience passes its translator for that namespace down to the Lobby). */
export type OfficeTranslate = (key: string, values?: Record<string, string | number>) => string;

/**
 * The wing as offsets from S, the Lobby slab's south edge (`LOBBY.bounds.maxZ`): config.ts imports this module, so
 * it cannot import config.ts; `officeWing(S)` builds `LOBBY.officeWing` there, the one source every reader uses.
 * x values are absolute (the stop's axis is x 3, inside the Lobby plaza's x -3 to 9 window), z values add to S.
 */
export const OFFICE_WING = {
  /** Slab rect: x -12 to 18 (6 u east of the observatory's edge at x -18), S to S + 29. */
  minX: -12,
  maxX: 18,
  depth: 29,
  /** The axis of the lead road, the plaza, the stop and the desk arc. */
  x: 3,
  /** Lead road: 8 u wide, from the Lobby plaza south of the lane ring (S - 8) to 4.5 u inside the wing plaza (S + 6). */
  lead: { width: 8, from: -8, to: 6 },
  /** Wing plaza (S + 1.5 to S + 17.5): it stops short of the end desks, which reach forward on both sides of the stop. */
  plaza: { z: 9.5, w: 18, d: 16 },
  /** The stop stands in the concave front of the row, 5.5 u from the arc centre toward the desks: the follow camera's look target lands near the wall. */
  stop: 16.5,
  /** Desk arc centre: the middle Rover's back (S + 24.2) stays 4.5 u in front of the wall frame. */
  arc: 11,
  /** The screen wall's centre line, 0.15 u in front of the wing's south edge (its footprint reaches back to it). */
  wall: 28.85,
} as const;

export interface OfficeWing {
  rect: Rect;
  lead: { x: number; width: number; from: number; to: number };
  plaza: { center: Vec2; w: number; d: number };
  stop: Vec2;
  /** The lead road's span in the Lobby (S - 8 to S): with `rect`, where drives follow the wing road (`FloorLayout.roadZone`). */
  leadSpan: Rect;
  /** Desk arc centre. */
  arc: Vec2;
  /** The screen wall's centre line in plan. */
  wall: Vec2;
}

/** The office wing for a Lobby whose south edge is at z `s`. */
export function officeWing(s: number): OfficeWing {
  const W = OFFICE_WING;
  const lead = { x: W.x, width: W.lead.width, from: s + W.lead.from, to: s + W.lead.to };
  return {
    rect: { minX: W.minX, maxX: W.maxX, minZ: s, maxZ: s + W.depth },
    lead,
    plaza: { center: { x: W.x, z: s + W.plaza.z }, w: W.plaza.w, d: W.plaza.d },
    stop: { x: W.x, z: s + W.stop },
    leadSpan: { minX: W.x - W.lead.width / 2, maxX: W.x + W.lead.width / 2, minZ: lead.from, maxZ: s },
    arc: { x: W.x, z: s + W.arc },
    wall: { x: W.x, z: s + W.wall },
  };
}

/** The wing's road: the lead road and the wing plaza (config.ts merges them into the L1 network). */
export function officeRoad(w: OfficeWing): { road: Road; plaza: Plaza } {
  const { lead, plaza } = w;
  return {
    road: { id: "office-lead", points: [{ x: lead.x, z: lead.from }, { x: lead.x, z: lead.to }], width: lead.width },
    plaza: { id: "office", center: { ...plaza.center }, w: plaza.w, d: plaza.d },
  };
}

export const OFFICE = {
  deskRadius: 11,
  roverRadius: 12.2,
  /**
   * Desk angles (degrees from +z toward +x), slot 0 at the east end: the stop camera looks toward +z, so +x is
   * on the left of the screen and desk 1 is the leftmost Rover from the office stop, like the drawer's list.
   */
  angles: [40, 20, 0, -20, -40],
  /**
   * Tangential width, radial depth, top height, top slab and leg thickness. The width closes the 20 degree step at
   * the desks' back edge (2 (11 + 0.45) tan 10 deg = 4.04), so the five desks read as one continuous console.
   */
  desk: { w: 4.05, d: 0.9, top: 0.95, slab: 0.08, leg: 0.12 },
  rover: { radius: 1 },
  /**
   * The screen (17 x 5.2 u, the wall canvas's 1280 x 392 aspect, bottom at y 1.2: over the desks and the Rovers' heads
   * from the office stop) inside a frame `frame` u wide, `t` thick, facing north (`OfficeWing.wall`).
   */
  wall: { w: 17, h: 5.2, bottom: 1.2, t: 0.3, frame: 0.2 },
  /** The CI tower (south-east corner, stage B lights its lane matrix) and the ship dock (south-west corner). */
  tower: { column: 2, h: 9, plinth: 0.4 },
  dock: { pad: 0.25 },
  /**
   * `L1:office` view zone per camera class (zoom, pitch as an offset from the rig's elevation, look offset) and the half
   * size of its area around the stop. From the stop the office fills the frame (owner decision 2026-10-20, with the chips
   * in one row under the HUD's top bar): each class raises the camera (`pitch`) and takes the view closest to the wall's
   * top 12% to 15% from the top edge and the console and the Rovers 45% to 85% down, with the whole wall, the five desks,
   * every Rover's head under the screen and the visitor's Rover in frame (tests/unit/office-view.test.ts measures them):
   * - desktop: the CI tower column and the dock pad in frame too, which on 1180 x 820 (the narrowest desktop) holds the
   *   camera back: the wall's top at 15%, the Rovers' heads from 42.4% down; the look target drops 1.25 u (`up`) and holds
   *   through a hand zoom (`hold`), so the near pose zooms in about the same aim;
   * - tablet (landscape phones and small landscape tablets): the wall's top at 17.7%, under the HUD's top bar on 844 x 390
   *   and the chip row on 960 x 640, the console 45.8% to 66.4% down, the tower and the dock in frame, the plain aim;
   * - mobile (portrait screens): width bound (the whole wall and the five desks across 390 px, every Rover's head in frame
   *   with the rover anywhere in the stop's zone), so the office spans under a third of the height: the wall's top at 15%,
   *   the console 31.4% to 42.6% down; the look target moves 5.25 u toward the camera, and a hand zoom hands the framing
   *   back there (the offset eases out).
   * A `pitch` also opts into the turn-back on exit: the tilt levels again when the rover leaves the stop.
   */
  view: {
    desktop: { zoom: 1.285, pitch: 0.26, lookOffset: { up: -1.25, hold: true } },
    tablet: { zoom: 1.2, pitch: 0.35 },
    mobile: { zoom: 1.42, pitch: 0.2, lookOffset: { forward: -5.25 } },
    half: { x: 2, z: 1.4 },
  },
  /**
   * The chunk loads once the rover is this close to the stop: on the lead road (its Lobby end is 24.5 u away) or in
   * the wing, not at the spawn (30.8 u) or the elevator arrival (38.6 u). A ride or a drive of an office mission
   * loads it at once (`officeLoadWanted`), and an office drawer loads it on open.
   */
  loadRadius: 25,
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
/** The point at angle `theta` (radians from +z toward +x) and radius `r` around the wing's arc centre. */
export const onArc = (w: OfficeWing, theta: number, r: number): Vec2 => ({ x: w.arc.x + r * Math.sin(theta), z: w.arc.z + r * Math.cos(theta) });

/** Half extents of a w x d box turned by `yaw` (local x is the width, local z the depth). */
export function turnedHalf(w: number, d: number, yaw: number): Vec2 {
  const c = Math.abs(Math.cos(yaw));
  const s = Math.abs(Math.sin(yaw));
  return { x: (w / 2) * c + (d / 2) * s, z: (w / 2) * s + (d / 2) * c };
}

export function officeSlots(w: OfficeWing): OfficeSlot[] {
  return OFFICE.angles.map((deg, slot) => {
    const theta = deg * DEG;
    const desk = onArc(w, theta, OFFICE.deskRadius);
    const rover = onArc(w, theta, OFFICE.roverRadius);
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

/** The wall frame's footprint, reaching back to the wing's south edge (no sliver of floor behind it). */
export function officeWallRect(w: OfficeWing): Rect {
  const { wall } = OFFICE;
  return { minX: w.wall.x - wall.w / 2 - wall.frame, maxX: w.wall.x + wall.w / 2 + wall.frame, minZ: w.wall.z - wall.t / 2, maxZ: w.rect.maxZ };
}

/** The south-east corner beside the east row box: touches it and the wing's east and south edges (SPACE_RULES allow touching). */
export function officeTower(w: OfficeWing): Rect {
  const east = officeSlots(w)[0].rect;
  return { minX: east.maxX, maxX: w.rect.maxX, minZ: east.minZ, maxZ: w.rect.maxZ };
}

/** The south-west corner beside the west row box, mirrored. */
export function officeDock(w: OfficeWing): Rect {
  const west = officeSlots(w)[OFFICE.angles.length - 1].rect;
  return { minX: w.rect.minX, maxX: west.minX, minZ: west.minZ, maxZ: w.rect.maxZ };
}

/**
 * The tower column's centre (the crew's look target): 1.5 u in from the corner's east and north edges, so the column
 * (turned toward the stop, reaching about 1.18 u) stays on the plinth and, from the office stop, in frame on desktops
 * (tests/unit/office-view.test.ts).
 */
export function officeTowerColumn(w: OfficeWing): Vec2 {
  const r = officeTower(w);
  return { x: r.maxX - 1.5, z: r.minZ + 1.5 };
}

/** The ship dock pad's centre: the corner's middle. */
export function officeDockPad(w: OfficeWing): Vec2 {
  const r = officeDock(w);
  return { x: (r.minX + r.maxX) / 2, z: (r.minZ + r.maxZ) / 2 };
}

/**
 * Navgrid obstacles, flush with the wing's south edge: each end desk and its Rover as one box, the middle three as the
 * box between them, then the wall, the CI tower and the ship dock. The 4.5 u between the Rovers and the wall (7.35 u
 * behind the end Rovers) is open to the eye but closed to the rover: the boxes reach back to the wall, so no drive ends
 * up behind the console. Neighbouring desks touch (the console is continuous), so the boxes touch too; the two end
 * boxes keep the middle box's width (about 10 u) apart and 6 u from the wing's side edges, and the tower and the dock
 * fill the two corners between them and the side edges (touching both). The middle box starts at the front of desks 2
 * and 4, so the concave floor around the stop stays open (tests/unit/lobby-office.test.ts measures the hidden floor).
 */
export function officeObstacles(w: OfficeWing): Rect[] {
  const s = officeSlots(w).map((x) => x.rect);
  const edge = w.rect.maxZ;
  const east = s[0];
  const west = s[s.length - 1];
  return [
    { ...east, maxZ: edge },
    { minX: west.maxX, maxX: east.minX, minZ: Math.min(...s.slice(1, -1).map((r) => r.minZ)), maxZ: edge },
    { ...west, maxZ: edge },
    officeWallRect(w),
    officeTower(w),
    officeDock(w),
  ];
}

/** Camera collision column: the wall frame. */
export function officeTall(w: OfficeWing): Rect & { h: number } {
  return { ...officeWallRect(w), h: OFFICE.wall.bottom + OFFICE.wall.h + OFFICE.wall.frame };
}

/** Camera collision column: the CI tower's 2 x 2 u column around `officeTowerColumn`, from the floor to its top (plinth plus column). */
export function officeTowerTall(w: OfficeWing): Rect & { h: number } {
  const c = officeTowerColumn(w);
  const half = OFFICE.tower.column / 2;
  return { minX: c.x - half, maxX: c.x + half, minZ: c.z - half, maxZ: c.z + half, h: OFFICE.tower.plinth + OFFICE.tower.h };
}

/** Where `drive` stops for every office room (`FloorLayout.stops`). */
export function officeStops(w: OfficeWing): Partial<Record<RoomId, Vec2>> {
  return Object.fromEntries(OFFICE_ROOMS.map((room) => [room, { x: w.stop.x, z: w.stop.z }]));
}

/** The office view: around the stop, looking south at the desks and the wall, per camera class (`OFFICE.view`). */
export function officeZone(w: OfficeWing): ViewZone {
  const { stop } = w;
  const { view } = OFFICE;
  return {
    id: "L1:office",
    area: { minX: stop.x - view.half.x, maxX: stop.x + view.half.x, minZ: stop.z - view.half.z, maxZ: stop.z + view.half.z },
    yaw: yawLooking({ x: 0, z: 1 }),
    zoom: view.desktop.zoom,
    classView: {
      desktop: { ...view.desktop, lookOffset: { ...view.desktop.lookOffset } },
      tablet: { ...view.tablet },
      mobile: { ...view.mobile, lookOffset: { ...view.mobile.lookOffset } },
    },
    // The view looks south past the L1 slab edge, under the L2 slab: its ghost outline hides here (tower/ghostOutline.ts).
    hideGhostAbove: true,
  };
}
