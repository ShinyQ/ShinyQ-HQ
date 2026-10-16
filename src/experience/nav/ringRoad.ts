import type { Rect, Vec2 } from "../types";

/**
 * A closed ring road around a core obstacle in the middle of a round plaza (the L3 Tech Reactor and the
 * L4 Topic Constellation): roads arriving at the plaza end on the ring, never at its center, so every
 * route (point-and-go, missions) drives around the core. Pure.
 */

/** `segments` points on a circle of `radius`, vertex 0 due north (-z), clockwise seen from above. */
export function ringRoadPoints(center: Vec2, radius: number, segments: number): Vec2[] {
  return Array.from({ length: segments }, (_, k) => {
    const a = (k / segments) * Math.PI * 2;
    return { x: round(center.x + Math.sin(a) * radius), z: round(center.z - Math.cos(a) * radius) };
  });
}

/** Where a road coming from `from` meets the ring: on the circle toward `from`. */
export function ringRoadEntry(center: Vec2, from: Vec2, radius: number): Vec2 {
  const dx = from.x - center.x;
  const dz = from.z - center.z;
  const len = Math.hypot(dx, dz) || 1;
  return { x: round(center.x + (dx / len) * radius), z: round(center.z + (dz / len) * radius) };
}

/** The core's square footprint (an obstacle for the navgrid and a camera column). */
export function coreRect(center: Vec2, half: number): Rect {
  return { minX: center.x - half, maxX: center.x + half, minZ: center.z - half, maxZ: center.z + half };
}

const round = (v: number) => Math.round(v * 1e6) / 1e6;
