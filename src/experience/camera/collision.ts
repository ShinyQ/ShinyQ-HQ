import { FLOOR_GAP, SHAFT, SHAFT_EAST_FACE } from "../config";
import type { FloorLayout, Rect } from "../types";
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

/** A column taller than `CAMERA_CLEARANCE.obstacle` (for example the L3 directory wall), blocking up to `h` above the floor. */
export interface TallObstacle extends Rect {
  h: number;
}

export interface CameraWorld {
  obstacles: readonly Rect[];
  bounds: Rect;
  floorY: number;
  /** Columns that block the camera up to their own height. */
  tall?: readonly TallObstacle[];
}

/** Height (above the floor) up to which anything in `w` can block the camera. */
function blockHeight(w: CameraWorld): number {
  let h: number = CAMERA_CLEARANCE.obstacle;
  for (const t of w.tall ?? []) h = Math.max(h, t.h);
  return h;
}

/** The elevator shaft (glass, west of every slab) as a camera column a floor high, so a low camera never ends up inside it. */
export const SHAFT_COLUMN: TallObstacle = {
  minX: SHAFT.x - SHAFT.size / 2,
  maxX: SHAFT_EAST_FACE,
  minZ: SHAFT.z - SHAFT.size / 2,
  maxZ: SHAFT.z + SHAFT.size / 2,
  h: FLOOR_GAP,
};

/** The camera's collision world for a floor at `floorY`: its obstacles, slab bounds, tall columns and the elevator shaft. */
export function cameraWorld(layout: Pick<FloorLayout, "obstacles" | "bounds" | "tall">, floorY: number): CameraWorld {
  return { obstacles: layout.obstacles, bounds: layout.bounds, floorY, tall: [...(layout.tall ?? []), SHAFT_COLUMN] };
}

const inside = (x: number, z: number, o: Rect, r: number) => x > o.minX - r && x < o.maxX + r && z > o.minZ - r && z < o.maxZ + r;

export function cameraBlocked(p: Vec3, w: CameraWorld): boolean {
  const h = p[1] - w.floorY;
  if (h < CAMERA_CLEARANCE.ground) return true;
  const [x, , z] = p;
  const r = CAMERA_CLEARANCE.radius;
  if (w.tall?.some((t) => h < t.h && inside(x, z, t, r))) return true;
  if (h >= CAMERA_CLEARANCE.obstacle) return false;
  const b = w.bounds;
  if (h < CAMERA_CLEARANCE.edge && (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ)) return true;
  return w.obstacles.some((o) => inside(x, z, o, r));
}

const onSlab = (x: number, z: number, b: Rect) => x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ;

/**
 * True when the bottom edge of the view (vertical `fov`, degrees) lands on the slab: the camera stands on it, or
 * the bottom-center ray (aimed at `target`, tilted down by half the FOV) meets the floor plane inside the bounds.
 * Off the slab a low camera would otherwise look past the slab edge into the void under it: a black band at the
 * bottom of the view that pops on and off as the camera crosses the edge (Round 9 M).
 */
export function viewOnSlab(camera: Vec3, target: Vec3, w: CameraWorld, fov: number): boolean {
  if (onSlab(camera[0], camera[2], w.bounds)) return true;
  const dx = target[0] - camera[0];
  const dz = target[2] - camera[2];
  const run = Math.hypot(dx, dz);
  const h = camera[1] - w.floorY;
  const down = Math.atan2(camera[1] - target[1], run) + (fov * Math.PI) / 360;
  if (h <= 0 || down <= 0) return false;
  if (run < 1e-9 || down >= Math.PI / 2) return false;
  const d = h / Math.tan(down);
  return onSlab(camera[0] + (dx / run) * d, camera[2] + (dz / run) * d, w.bounds);
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
 * rover and a low camera brings the camera in front of it. With the view's vertical `fov` (degrees) a
 * camera off the slab also counts as blocked while the bottom of its view leaves the slab (`viewOnSlab`),
 * at any height. Returns `camera` itself when it is high enough and on the slab, when nothing blocks the
 * ray, or when the whole ray past the rover is blocked. A blocked stretch next to the rover (a column the ray
 * crosses at the start) is skipped.
 */
export function clampCamera(target: Vec3, camera: Vec3, w: CameraWorld, from: Vec3 = target, fov?: number): Vec3 {
  const offSlab = fov !== undefined && !onSlab(camera[0], camera[2], w.bounds);
  if (camera[1] - w.floorY >= blockHeight(w) && !offSlab) return camera;
  const blocked = (p: Vec3) => cameraBlocked(p, w) || (fov !== undefined && !viewOnSlab(p, target, w, fov));
  let t0 = startParam(target, camera, from);
  // The ray may start inside a column next to the rover (the look-ahead ray crossing the L1 kiosk): skip that stretch
  // instead of giving up, or the camera would jump out past walls and off the slab at some yaws and back at others.
  if (blocked(lerp3(target, camera, t0))) {
    let next = -1;
    for (let i = 1; i <= STEPS && next < 0; i++) {
      const t = t0 + ((1 - t0) * i) / STEPS;
      if (!blocked(lerp3(target, camera, t))) next = t;
    }
    if (next < 0) return camera;
    t0 = next;
  }
  let free = t0;
  for (let i = 1; i <= STEPS; i++) {
    const t = t0 + ((1 - t0) * i) / STEPS;
    if (!blocked(lerp3(target, camera, t))) {
      free = t;
      continue;
    }
    let hit = t;
    for (let k = 0; k < REFINE; k++) {
      const mid = (free + hit) / 2;
      if (blocked(lerp3(target, camera, mid))) hit = mid;
      else free = mid;
    }
    return lerp3(target, camera, free);
  }
  return camera;
}
