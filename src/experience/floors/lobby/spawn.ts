import type { Vec2 } from "../../types";

/**
 * The Lobby spawn and the kiosk axis it stands on, apart from `experience/config` so the store reads the
 * spawn without pulling the floor layouts into the Classic bundle. Types only; `config.ts` builds `LOBBY`
 * from these constants.
 */

export const LOBBY_HOLOGRAM = { x: 6, z: 0, radius: 3 } as const;
/** The Lobby slab's south edge (`LOBBY.bounds.maxZ`), where the Agent Office wing joins it (`officeWing`). */
export const LOBBY_SOUTH_EDGE = 21;
/**
 * Visitor Observatory footprint (public visit stats, owner decision 2026-10-14): the south-west corner,
 * flush with the west and south slab edges, between the elevator and the Rover menu kiosk.
 */
export const LOBBY_OBSERVATORY = { minX: -24, maxX: -18, minZ: 14, maxZ: LOBBY_SOUTH_EDGE } as const;
/**
 * The kiosk axis (owner review 2026-10-14: "the rover kiosk not straight line into the circle"): the unit
 * direction from the hologram to the observatory. The kiosk sits on it facing the hologram, its lane spoke
 * runs along it from the ring into the kiosk front, and the session spawn stands on it in front of the
 * screen, so the spawn view looks down one line: hologram, rover, kiosk, observatory.
 */
export const KIOSK_AXIS: Vec2 = (() => {
  const dx = (LOBBY_OBSERVATORY.minX + LOBBY_OBSERVATORY.maxX) / 2 - LOBBY_HOLOGRAM.x;
  const dz = (LOBBY_OBSERVATORY.minZ + LOBBY_OBSERVATORY.maxZ) / 2 - LOBBY_HOLOGRAM.z;
  const l = Math.hypot(dx, dz);
  return { x: dx / l, z: dz / l };
})();
/** Kiosk center distance from the hologram along the axis, its depth (along the axis) and width (the screen). */
export const KIOSK_RADIUS = 19.2;
export const KIOSK_DEPTH = 2;
export const KIOSK_WIDTH = 3.4;
/**
 * The rover stops this far in front of the screen (point-and-go `L1:kiosk:ask-rover`, the session spawn):
 * 0.5 u more than when the kiosk stood square to the grid, because its obstacle is the axis-aligned box
 * of the turned footprint, whose corner reaches toward the stop.
 */
export const KIOSK_STOP_GAP = 3;
const onAxis = (d: number): Vec2 => ({ x: LOBBY_HOLOGRAM.x + KIOSK_AXIS.x * d, z: LOBBY_HOLOGRAM.z + KIOSK_AXIS.z * d });
export const KIOSK_CENTER = onAxis(KIOSK_RADIUS);
/** Owner 2026-10-14: "first rover placement should be infront of his kiosk". */
export const LOBBY_SPAWN = onAxis(KIOSK_RADIUS - KIOSK_DEPTH / 2 - KIOSK_STOP_GAP);
/** The rover faces the kiosk screen at spawn: heading (sin, cos) along the kiosk axis. */
export const LOBBY_SPAWN_HEADING = Math.atan2(KIOSK_AXIS.x, KIOSK_AXIS.z);
