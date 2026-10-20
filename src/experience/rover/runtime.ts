import { LOBBY } from "../config";
import type { AutopilotRequest } from "../missions/host3d";
import type { RoverFace, Vec2 } from "../types";
import { IDLE } from "./idle";

/**
 * Per-frame rover state shared between the director, the rover mesh and the
 * camera. Mutated in useFrame, never read during React render.
 */
export const roverRuntime = {
  x: LOBBY.spawn.x as number,
  y: 0,
  z: LOBBY.spawn.z as number,
  heading: LOBBY.spawnHeading as number,
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
  /** The drawn camera holds still: its orbit is not easing and the drawn pose has reached the wanted one (within 0.1 u). */
  cameraSettled: false,
  /** The view zone whose view the camera shows (`holdZone`: entered with motion on, not turned by hand, third person), else null. */
  cameraView: null as string | null,
  /** The camera has come to rest in `cameraView`'s view and holds it (`holdZone`; the office chips wait for it). */
  cameraHeld: false,
  /** The rover follows a path (autopilot, scrub, mission leg, elevator approach); set by the Director. */
  driving: false,
  /** Current camera position (debug and test probe). */
  cameraPosition: [0, 0, 0] as [number, number, number],
  /** Set by the Director when a teleport moves the rover: the camera cuts to it on the next frame instead of gliding. */
  cameraSnap: false,
  /** Manual drive input (keys, joystick) moved the rover this frame; set by the Director (ends the arrival glide). */
  steering: false,
  /** Arrival glide progress 0 to 1 while the camera glides out of the elevator car, -1 otherwise (test probe). */
  arrivalGlide: -1,
  /** Shared rover clock time (s) until which the eyes blink on demand (the intro's landing beat). */
  blinkUntil: 0,
  /** Heading of the horizontal vector from the drawn camera to the rover (`cameraBehindHeading`; test probe). */
  cameraBehind: 0,
  /** Mission autopilot request (see missions/host3d.ts). */
  autopilot: null as AutopilotRequest | null,
  /** A mission was cancelled: show o_o for 600 ms. */
  cancelFlash: false,
  /** Boost level 0 to 1, eased by the Director while Shift or the touch joystick's boost drives the rover. */
  boost: 0,
  /** Boost trail opacity as drawn this frame (0 when hidden or under reduced motion; test probe). */
  trail: 0,
  /** Speed streak opacity as drawn this frame (0 when hidden; test probe). */
  streaks: 0,
  /** Wheel sparks alive this frame (test probe). */
  sparks: 0,
  /** Boost meshes drawn this frame: trail, streaks, sparks (0 to 3; 0 when not boosting). */
  boostFx: 0,
  /** Body squat or dip (radians, negative is nose up) and extra lean from the boost (test probes). */
  boostPitch: 0,
  boostRoll: 0,
  /** Camera FOV kick (degrees) and follow distance factor from the boost (test probes). */
  boostFov: 0,
  boostPull: 1,
  /**
   * Seconds of stillness before the rover plays an idle sequence (`idle.ts`). Infinite under
   * `navigator.webdriver`, so existing visual and screenshot captures never catch an idle hop; tests
   * opt in by setting `window.__hq.rover.idleDelay`.
   */
  idleDelay: (typeof navigator !== "undefined" && navigator.webdriver ? Number.POSITIVE_INFINITY : IDLE.delay) as number,
  /** The idle step playing now (look, blink, hop, spin or beep), null when not idling (test probe). */
  idle: null as string | null,
  /** Idle head yaw and body spin (radians) as drawn this frame (test probes). */
  idleYaw: 0,
  idleSpin: 0,
  /** Whole-frame draw calls (scene plus post passes), mirrored every 0.1 s; the split is in `__hq.perf.stats`. */
  drawCalls: 0,
  /** Whole-frame triangles, mirrored every 0.1 s. */
  triangles: 0,
};
