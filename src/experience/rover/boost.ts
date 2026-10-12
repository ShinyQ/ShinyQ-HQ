import type { Vec2 } from "../types";
import type { RoverTuning } from "./movement";

/**
 * Hold-to-boost (owner request): Shift on keyboards, the boost button beside the joystick on touch
 * screens. Manual driving only; the autopilot (missions, walks, the elevator approach and
 * point-and-go drives) keeps its speed. Pure, so Vitest runs it in node.
 */
export const BOOST = {
  /** Top speed and acceleration factor while boosting (9 to 18 u/s on fine pointers). */
  multiplier: 2,
  /** Trail level easing per second, in and out. */
  rampUp: 8,
  rampDown: 4,
  /** Below this level the trail is not drawn (no draw call). */
  trailMin: 0.05,
} as const;

/** True while the visitor drives by hand and holds Shift or the touch boost button. */
export function boostOn(manual: Vec2 | null, held: Iterable<string>, button: boolean): boolean {
  if (!manual || Math.hypot(manual.x, manual.z) < 1e-3) return false;
  if (button) return true;
  for (const key of held) if (key.toLowerCase() === "shift") return true;
  return false;
}

/** Tuning for this frame: boosted top speed and acceleration, everything else unchanged. */
export function boostTuning(tuning: RoverTuning, on: boolean): RoverTuning {
  return on ? { ...tuning, maxSpeed: tuning.maxSpeed * BOOST.multiplier, accel: tuning.accel * BOOST.multiplier } : tuning;
}

/** Eases the visual boost level (0 to 1, drives the trail) toward `on`, snapping the last thousandth. */
export function stepBoostLevel(level: number, on: boolean, dt: number): number {
  const target = on ? 1 : 0;
  const next = level + (target - level) * Math.min(1, dt * (on ? BOOST.rampUp : BOOST.rampDown));
  return Math.abs(target - next) < 1e-3 ? target : next;
}
