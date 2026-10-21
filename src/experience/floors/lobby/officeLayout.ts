import type { RoomId } from "@/content/schema";
import { yawLooking } from "../../camera/look";
import type { ViewZone } from "../../camera/orbit";
import type { Plaza, Road } from "../../nav/road";
import type { Rect, Vec2 } from "../../types";

/**
 * L1 Agent Office (owner decisions D1 and D7, 2026-10-18; the south wing, 2026-10-20; ten desks, 2026-10-21): its own
 * wing of the L1 slab south of the Lobby, reached by a lead road from the Lobby plaza into a wing plaza, with two curved
 * console rows of five desks (a Rover behind each, facing the plaza): the front row on the floor, the back row a second
 * arc behind it on a riser, then 4.5 u of open floor to a tall screen wall on the wing's south edge (owner request
 * 2026-10-20: a higher wall, more space between the console and the wall).
 * Pure and import-light: config.ts reads it (`LOBBY.officeWing`, obstacles, camera column, stops, the view zone,
 * the road), the main-path `OfficeMount` draws the furniture shell from it, and the lazy office chunk places the
 * rest. tests/unit/lobby-office.test.ts asserts every clearance, tests/unit/office-rows-visibility.test.ts the back
 * row's visibility from the office stop.
 */

/** Resolves a key of the `office` messages namespace (Experience passes its translator for that namespace down to the Lobby). */
export type OfficeTranslate = (key: string, values?: Record<string, string | number>) => string;

/**
 * The wing's depth from S (`OFFICE_WING.depth`): the wall line, the corners and the obstacles derive from it. The arc
 * centre (11) plus the back row's Rover radius (15.2) and footprint (1), 4.5 u of open floor and the wall frame (0.3).
 */
const WING_DEPTH = 32;

/**
 * The wing as offsets from S, the Lobby slab's south edge (`LOBBY.bounds.maxZ`): config.ts imports this module, so
 * it cannot import config.ts; `officeWing(S)` builds `LOBBY.officeWing` there, the one source every reader uses.
 * x values are absolute (the stop's axis is x 3, inside the Lobby plaza's x -3 to 9 window), z values add to S.
 */
