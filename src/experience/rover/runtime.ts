import type { RoverFace, Vec2 } from "../types";

/**
 * Per-frame rover state shared between the director, the rover mesh and the
 * camera. Mutated in useFrame, never read during React render.
 */
export const roverRuntime = {
  x: 0,
  y: 0,
  z: 6,
  heading: Math.PI / 4,
  speed: 0,
  tilt: 0,
  face: "idle" as RoverFace,
  status: undefined as string | undefined,
  /** Time (s) until which the arrival flag is shown. */
  flagUntil: 0,
  flagAt: { x: 0, z: 0 } as Vec2,
  /** Current click-to-move destination, if any. */
  target: null as Vec2 | null,
  hopUntil: 0,
  /** Horizontal camera forward, used for camera-relative steering. */
  cameraForward: { x: -1, z: -1 } as Vec2,
  /** Current camera position (debug and test probe). */
  cameraPosition: [0, 0, 0] as [number, number, number],
  /** Most recent draw call count (dev probe for the per-floor budget). */
  drawCalls: 0,
};
