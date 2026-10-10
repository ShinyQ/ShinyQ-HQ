import { LOBBY } from "../config";
import type { AutopilotRequest } from "../missions/host3d";
import type { RoverFace, Vec2 } from "../types";

/**
 * Per-frame rover state shared between the director, the rover mesh and the
 * camera. Mutated in useFrame, never read during React render.
 */
export const roverRuntime = {
  x: LOBBY.spawn.x as number,
  y: 0,
  z: LOBBY.spawn.z as number,
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
  /** Follow-camera yaw offset from the default angle (debug and test probe). */
  cameraYaw: 0,
  /** L2 rail yaw (limited to RAIL_MAX_YAW). */
  cameraRailYaw: 0,
  /** Current camera position (debug and test probe). */
  cameraPosition: [0, 0, 0] as [number, number, number],
  /** Mission autopilot request (see missions/host3d.ts). */
  autopilot: null as AutopilotRequest | null,
  /** A mission was cancelled: show o_o for 600 ms. */
  cancelFlash: false,
  /** Click-to-move marker: a ring that expands and fades where the floor was clicked (also a test probe). */
  marker: { visible: false, opacity: 0, scale: 1, x: 0, z: 0 },
  /** Most recent draw call count (dev probe for the per-floor budget). */
  drawCalls: 0,
};
