import { resolveCircle } from "../nav/collision";
import type { Rect, Vec2 } from "../types";

export interface RoverPose {
  x: number;
  z: number;
  /** Forward is (sin heading, cos heading); heading PI faces -z. */
  heading: number;
  speed: number;
  /** Body roll into turns, radians. */
  tilt: number;
  /** True when the last step was stopped by a wall. */
  blocked?: boolean;
}

export interface RoverTuning {
  maxSpeed: number;
  accel: number;
  braking: number;
  turnRate: number;
  radius: number;
  maxTilt: number;
}

export interface RoverWorld {
  obstacles: readonly Rect[];
  bounds: Rect;
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Converts a camera-space input (x right, y away from the camera) to a world direction. */
export function cameraRelative(input: { x: number; y: number }, cameraForward: Vec2): Vec2 {
  const len = Math.hypot(cameraForward.x, cameraForward.z) || 1;
  const f = { x: cameraForward.x / len, z: cameraForward.z / len };
  const r = { x: -f.z, z: f.x };
  return { x: f.x * input.y + r.x * input.x, z: f.z * input.y + r.z * input.x };
}

/**
 * One physics step: turn toward the desired direction at a capped rate, scale
 * speed by heading alignment, accelerate or brake, then resolve collisions.
 */
export function stepRover(pose: RoverPose, desire: Vec2 | null, dt: number, t: RoverTuning, world: RoverWorld): RoverPose {
  const mag = desire ? Math.min(1, Math.hypot(desire.x, desire.z)) : 0;
  let heading = pose.heading;
  let turn = 0;
  let targetSpeed = 0;
  if (desire && mag > 1e-3) {
    const target = Math.atan2(desire.x, desire.z);
    const maxTurn = t.turnRate * dt;
    const delta = clamp(wrap(target - heading), -maxTurn, maxTurn);
    heading = wrap(heading + delta);
    turn = dt > 0 ? delta / dt : 0;
    const align = Math.max(0, Math.cos(wrap(target - heading)));
    targetSpeed = t.maxSpeed * mag * align;
  }
  const speed =
    targetSpeed > pose.speed ? Math.min(targetSpeed, pose.speed + t.accel * dt) : Math.max(targetSpeed, pose.speed - t.braking * dt);

  const next = { x: pose.x + Math.sin(heading) * speed * dt, z: pose.z + Math.cos(heading) * speed * dt };
  const resolved = resolveCircle(next, t.radius, world.obstacles, world.bounds);
  const travelled = Math.hypot(resolved.x - pose.x, resolved.z - pose.z);
  const blocked = speed > 0.5 && travelled < speed * dt * 0.3;

  const tiltTarget = clamp((-turn / t.turnRate) * t.maxTilt * Math.min(1, speed / t.maxSpeed), -t.maxTilt, t.maxTilt);
  const tilt = pose.tilt + (tiltTarget - pose.tilt) * Math.min(1, dt * 8);

  return { x: resolved.x, z: resolved.z, heading, speed, tilt, blocked };
}
