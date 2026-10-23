import type { Vec2 } from "../types";

/**
 * The follow yaw (offset from the default angle) whose camera looks along `dir` (floor plane): the default
 * camera sits along (+1, +1) and looks along (-1, -1), and `orbitOffset` turns it by the yaw. Import-free
 * (types only), so floor layouts that config.ts reads can use it.
 */
export function yawLooking(dir: Vec2): number {
  return Math.atan2(dir.z - dir.x, -(dir.x + dir.z));
}

/**
 * Elevator framing (owner 2026-10-23, "serong kanan"): going into the elevator and coming out of it, the camera stands
 * behind the rover and this far to its right (radians), so the floor's main axis runs off to the upper right of the view.
 * A positive yaw offset swings the camera to the right of the direction it looks along.
 */
export const ELEVATOR_DIAGONAL = (35 * Math.PI) / 180;

/** Follow yaw of the arrival view: behind and to the right of a rover heading east out of the car. */
export const ARRIVAL_YAW = yawLooking({ x: 1, z: 0 }) + ELEVATOR_DIAGONAL;
/** Follow yaw while the rover drives to the shaft and rides: behind and to the right of a rover heading west into the car. */
export const DEPARTURE_YAW = yawLooking({ x: -1, z: 0 }) + ELEVATOR_DIAGONAL;
/** L2 rail yaw of the arrival view: due west of the rover (-PI / 2), turned to its right. */
export const ARRIVAL_RAIL_YAW = -Math.PI / 2 + ELEVATOR_DIAGONAL;
/** L2 rail yaw on the way into the car: due east of the rover (PI / 2), turned to its right. */
export const DEPARTURE_RAIL_YAW = Math.PI / 2 + ELEVATOR_DIAGONAL;
