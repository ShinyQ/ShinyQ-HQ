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
  /** Current scrub destination on rail floors, if any (drawn as the target ring). */
  target: null as Vec2 | null,
  hopUntil: 0,
  /** Horizontal camera forward, used for camera-relative steering. */
  cameraForward: { x: -1, z: -1 } as Vec2,
  /** Follow-camera yaw offset from the default angle (debug and test probe). */
  cameraYaw: 0,
  /** L2 yaw offset from the side view, radians, unbounded (round 5). */
  cameraRailYaw: 0,
  /** The view the visitor chose: "first" after zooming in past the closest third-person distance. */
  cameraMode: "third" as "third" | "first",
  /** Drawn blend from third (0) to first person (1); 0 while autopilot, rides, rooms or the hologram hold third person. */
  cameraBlend: 0,
  /** Third-person zoom, 0.6 to 1.5 (test probe). */
  cameraZoom: 1,
  /** First-person look elevation, radians (test probe). */
  cameraLook: 0,
  /** Elevation of the drawn camera above its target, radians (test probe). */
  cameraElevation: 0,
  /** The rover follows a path (autopilot, scrub, mission leg, elevator approach); set by the Director. */
  driving: false,
  /** Current camera position (debug and test probe). */
  cameraPosition: [0, 0, 0] as [number, number, number],
  /** Set by the Director when a teleport moves the rover: the camera cuts to it on the next frame instead of gliding. */
  cameraSnap: false,
  /** Mission autopilot request (see missions/host3d.ts). */
  autopilot: null as AutopilotRequest | null,
  /** A mission was cancelled: show o_o for 600 ms. */
  cancelFlash: false,
  /** Boost level 0 to 1, eased by the Director while Shift or the touch boost button drives the rover. */
  boost: 0,
  /** Boost trail opacity as drawn this frame (0 when hidden or under reduced motion; test probe). */
  trail: 0,
  /** Most recent draw call count (dev probe for the per-floor budget). */
  drawCalls: 0,
  /** Most recent triangle count (dev probe for the per-floor budget). */
  triangles: 0,
};
