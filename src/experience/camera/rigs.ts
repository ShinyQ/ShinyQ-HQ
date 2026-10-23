import type { FloorId } from "@/content/schema";
import type { Vec2, ViewportClass } from "../types";

export type Vec3 = [number, number, number];
/** `first` is only a fog key (first person); `selectRig` never returns it. */
export type RigKind = "intro" | "follow" | "rail" | "focus" | "first";

export interface CameraPose {
  position: Vec3;
  target: Vec3;
  fov: number;
}

/** Follow rig per camera class (appendix 03 section 2). */
export const FOLLOW: Record<ViewportClass, { fov: number; offset: Vec3 }> = {
  desktop: { fov: 40, offset: [16, 18, 16] },
  tablet: { fov: 42, offset: [16, 18, 16] },
  mobile: { fov: 50, offset: [18, 24, 18] },
};

/** How far ahead of the rover (along the camera's forward) the follow camera looks, per camera class. */
export const FOLLOW_LOOK_AHEAD: Record<ViewportClass, number> = { desktop: 6, tablet: 6, mobile: 5 };

/**
 * Rail rig for the L2 Career Road: camera at (x, y, z) looking at (x + 4, 0, 0). High and far
 * enough that both room rows of a year plaza (about 20 u either side of the road) stay in frame.
 */
export const RAIL: Record<ViewportClass, { fov: number; y: number; z: number }> = {
  desktop: { fov: 40, y: 22, z: 30 },
  tablet: { fov: 45, y: 24, z: 34 },
  mobile: { fov: 55, y: 26, z: 38 },
};
export const RAIL_LOOK_AHEAD = 4;

export const SPRING_HALF_LIFE = 0.18;
/**
 * Absolute elevation limits for third-person cameras (owner request, round 5): from just above the
 * floor (about 3 degrees) to near top-down (about 83 degrees). Never under the floor.
 */
export const PITCH_LIMITS = [0.06, 1.45] as const;

export function selectRig(phase: string, floor: FloorId): RigKind {
  if (phase === "boot" || phase === "intro") return "intro";
  return floor === "L2" ? "rail" : "follow";
}

/**
 * Spherical orbit offset: `yaw` (unbounded) turns `offset` around the vertical axis; `pitch` raises or
 * lowers it from its own elevation, clamped to PITCH_LIMITS. Exactly `offset` at yaw 0 and pitch 0.
 */
export function orbitOffset(offset: Vec3, yaw: number, pitch: number): Vec3 {
  const [ox, oy, oz] = offset;
  const ground = Math.hypot(ox, oz);
  const base = Math.atan2(oy, ground);
  const elevation = Math.max(PITCH_LIMITS[0], Math.min(PITCH_LIMITS[1], base + pitch));
  const radius = Math.hypot(ground, oy);
  // Exact default offset when the pitch is unchanged.
  const horizontal = elevation === base ? 1 : (radius * Math.cos(elevation)) / ground;
  const vertical = elevation === base ? oy : radius * Math.sin(elevation);
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return [(ox * c + oz * s) * horizontal, vertical, (-ox * s + oz * c) * horizontal];
}

/**
 * Follow camera orbiting `target` (see `orbitOffset`). A view zone's look offset (`ViewZone.lookOffset`, eased by the
 * orbit) then moves only the look target, the camera stays: `lookForward` along the camera's horizontal forward,
 * `lookUp` along y, `lookRight` along the camera's horizontal right, all scaled by `zoom` like the camera offset, so the
 * view turns by the same angle at any distance. Without one (all 0) the pose is exactly the plain orbit, the `target`
 * array itself included.
 */
export function followPose(cls: ViewportClass, target: Vec3, yaw = 0, zoom = 1, pitch = 0, lookForward = 0, lookUp = 0, lookRight = 0): CameraPose {
  const { fov, offset } = FOLLOW[cls];
  const [rx, ry, rz] = orbitOffset(offset, yaw, pitch);
  const position: Vec3 = [target[0] + rx * zoom, target[1] + ry * zoom, target[2] + rz * zoom];
  if (lookForward === 0 && lookUp === 0 && lookRight === 0) return { position, target, fov };
  const f = followForward(cls, yaw);
  // The camera's horizontal right of forward (x, z) is (-z, x).
  const x = f.x * lookForward - f.z * lookRight;
  const z = f.z * lookForward + f.x * lookRight;
  return {
    position,
    target: [target[0] + x * zoom, target[1] + lookUp * zoom, target[2] + z * zoom],
    fov,
  };
}

/** Default elevation of a rig's camera above its target, radians. */
export function baseElevation(cls: ViewportClass, rig: "follow" | "rail"): number {
  if (rig === "rail") return Math.atan2(RAIL[cls].y, RAIL[cls].z);
  const [ox, oy, oz] = FOLLOW[cls].offset;
  return Math.atan2(oy, Math.hypot(ox, oz));
}

/** Pitch offsets (from the rig's default elevation) that keep its camera inside PITCH_LIMITS. */
export function pitchRange(cls: ViewportClass, rig: "follow" | "rail"): [number, number] {
  const base = baseElevation(cls, rig);
  return [PITCH_LIMITS[0] - base, PITCH_LIMITS[1] - base];
}

