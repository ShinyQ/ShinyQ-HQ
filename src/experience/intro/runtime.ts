import { Vector2 } from "three";
import type { Rect } from "../types";

/** Shader value for "no reveal": far beyond any floor, so the mask is exactly 1 and both rings exactly 0. */
const REVEAL_OFF = 1e5;

/** Shared, frame-written state of the 3D intro (wake and reveal orbit), read by the floor shaders and scene parts. */
export const introRuntime: {
  active: boolean;
  t: number;
  reveal: number;
  heading: number | null;
  face: "off" | "boot" | null;
  veil: number;
  lit: string[];
  skipped: boolean;
} = { active: false, t: -1, reveal: Infinity, heading: null, face: null, veil: 0, lit: [], skipped: false };

/** Uniform objects shared by reference by every grid and lane material, so one write reaches them all. */
export const revealUniforms: { uReveal: { value: number }; uRevealAt: { value: Vector2 } } = {
  uReveal: { value: REVEAL_OFF },
  uRevealAt: { value: new Vector2(0, 0) },
};

export function setReveal(radius: number, at: { x: number; z: number }): void {
  introRuntime.reveal = radius;
  revealUniforms.uReveal.value = Number.isFinite(radius) ? radius : REVEAL_OFF;
  revealUniforms.uRevealAt.value.set(at.x, at.z);
}

export function resetIntroRuntime(): void {
  introRuntime.active = false;
  introRuntime.t = -1;
  introRuntime.heading = null;
  introRuntime.face = null;
  introRuntime.veil = 0;
  introRuntime.lit.length = 0;
  introRuntime.skipped = false;
  setReveal(Infinity, { x: 0, z: 0 });
}

/** Distance on the floor from the rover to the nearest point of `rect` (0 inside): the reveal radius that reaches it. */
export function revealDistance(rover: { x: number; z: number }, rect: Rect): number {
  const dx = Math.max(rect.minX - rover.x, 0, rover.x - rect.maxX);
  const dz = Math.max(rect.minZ - rover.z, 0, rover.z - rect.maxZ);
  return Math.hypot(dx, dz);
}
