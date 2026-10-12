import type { Vec2 } from "../types";

/**
 * In-world text and line icons read correctly from any camera yaw (round 5: the camera turns all the
 * way around the rover, L2 included). A sign that faces `yaw` (forward is (sin, cos)) turns half a turn
 * when the camera is behind it, so it never reads mirrored. Pure, so Vitest runs it in node.
 */

/**
 * Hysteresis (u) on the side test: the camera must be this far in front of or behind the sign's plane
 * to turn it, so a sign seen edge-on does not flicker. A distance, not an angle, so far signs that the
 * camera sees at a grazing angle still follow it.
 */
export const READABLE_HYSTERESIS = 0.5;

/**
 * Whether the sign at `at` facing `yaw` should be shown turned around for a camera at `camera`.
 * `flipped` is the current state: it only changes once the camera is clearly on the other side.
 */
export function readableFlip(flipped: boolean, yaw: number, at: Vec2, camera: Vec2): boolean {
  const side = Math.sin(yaw) * (camera.x - at.x) + Math.cos(yaw) * (camera.z - at.z);
  if (flipped) return side < READABLE_HYSTERESIS;
  return side < -READABLE_HYSTERESIS;
}

/** Approximate width (u) of a monospace line, for pivots of right or left anchored mono text. */
export function monoWidth(text: string, fontSize: number, letterSpacing = 0): number {
  return [...text].length * fontSize * (0.6 + letterSpacing);
}