/** Horizontal forward of the follow camera at `yaw` (the same as `forwardOf(followPose(...))`). */
export function followForward(cls: ViewportClass, yaw: number): Vec2 {
  const [ox, , oz] = FOLLOW[cls].offset;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const x = -(ox * c + oz * s);
  const z = -(-ox * s + oz * c);
  const len = Math.hypot(x, z) || 1;
  return { x: x / len, z: z / len };
}

/** Half width of the L2 road: inside it the rail keeps the spec pose. */
export const RAIL_DEADBAND = 4;

/** How far the rail slides in z so a rover off the road (|z| > 4 from its axis) stays in frame. */
export function railShift(roverZ: number): number {
  const out = Math.abs(roverZ) - RAIL_DEADBAND;
  return out > 0 ? Math.sign(roverZ) * out : 0;
}

/**
 * L2 camera (round 5: a full orbit). At yaw 0 and pitch 0 it is the spec's side view, looking at
 * (roverX + 4, floor, road). `yaw` (unbounded) swings the camera and its look-ahead around the rover;
 * `pitch` tilts it within PITCH_LIMITS. `axisZ` is the road's z at the rover (the Career Road
 * meanders), so the camera follows the road's curves. The look-ahead runs to the screen's right;
 * `aheadAlongView` runs it into the screen instead (`railForward`), which centers the rover when the rail
 * looks down the road (the arrival view behind the rover). `lookRight` (u, scaled by `zoom`) then moves only the look
 * target along the camera's horizontal right, like a follow zone's `LookOffset.right`.
 */
export function railPose(
  cls: ViewportClass,
  roverX: number,
  floorY: number,
  zoom = 1,
  roverZ = 0,
  yaw = 0,
  axisZ = 0,
  pitch = 0,
  aheadAlongView = false,
  lookRight = 0,
): CameraPose {
  const { fov, y, z } = RAIL[cls];
  const shift = axisZ + railShift(roverZ - axisZ);
  const [ox, oy, oz] = orbitOffset([0, y, z], yaw, pitch);
  const ahead = aheadAlongView ? railForward(yaw) : { x: Math.cos(yaw), z: -Math.sin(yaw) };
  // The camera's horizontal right is (-forward z, forward x) = (cos yaw, -sin yaw).
  const side = lookRight * zoom;
  return {
    position: [roverX + ox * zoom, floorY + oy * zoom, shift + oz * zoom],
    target: [roverX + RAIL_LOOK_AHEAD * ahead.x + Math.cos(yaw) * side, floorY, shift + RAIL_LOOK_AHEAD * ahead.z - Math.sin(yaw) * side],
    fov,
  };
}

/** Steering forward on L2: straight away from the camera, so W drives into the view and D along the road at yaw 0. */
export function railForward(yaw: number): Vec2 {
  return { x: -Math.sin(yaw), z: -Math.cos(yaw) };
}

/** A horizontal swipe on L2 moves toward the side of the screen it pulls from; turned around, the road runs the other way. */
export function scrubSign(railYaw: number): 1 | -1 {
  return Math.cos(railYaw) < 0 ? -1 : 1;
}

/** Exponential smoothing factor for a critically damped follow with the given half-life. */
export function springFactor(dt: number, halfLife = SPRING_HALF_LIFE): number {
  return 1 - Math.pow(2, -dt / halfLife);
}

/** Horizontal forward direction of a camera pose. */
export function forwardOf(pose: CameraPose): Vec2 {
  const x = pose.target[0] - pose.position[0];
  const z = pose.target[2] - pose.position[2];
  const len = Math.hypot(x, z) || 1;
  return { x: x / len, z: z / len };
}

/** Hologram fly-in (appendix 03 section 2): eye height 4 u, at least 9 u in front of the stage. */
export const HOLOGRAM_RIG: Record<ViewportClass, { fov: number; distance: number; eye: number }> = {
  desktop: { fov: 35, distance: 9, eye: 4 },
  tablet: { fov: 42, distance: 9, eye: 4 },
  mobile: { fov: 50, distance: 9, eye: 4 },
};
/** Share of the view width the diagram may use (the result cards take the rest). */
export const HOLOGRAM_FILL = { landscape: 0.62, portrait: 0.9 } as const;

/**
 * Camera pose for the hologram view: in front of the board along `facing` (unit vector from the
 * board toward the viewer), pulled back until a board of `boardWidth` fits the view.
 */
export function hologramPose(cls: ViewportClass, board: Vec3, facing: Vec2, aspect: number, boardWidth: number, floorY: number): CameraPose {
  const { fov, distance, eye } = HOLOGRAM_RIG[cls];
  const fill = aspect >= 1 ? HOLOGRAM_FILL.landscape : HOLOGRAM_FILL.portrait;
  const halfH = Math.tan(((fov / 2) * Math.PI) / 180);
  const fit = boardWidth / 2 / (halfH * Math.max(0.1, aspect) * fill);
  const d = Math.max(distance, fit);
  return {
    position: [board[0] + facing.x * d, floorY + eye + (d - distance) * 0.12, board[2] + facing.z * d],
    target: board,
    fov,
  };
}

/** Screen shift during the hologram view so the result cards do not cover the diagram. */
export function hologramShift(aspect: number): { x: number; y: number } {
  return aspect >= 1 ? { x: 0.1, y: 0 } : { x: 0, y: 0.14 };
}
