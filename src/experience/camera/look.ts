import type { Vec2 } from "../types";

/**
 * The follow yaw (offset from the default angle) whose camera looks along `dir` (floor plane): the default
 * camera sits along (+1, +1) and looks along (-1, -1), and `orbitOffset` turns it by the yaw. Import-free
 * (types only), so floor layouts that config.ts reads can use it.
 */
export function yawLooking(dir: Vec2): number {
  return Math.atan2(dir.z - dir.x, -(dir.x + dir.z));
}