export const OFFICE_WING = {
  /**
   * Slab rect: x -12 to 18 (6 u east of the observatory's edge at x -18), S to S + 32: the arc centre (11) plus the back
   * row's Rover radius (15.2) and footprint (1), 4.5 u of open floor behind its middle Rover (owner request 2026-10-20:
   * more space between the console and the wall) and the wall frame (0.3).
   */
  minX: -12,
  maxX: 18,
  depth: WING_DEPTH,
  /** The axis of the lead road, the plaza, the stop and the desk arc. */
  x: 3,
  /** Lead road: 8 u wide, from the Lobby plaza south of the lane ring (S - 8) to 4.5 u inside the wing plaza (S + 6). */
  lead: { width: 8, from: -8, to: 6 },
  /** Wing plaza (S + 1.5 to S + 17.5): it stops short of the end desks, which reach forward on both sides of the stop. */
  plaza: { z: 9.5, w: 18, d: 16 },
  /** The stop stands in the concave front of the row, 5.5 u from the arc centre toward the desks: the follow camera's look target lands near the wall. */
  stop: 16.5,
  /**
   * Desk arc centre (both rows): the back row's middle Rover's back (S + 27.2) stands 4.5 u in front of the wall frame
   * (S + 31.7), the front row's (S + 24.2) 7.5 u.
   */
  arc: 11,
  /** The screen wall's centre line, 0.15 u in front of the wing's south edge (its footprint reaches back to it). */
  wall: WING_DEPTH - 0.15,
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

/** One console row: desks on an arc of `deskRadius` around the wing's arc centre, Rovers behind them, on a floor `lift` u high. */
export interface OfficeRow {
  deskRadius: number;
  roverRadius: number;
  /**
   * The row's desk width (tangential): it closes the row's angle step at the desks' back edge,
   * `2 (deskRadius + desk.d / 2) tan(step / 2)`, rounded up, so neighbours meet there without overlapping along the depth.
   */
  deskW: number;
  /**
   * Desk angles (degrees from +z toward +x), the row's first slot at the east end: the stop camera looks toward +z, so
   * +x is on the left of the screen and the row's first desk is its leftmost Rover from the office stop, like the drawer's list.
   */
  angles: readonly number[];
  lift: number;
}

export const OFFICE = {
  /**
   * The two console rows (owner decision 2026-10-21): slots 0 to 4 the front row, on the floor (unchanged), slots 5 to 9
   * the back row, a second arc 3 u farther out on a 0.9 u riser. The back row's desks start where a front Rover's
   * footprint ends docked (12.2 + 1 + 0.35 = 13.55 = 14 - 0.45); its 13 degree step keeps both rows' end boxes 6 u from
   * the wing's side edges (the riser's end block reaches 8.76 u from the axis). Each row's desks meet at their back
   * edge (`deskW`: 2 (11 + 0.45) tan 10 deg = 4.04 on the front row, 2 (14 + 0.45) tan 6.5 deg = 3.29 on the back row),
   * one continuous console per row; seen from the office stop every back-row face and desk screen stands clear over the
   * front row (tests/unit/office-rows-visibility.test.ts).
   */
  rows: [
    { deskRadius: 11, roverRadius: 12.2, deskW: 4.05, angles: [40, 20, 0, -20, -40], lift: 0 },
    { deskRadius: 14, roverRadius: 15.2, deskW: 3.3, angles: [26, 13, 0, -13, -26], lift: 0.9 },
  ] as readonly OfficeRow[],
  /**
   * The back row's riser: one turned block per back slot, from `lip` u in front of its desk to the back of its Rover's
   * footprint (past a docked Rover's treads), `w` wide: neighbours meet at the back edge (2 x 16.2 tan 6.5 deg = 3.69)
   * and overlap in front of it, so no floor shows between them.
   */
  riser: { lip: 0.1, w: 3.7 },
  /** Radial depth, top height (over the row's floor), top slab and leg thickness (the width is per row, `OfficeRow.deskW`). */
  desk: { d: 0.9, top: 0.95, slab: 0.08, leg: 0.12 },
  rover: { radius: 1 },
  /**
   * The screen (17 x 5.2 u, the wall canvas's 1280 x 392 aspect, bottom at y 1.2: over the desks and the Rovers' heads
   * from the office stop) inside a frame `frame` u wide, `t` thick, facing north (`OfficeWing.wall`).
   */
  wall: { w: 17, h: 5.2, bottom: 1.2, t: 0.3, frame: 0.2 },
  /**
   * The CI tower (south-east corner): a slim LED-lane column (owner decision 2026-10-20), 1.2 u square and 9 u tall, its
   * lane matrix on the stop-facing face (stage B lights it from v2 data), on a low floor pad over the corner; the ship dock
   * (south-west corner) is a low floor pad too. The pads keep the corners' obstacle rects. The dock's stack and deploy
   * beam stand `inward` u from the corner's middle toward the console (owner decision 2026-10-21), so from the desktop
   * office stop the beam clears the floor menu panel; the corner itself stays (it touches the end box and the wing's
   * edges: anything less than touching would leave a gap under the space rules' 6 u).
   */
  tower: { column: 1.2, h: 9, plinth: 0.1 },
  dock: { pad: 0.1, inward: 1.3 },
  /**
   * `L1:office` view zone per camera class (zoom, pitch as an offset from the rig's elevation, look offset) and the half
   * size of its area around the stop. From the stop the office fills the frame (owner decisions 2026-10-20 and 2026-10-21,
   * with the ten chips in a row under the HUD's top bar): each class takes the view closest to the wall's top 12% to 15%
   * from the top edge with both console rows, the whole wall, every Rover's head (the front row's under the screen) and
   * the visitor's Rover in frame, at the same elevation as before (tests/unit/office-view.test.ts measures them):
   * - desktop: the CI tower column and the dock pad in frame too; the wall's top at 15%, both rows from 38.6% down; the
   *   look target rises 1.15 u (`up`) and holds through a hand zoom (`hold`); a hand zoom in (the near pose) raises it to
   *   4 u (`near`), so the wall's top stands at 15.9%, under the near chip row (66 px plus a 40 px chip) by 8 px or more
   *   from 720 px tall;
   * - tablet (landscape phones and small landscape tablets): the wall's top at 17.7%, under the HUD's top bar on 844 x 390
   *   and the chip row on 960 x 640, both rows 37.7% to 62.9% down, the tower and the dock in frame, the plain aim;
   * - mobile (portrait screens): width bound (the whole wall and both rows across 390 px, every Rover's head in frame with
   *   the rover anywhere in the stop's zone): the wall's top at 14.9%, both rows 29.5% to 46.9% down; the look target
   *   moves 3.75 u toward the camera, and a hand zoom hands the framing back there (the offset eases out).
   * A `pitch` also opts into the turn-back on exit: the tilt levels again when the rover leaves the stop.
   */
  view: {
    desktop: { zoom: 1.285, pitch: 0.26, lookOffset: { up: 1.15, hold: true, near: { zoom: 1.2, up: 4 } } },
    tablet: { zoom: 1.5, pitch: 0.35 },
    mobile: { zoom: 1.42, pitch: 0.2, lookOffset: { forward: -3.75 } },
    half: { x: 2, z: 1.4 },
  },
} as const;

export const OFFICE_ROOM = "L1:office" as RoomId;
export const OFFICE_GITHUB_ROOM = "L1:office-github" as RoomId;
export const OFFICE_CI_ROOM = "L1:office-ci" as RoomId;
export const officeDeskRoom = (slot: number): RoomId => `L1:office-desk-${slot + 1}` as RoomId;
/** Seats over both rows (`OFFICE_SEATS` in the office protocol, kept literal here so the layout imports no protocol module). */
export const OFFICE_SEAT_COUNT = OFFICE.rows.reduce((n, r) => n + r.angles.length, 0);
export const OFFICE_ROOMS: readonly RoomId[] = [OFFICE_ROOM, OFFICE_GITHUB_ROOM, OFFICE_CI_ROOM, ...Array.from({ length: OFFICE_SEAT_COUNT }, (_, slot) => officeDeskRoom(slot))];

/** The office rooms have no route of their own (they keep /{locale}, like the Visitor Observatory). */
export function isOfficeRoom(room: string | null | undefined): boolean {
  return Boolean(room) && (room === OFFICE_ROOM || room!.startsWith("L1:office-"));
}

export interface OfficeSlot {
  slot: number;
  /** The console row: 0 the front row (slots 0 to 4), 1 the back row on the riser (slots 5 to 9). */
  row: number;
  /** The row's floor height (u over the L1 floor): 0 on the front row, the riser's top on the back row. */
  lift: number;
  /** The row's desk width (`OfficeRow.deskW`). */
  deskW: number;
  /** Angle from +z toward +x (radians). */
  theta: number;
  /** Turn of the desk and its Rover (three `rotation.y`): forward (sin, cos) points at the arc centre. */
  yaw: number;
  desk: Vec2;
  rover: Vec2;
  /** Axis-aligned box of the turned desk, the Rover's circle and, on the back row, its riser block. */
  rect: Rect;
}

/** A turned block in plan: its centre, width across (local x), depth along the radius (local z) and turn. */
export interface OfficeBlock {
  center: Vec2;
  w: number;
  d: number;
  yaw: number;
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

/** The axis-aligned box of a turned block. */
export function blockRect(b: OfficeBlock): Rect {
  const h = turnedHalf(b.w, b.d, b.yaw);
  return { minX: b.center.x - h.x, maxX: b.center.x + h.x, minZ: b.center.z - h.z, maxZ: b.center.z + h.z };
}

/**
 * A back-row slot's riser block (null on the front row): `OFFICE.riser.w` wide, radially from `OFFICE.riser.lip` in
 * front of its desk to the back of its Rover's footprint.
 */
export function officeRiser(w: OfficeWing, row: OfficeRow, theta: number): OfficeBlock | null {
  if (row.lift <= 0) return null;
  const front = row.deskRadius - OFFICE.desk.d / 2 - OFFICE.riser.lip;
  const back = row.roverRadius + OFFICE.rover.radius;
  return { center: onArc(w, theta, (front + back) / 2), w: OFFICE.riser.w, d: back - front, yaw: theta + Math.PI };
}

/** Both rows' slots, the front row first (slots 0 to 4, east to west), then the back row (slots 5 to 9, east to west). */
export function officeSlots(w: OfficeWing): OfficeSlot[] {
  return OFFICE.rows.flatMap((row, r) => {
    const first = OFFICE.rows.slice(0, r).reduce((n, x) => n + x.angles.length, 0);
    return row.angles.map((deg, i): OfficeSlot => {
      const theta = deg * DEG;
      const desk = onArc(w, theta, row.deskRadius);
      const rover = onArc(w, theta, row.roverRadius);
      const yaw = theta + Math.PI;
      const h = turnedHalf(row.deskW, OFFICE.desk.d, yaw);
      const rad = OFFICE.rover.radius;
      const rect = {
        minX: Math.min(desk.x - h.x, rover.x - rad),
        maxX: Math.max(desk.x + h.x, rover.x + rad),
        minZ: Math.min(desk.z - h.z, rover.z - rad),
        maxZ: Math.max(desk.z + h.z, rover.z + rad),
      };
      const riser = officeRiser(w, row, theta);
      if (riser) {
        const b = blockRect(riser);
        rect.minX = Math.min(rect.minX, b.minX);
        rect.maxX = Math.max(rect.maxX, b.maxX);
        rect.minZ = Math.min(rect.minZ, b.minZ);
        rect.maxZ = Math.max(rect.maxZ, b.maxZ);
      }
      return { slot: first + i, row: r, lift: row.lift, deskW: row.deskW, theta, yaw, desk, rover, rect };
    });
  });
}

/** The slots of console row `row` (0 front, 1 back). */
export const rowSlots = (slots: readonly OfficeSlot[], row: number): OfficeSlot[] => slots.filter((s) => s.row === row);

/** The wall frame's footprint, reaching back to the wing's south edge (no sliver of floor behind it). */
export function officeWallRect(w: OfficeWing): Rect {
  const { wall } = OFFICE;
  return { minX: w.wall.x - wall.w / 2 - wall.frame, maxX: w.wall.x + wall.w / 2 + wall.frame, minZ: w.wall.z - wall.t / 2, maxZ: w.rect.maxZ };
}

/**
 * The console's end boxes, flush with the wing's south edge: the front row's end desk and Rover on that side, reaching out
 * over the back row's end (its desk, Rover and riser block) where that stands wider; never in toward the middle, so the
 * floor in front of desks 2 and 4 stays open (the middle box covers the back row's inner part).
 */
function officeEnds(w: OfficeWing): { east: Rect; west: Rect } {
  const slots = officeSlots(w);
  const rows = OFFICE.rows.map((_, r) => rowSlots(slots, r));
  const [east, west] = [rows[0][0].rect, rows[0][rows[0].length - 1].rect];
  return {
    east: { ...east, maxX: Math.max(...rows.map((r) => r[0].rect.maxX)), maxZ: w.rect.maxZ },
    west: { ...west, minX: Math.min(...rows.map((r) => r[r.length - 1].rect.minX)), maxZ: w.rect.maxZ },
  };
}

/** The south-east corner beside the east row box: touches it and the wing's east and south edges (SPACE_RULES allow touching). */
export function officeTower(w: OfficeWing): Rect {
  const { east } = officeEnds(w);
  return { minX: east.maxX, maxX: w.rect.maxX, minZ: east.minZ, maxZ: w.rect.maxZ };
}

/** The south-west corner beside the west row box, mirrored. */
export function officeDock(w: OfficeWing): Rect {
  const { west } = officeEnds(w);
  return { minX: w.rect.minX, maxX: west.minX, minZ: west.minZ, maxZ: w.rect.maxZ };
}

/**
 * The tower column's centre (the crew's look target): 1.5 u in from the corner's east and north edges, so the column
 * (turned toward the stop, reaching about 0.8 u) stays on the plinth and, from the office stop, in frame on desktops
 * (tests/unit/office-view.test.ts).
 */
export function officeTowerColumn(w: OfficeWing): Vec2 {
  const r = officeTower(w);
  return { x: r.maxX - 1.5, z: r.minZ + 1.5 };
}

/** The tower column's turn (three `rotation.y`): its lane face looks at the office stop. */
export function officeTowerYaw(w: OfficeWing): number {
  const c = officeTowerColumn(w);
  return Math.atan2(w.stop.x - c.x, w.stop.z - c.z);
}

/**
 * Where the dock's stack and the deploy beam stand: `OFFICE.dock.inward` u east of the corner's middle (toward the
 * console), still over the pad: the beam (1.1 u radius) keeps 0.6 u and the dock ring (1.6 u) 0.1 u inside the corner
 * (tests/unit/lobby-office.test.ts).
 */
export function officeDockPad(w: OfficeWing): Vec2 {
  const r = officeDock(w);
  return { x: (r.minX + r.maxX) / 2 + OFFICE.dock.inward, z: (r.minZ + r.maxZ) / 2 };
}

/**
 * Navgrid obstacles, flush with the wing's south edge: each end of the console (both rows' end desks and Rovers) as one
 * box, the middle as the box between them, then the wall, the CI tower and the ship dock. The floor between the back
 * row and the wall (4.5 u behind its middle Rover, more behind its ends) is open to the eye but closed to the rover: the
 * boxes reach back to the wall, so no drive ends up behind the console. Neighbouring desks touch (each row is continuous), so the boxes touch too;
 * the two end boxes keep the middle box's width (about 10 u) apart and 6 u from the wing's side edges, and the tower and
 * the dock fill the two corners between them and the side edges (touching both). The middle box starts at the front of
 * desks 2 and 4, so the concave floor around the stop stays open (tests/unit/lobby-office.test.ts measures the hidden floor).
 */
export function officeObstacles(w: OfficeWing): Rect[] {
  const front = rowSlots(officeSlots(w), 0).map((x) => x.rect);
  const { east, west } = officeEnds(w);
  return [
    east,
    { minX: west.maxX, maxX: east.minX, minZ: Math.min(...front.slice(1, -1).map((r) => r.minZ)), maxZ: w.rect.maxZ },
    west,
    officeWallRect(w),
    officeTower(w),
    officeDock(w),
  ];
}

/** Camera collision column: the wall frame. */
export function officeTall(w: OfficeWing): Rect & { h: number } {
  return { ...officeWallRect(w), h: OFFICE.wall.bottom + OFFICE.wall.h + OFFICE.wall.frame };
}

/** Camera collision column: the CI tower's turned column (its axis-aligned box) around `officeTowerColumn`, from the floor to its top (plinth plus column). */
export function officeTowerTall(w: OfficeWing): Rect & { h: number } {
  const c = officeTowerColumn(w);
  const half = turnedHalf(OFFICE.tower.column, OFFICE.tower.column, officeTowerYaw(w));
  return { minX: c.x - half.x, maxX: c.x + half.x, minZ: c.z - half.z, maxZ: c.z + half.z, h: OFFICE.tower.plinth + OFFICE.tower.h };
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
