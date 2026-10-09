import type { FloorId } from "@/content/schema";
import type { Vec2, ViewportClass } from "../types";
import { easeInOutCubic } from "../tower/elevator";

export type Vec3 = [number, number, number];
export type RigKind = "intro" | "follow" | "rail" | "focus";

export interface CameraPose {
  position: Vec3;
  target: Vec3;
  fov: number;
}

/** Follow rig per camera class (appendix 03 section 2). */
export const FOLLOW: Record<ViewportClass, { fov: number; offset: Vec3 }> = {
  desktop: { fov: 38, offset: [14, 15, 14] },
  tablet: { fov: 42, offset: [16, 18, 16] },
  mobile: { fov: 50, offset: [18, 24, 18] },
};

/** Rail rig for the L2 corridor: camera at (x, y, z) looking at (x + 4, 0, 0). */
export const RAIL: Record<ViewportClass, { fov: number; y: number; z: number }> = {
  desktop: { fov: 40, y: 13, z: 24 },
  tablet: { fov: 45, y: 15, z: 28 },
  mobile: { fov: 55, y: 18, z: 34 },
};
export const RAIL_LOOK_AHEAD = 4;

export const INTRO_RADIUS: Record<ViewportClass, number> = { desktop: 70, tablet: 80, mobile: 90 };
export const INTRO_SWEEP = (120 * Math.PI) / 180;
export const INTRO_ORBIT = 1.9;
export const INTRO_FLY = 0.6;
export const INTRO_DURATION = INTRO_ORBIT + INTRO_FLY;
export const TOWER_CENTER: Vec3 = [0, 28, 0];

export const SPRING_HALF_LIFE = 0.18;
export const MAX_YAW = (25 * Math.PI) / 180;
export const ZOOM_RANGE = [0.8, 1.25] as const;

export function selectRig(phase: string, floor: FloorId): RigKind {
  if (phase === "boot" || phase === "intro") return "intro";
  return floor === "L2" ? "rail" : "follow";
}

export function followPose(cls: ViewportClass, target: Vec3, yaw = 0, zoom = 1): CameraPose {
  const { fov, offset } = FOLLOW[cls];
  const [ox, oy, oz] = offset;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const rx = ox * c + oz * s;
  const rz = -ox * s + oz * c;
  return {
    position: [target[0] + rx * zoom, target[1] + oy * zoom, target[2] + rz * zoom],
    target,
    fov,
  };
}

/** Half width of the L2 corridor: inside it the rail keeps the spec pose. */
export const RAIL_DEADBAND = 4;

/** How far the rail slides in z so a rover inside a side room (|z| > 4) stays in frame. */
export function railShift(roverZ: number): number {
  const out = Math.abs(roverZ) - RAIL_DEADBAND;
  return out > 0 ? Math.sign(roverZ) * out : 0;
}

export function railPose(cls: ViewportClass, roverX: number, floorY: number, zoom = 1, roverZ = 0): CameraPose {
  const { fov, y, z } = RAIL[cls];
  const shift = railShift(roverZ);
  return {
    position: [roverX, floorY + y * zoom, z * zoom + shift],
    target: [roverX + RAIL_LOOK_AHEAD, floorY, shift],
    fov,
  };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

/** Angle of the orbit at progress p (0 to 1), ending where the Lobby follow camera sits. */
export function introAngle(end: CameraPose, p: number): number {
  const endAngle = Math.atan2(end.position[0] - TOWER_CENTER[0], end.position[2] - TOWER_CENTER[2]);
  return endAngle - INTRO_SWEEP * (1 - p);
}

/** Exterior orbit around the tower (120 degrees while descending), then a fly-in to `end`. */
export function introPose(cls: ViewportClass, t: number, end: CameraPose): CameraPose {
  const r = INTRO_RADIUS[cls];
  const orbitAt = (p: number): CameraPose => {
    const a = introAngle(end, p);
    return {
      position: [TOWER_CENTER[0] + Math.sin(a) * r, lerp(62, 26, p), TOWER_CENTER[2] + Math.cos(a) * r],
      target: [TOWER_CENTER[0], lerp(30, 6, p), TOWER_CENTER[2]],
      fov: 40,
    };
  };
  if (t <= INTRO_ORBIT) return orbitAt(easeInOutCubic(Math.max(0, t / INTRO_ORBIT)));
  const q = easeInOutCubic(Math.min(1, (t - INTRO_ORBIT) / INTRO_FLY));
  const from = orbitAt(1);
  return {
    position: lerp3(from.position, end.position, q),
    target: lerp3(from.target, end.target, q),
    fov: lerp(from.fov, end.fov, q),
  };
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

export const clampYaw = (yaw: number) => Math.max(-MAX_YAW, Math.min(MAX_YAW, yaw));
export const clampZoom = (zoom: number) => Math.max(ZOOM_RANGE[0], Math.min(ZOOM_RANGE[1], zoom));

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
