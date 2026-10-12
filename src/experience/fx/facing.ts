import type { Vec2 } from "../types";

/**
 * Rotation about the vertical axis that turns a text or plane whose front faces +z toward `viewer` on
 * the floor plane, so it always reads left to right (never mirrored) from wherever the camera stands.
 * Yaw only: the text stays upright. Pure (Vitest runs it in node).
 */
export function yawTowards(from: Vec2, viewer: Vec2): number {
  const dx = viewer.x - from.x;
  const dz = viewer.z - from.z;
  return dx === 0 && dz === 0 ? 0 : Math.atan2(dx, dz);
}
