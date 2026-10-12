import type { Rect } from "../types";
import type { Vec3 } from "./rigs";

/**
 * Cheap camera collision (owner request, round 5): no physics, just the floor height, the slab bounds
 * and the floor's obstacle rects as columns. Only cameras below `obstacle` height can be blocked, so
 * the default third-person poses (18 u and more above the rover) never move.
 */
export const CAMERA_CLEARANCE = {
  /** Lowest camera height above the floor (u). */
  ground: 0.6,
  /** Obstacles (walls, boards, pedestals) block the camera up to this height above the floor. */
  obstacle: 3.2,
  /** Outside the slab the camera stays above this height, so it never looks at the slab edge from below. */
  edge: 2.5,
  /** Distance kept from obstacle faces (u). */
  radius: 0.35,
} as const;

export interface CameraWorld {
  obstacles: readonly Rect[];
  bounds: Rect;
  floorY: number;
}

export function cameraBlocked(p: Vec3, w: CameraWorld): boolean {
  const h = p[1] - w.floorY;
  if (h < CAMERA_CLEARANCE.ground) return true;
  if (h >= CAMERA_CLEARANCE.obstacle) return false;
  const [x, , z] = p;
  const b = w.bounds;
  if (h < CAMERA_CLEARANCE.edge && (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ)) return true;
  const r = CAMERA_CLEARANCE.radius;
  return w.obstacles.some((o) => x > o.minX - r && x < o.maxX + r && z > o.minZ - r && z < o.maxZ + r);
}

const STEPS = 32;
const REFINE = 6;
const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Where along target to camera (0 to 1) the point nearest `from` (the rover) sits, in plan view. */
function startParam(target: Vec3, camera: Vec3, from: Vec3): number {
  const dx = camera[0] - target[0];
  const dz = camera[2] - target[2];
  const len2 = dx * dx + dz * dz;
  if (len2 < 1e-9) return 0;
  const t = ((from[0] - target[0]) * dx + (from[2] - target[2]) * dz) / len2;
  return Math.max(0, Math.min(1, t));
}

/**
 * Pulls a low camera in along its view ray (from `target` toward `camera`) to just before the first
 * blocked point, marching outward from the point next to the rover (`from`), so a wall between the
 * rover and a low camera brings the camera in front of it. Returns `camera` itself when it is high
 * enough, when nothing blocks the ray, or when the ray already starts blocked.
 */
export function clampCamera(target: Vec3, camera: Vec3, w: CameraWorld, from: Vec3 = target): Vec3 {
  if (camera[1] - w.floorY >= CAMERA_CLEARANCE.obstacle) return camera;
  const t0 = startParam(target, camera, from);
  if (cameraBlocked(lerp3(target, camera, t0), w)) return camera;
  let free = t0;
  for (let i = 1; i <= STEPS; i++) {
    const t = t0 + ((1 - t0) * i) / STEPS;
    if (!cameraBlocked(lerp3(target, camera, t), w)) {
      free = t;
      continue;
    }
    let blocked = t;
    for (let k = 0; k < REFINE; k++) {
      const mid = (free + blocked) / 2;
      if (cameraBlocked(lerp3(target, camera, mid), w)) blocked = mid;
      else free = mid;
    }
    return lerp3(target, camera, free);
  }
  return camera;
}
