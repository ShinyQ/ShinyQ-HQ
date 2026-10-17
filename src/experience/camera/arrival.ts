import type { FloorId } from "@/content/schema";
import { SHAFT_EAST_FACE } from "../config";
import { easeInOutCubic, type RideStage } from "../tower/elevator";
import type { ViewportClass } from "../types";
import { followForward, followPose, FOLLOW_LOOK_AHEAD, railPose, type CameraPose, type Vec3 } from "./rigs";
import { followOffsetScale } from "./offset";

/**
 * Arrival glide (Round 8 J): every floor's elevator door faces east, and the camera starts over the rover's
 * shoulder as it leaves the car, then glides to the floor's settled view. Pure math, no React or three.
 */
export const ARRIVAL_GLIDE = { duration: 1.5, start: { back: 2.4, up: 2.1, side: 0.7, look: 10, belowHorizon: 4 } } as const;

/** The rover leaves the car heading east; rover forward is `(sin h, cos h)`, so east is PI / 2. */
export const ARRIVAL_HEADING = Math.PI / 2;
/** Follow yaw that looks east (camera west of the rover). */
export const LOOK_EAST_YAW = (-3 * Math.PI) / 4;

/** The arrival camera stays this far east of the shaft's east face so the shaft never blocks the view. */
export const SHAFT_CLEAR_X = SHAFT_EAST_FACE + 1.5;

/**
 * Over-the-right-shoulder camera: behind the rover along its heading, a little to its right (as seen looking
 * along the heading, which is `(-cos h, sin h)` on the floor) and above it, looking `look` ahead of the rover.
 * It pitches down so the top edge of its view (vertical `fov`, degrees) sits `belowHorizon` degrees under the
 * horizon: the far floor and the sky stay out of the frustum, which keeps the ride's draw calls and triangles
 * in budget. `rover` is the rover's floor position (y is the floor height).
 */
export function shoulderPose(rover: Vec3, heading: number, fov: number): CameraPose {
  const { back, up, side, look, belowHorizon } = ARRIVAL_GLIDE.start;
  const fx = Math.sin(heading);
  const fz = Math.cos(heading);
  const rx = -fz;
  const rz = fx;
  const pitch = ((fov / 2 + belowHorizon) * Math.PI) / 180;
  const y = rover[1] + up;
  return {
    position: [rover[0] - fx * back + rx * side, y, rover[2] - fz * back + rz * side],
    target: [rover[0] + fx * look, y - Math.hypot(back + look, side) * Math.tan(pitch), rover[2] + fz * look],
    fov,
  };
}

/** Eased glide progress 0..1 after `t` seconds. */
export function glideProgress(t: number): number {
  return easeInOutCubic(Math.max(0, Math.min(1, t / ARRIVAL_GLIDE.duration)));
}

/** A running arrival glide: seconds since it started and the destination floor. */
export interface GlideState {
  t: number;
  to: FloorId;
}

/** What one frame of the glide lifecycle reads. */
export interface GlideInput {
  dt: number;
  /** Stage of the stored ride this frame and on the previous frame (null without a ride). */
  stage: RideStage | null;
  prevStage: RideStage | null;
  /** The ride's destination (null without a ride). */
  to: FloorId | null;
  reduced: boolean;
  /** The destination has an arrival view zone. */
  hasZone: boolean;
  /** Visitor input or a state that takes the view: steering, a key turn, a beam, or a phase other than explore or elevator. */
  interrupted: boolean;
  /** The rover is still rolling on to the arrival point (or about to). */
  rollingOn: boolean;
}

/**
 * One frame of the arrival glide's lifecycle. It starts when the car doors start to open (never under reduced
 * motion, which has no doors stage), then advances by `dt`. It ends at once on input, a new ride or a beam;
 * otherwise once a frame at full progress was drawn and the arrival roll-on is over, so the camera stays snapped
 * to the rover at the settled view until it stops (no follow-spring lag behind a rover at autopilot speed).
 * `started` is true on the frame it starts (the caller primes the arrival view then).
 */
export function stepGlide(state: GlideState | null, input: GlideInput): { glide: GlideState | null; started: boolean } {
  const { stage, prevStage, to } = input;
  let glide = state;
  let started = false;
  if (stage === "opening" && prevStage !== "opening" && to !== null && !input.reduced && input.hasZone) {
    glide = { t: 0, to };
    started = true;
  } else if (glide) {
    // The previous frame drew full progress: the follow spring holds the settled view from here, once the rover parked.
    if (glide.t >= ARRIVAL_GLIDE.duration && !input.rollingOn) glide = null;
    else glide = { t: glide.t + input.dt, to: glide.to };
  }
  if (glide && (input.interrupted || stage === "toDoor" || stage === "boarding")) glide = null;
  return { glide, started };
}

const mix = (a: number, b: number, p: number) => a + (b - a) * p;
const mix3 = (a: Vec3, b: Vec3, p: number): Vec3 => [mix(a[0], b[0], p), mix(a[1], b[1], p), mix(a[2], b[2], p)];

/** Blends two poses (position, target and fov) at `p` in 0..1. */
export function glidePose(start: CameraPose, end: CameraPose, p: number): CameraPose {
  return { position: mix3(start.position, end.position, p), target: mix3(start.target, end.target, p), fov: mix(start.fov, end.fov, p) };
}

/** Heading (`atan2(dx, dz)`, forward `(sin h, cos h)`) of the horizontal vector from the camera to the rover. */
export function cameraBehindHeading(camera: Vec3, rover: Vec3): number {
  return Math.atan2(rover[0] - camera[0], rover[2] - camera[2]);
}

/** Rail yaw that puts the L2 camera behind a rover heading east (due west of it). */
export function railYawBehind(): number {
  return -Math.PI / 2;
}

/** Camera x of the settled arrival view for a rover at floor x (z does not matter) at `zoom`. */
function arrivalCameraX(cls: ViewportClass, aspect: number, rig: "follow" | "rail", x: number, zoom: number): number {
  if (rig === "rail") return railPose(cls, x, 0, zoom, 0, railYawBehind(), 0).position[0];
  const forward = followForward(cls, LOOK_EAST_YAW);
  const ahead = FOLLOW_LOOK_AHEAD[cls];
  return followPose(cls, [x + forward.x * ahead, 0, forward.z * ahead], LOOK_EAST_YAW, zoom * followOffsetScale(cls, aspect)).position[0];
}

/**
 * The largest zoom that keeps the arrival camera at `x >= SHAFT_CLEAR_X` for a rover at floor `x` facing
 * east. The camera x is linear in the zoom (the position is the target plus offset times zoom), so two
 * samples solve it exactly.
 */
export function shaftClearZoom(cls: ViewportClass, aspect: number, rig: "follow" | "rail", x: number): number {
  const at0 = arrivalCameraX(cls, aspect, rig, x, 0);
  const slope = arrivalCameraX(cls, aspect, rig, x, 1) - at0;
  if (slope >= 0) return Infinity;
  return (SHAFT_CLEAR_X - at0) / slope;
}
