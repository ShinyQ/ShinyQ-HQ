import type { ViewportClass } from "../types";
import type { CameraPose, Vec3 } from "./rigs";

/** Intro timeline (s): the wake close-up, the reveal ring, the pull-back and the orbit, then explore (owner design 2026-10-18). */
export const INTRO = {
  wake: 1.1,
  duration: 6.6,
  faceBoot: 0.35,
  faceOn: 0.8,
  revealStart: 0.55,
  revealEnd: 3.0,
  revealReach: 80,
  sweep: 1.5 * Math.PI,
  turn: [1.3, 2.6] as const,
  reduced: 0.9,
  skipFade: 0.3,
} as const;

/** Height of the rover's face screen center above its floor (Rover.tsx head at 1.5, screen +0.02). */
export const FACE_Y = 1.52;
/** How far in front of the face screen the camera looks at it (the screen sits 0.45 u in front of the rover's center). */
const FACE_AHEAD = 0.45;
const WAKE: Record<ViewportClass, { distance: number; fov: number }> = {
  desktop: { distance: 2.3, fov: 36 },
  tablet: { distance: 2.7, fov: 42 },
  mobile: { distance: 3.1, fov: 46 },
};
/**
 * The orbit's high point after the pull-back (u above Rover's floor, radius around Rover). The radius stays under
 * the elevator shaft's distance from the spawn (about 17.8 u), so the early orbit passes inside it, never through it.
 */
const PEAK: Record<ViewportClass, { radius: number; height: number }> = {
  desktop: { radius: 14, height: 30 },
  tablet: { radius: 14, height: 34 },
  mobile: { radius: 14, height: 36 },
};
/** How far past Rover the camera looks during the orbit, so the far side of the plaza (the landmarks) fills the frame. */
const ACROSS = 10;
const ACROSS_Y = 2.5;

export function cubicBezierEase(x1: number, y1: number, x2: number, y2: number): (s: number) => number {
  const bx = (u: number) => 3 * (1 - u) * (1 - u) * u * x1 + 3 * (1 - u) * u * u * x2 + u * u * u;
  const by = (u: number) => 3 * (1 - u) * (1 - u) * u * y1 + 3 * (1 - u) * u * u * y2 + u * u * u;
  const dx = (u: number) => 3 * (1 - u) * (1 - u) * x1 + 6 * (1 - u) * u * (x2 - x1) + 3 * u * u * (1 - x2);
  return (s: number) => {
    if (s <= 0) return 0;
    if (s >= 1) return 1;
    let u = s;
    for (let i = 0; i < 8; i++) {
      const d = dx(u);
      if (Math.abs(d) < 1e-6) break;
      u = Math.min(1, Math.max(0, u - (bx(u) - s) / d));
    }
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 30 && Math.abs(bx(u) - s) > 1e-7; i++) {
      if (bx(u) < s) lo = u;
      else hi = u;
      u = (lo + hi) / 2;
    }
    return by(u);
  };
}

const span = (t: number, a: number, b: number) => Math.min(1, Math.max(0, (t - a) / (b - a)));
const smooth = (x: number) => x * x * (3 - 2 * x);
/** Pull-back: leaves the close-up gently, settles early. */
const pullEase = cubicBezierEase(0.35, 0, 0.2, 1);
/** Orbit: builds up, then a long settle onto the follow pose (zero velocity at the end). */
const orbitEase = cubicBezierEase(0.45, 0, 0.25, 1);
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export interface IntroPlan {
  center: Vec3;
  start: number;
  sweep: number;
  wakeHeading: number;
  spawnHeading: number;
  end: CameraPose;
  endAngle: number;
  endRadius: number;
  endHeight: number;
  endAhead: number;
  endLookY: number;
  wake: { distance: number; fov: number };
  peak: { radius: number; height: number };
  /** What the raw path misses `end` by at the end; added in with the orbit ease, so the intro lands exactly on `end`. */
  endError: { position: Vec3; target: Vec3 };
}

export function introPlan(cls: ViewportClass, rover: Vec3, spawnHeading: number, end: CameraPose): IntroPlan {
  const [cx, cy, cz] = rover;
  const ex = end.position[0] - cx;
  const ez = end.position[2] - cz;
  const endAngle = Math.atan2(ex, ez);
  const start = endAngle - INTRO.sweep;
  const plan: IntroPlan = {
    center: rover,
    start,
    sweep: INTRO.sweep,
    wakeHeading: start,
    spawnHeading,
    end,
    endAngle,
    endRadius: Math.hypot(ex, ez),
    endHeight: end.position[1] - cy,
    // The follow target lies on the line from the camera through Rover (followPose), endAhead past Rover.
    endAhead: -((end.target[0] - cx) * Math.sin(endAngle) + (end.target[2] - cz) * Math.cos(endAngle)),
    endLookY: end.target[1] - cy,
    wake: WAKE[cls],
    peak: PEAK[cls],
    endError: { position: [0, 0, 0], target: [0, 0, 0] },
  };
  const raw = rawPose(plan, INTRO.duration);
  plan.endError = {
    position: [0, 1, 2].map((i) => end.position[i] - raw.position[i]) as Vec3,
    target: [0, 1, 2].map((i) => end.target[i] - raw.target[i]) as Vec3,
  };
  return plan;
}

function rawPose(plan: IntroPlan, t: number): CameraPose {
  const { wake, peak } = plan;
  const push = smooth(span(t, 0, INTRO.wake));
  const pull = pullEase(span(t, INTRO.wake, INTRO.wake + 1.8));
  const orbit = orbitEase(span(t, INTRO.wake, INTRO.duration));
  const settle = orbitEase(span(t, INTRO.wake + 0.9, INTRO.duration));
  const angle = plan.start + plan.sweep * orbit;
  const radius = wake.distance * (1 - 0.1 * push) + (peak.radius - wake.distance * 0.9) * pull + (plan.endRadius - peak.radius) * settle;
  const height = FACE_Y + 0.1 + (peak.height - FACE_Y - 0.1) * pull + (plan.endHeight - peak.height) * settle;
  const ahead = -FACE_AHEAD + (ACROSS + FACE_AHEAD) * pull + (plan.endAhead - ACROSS) * settle;
  const lookY = FACE_Y + (ACROSS_Y - FACE_Y) * pull + (plan.endLookY - ACROSS_Y) * settle;
  const fov = wake.fov + (plan.end.fov - wake.fov) * orbit;
  const [cx, cy, cz] = plan.center;
  const s = Math.sin(angle);
  const c = Math.cos(angle);
  return {
    position: [cx + s * radius, cy + height, cz + c * radius],
    target: [cx - s * ahead, cy + lookY, cz - c * ahead],
    fov,
  };
}

export function introPose(plan: IntroPlan, t: number): CameraPose {
  const at = Math.min(INTRO.duration, Math.max(0, t));
  if (at >= INTRO.duration) return { position: [...plan.end.position], target: [...plan.end.target], fov: plan.end.fov };
  const raw = rawPose(plan, at);
  const k = orbitEase(span(at, INTRO.wake, INTRO.duration));
  const { position: dp, target: dt } = plan.endError;
  return {
    position: [raw.position[0] + dp[0] * k, raw.position[1] + dp[1] * k, raw.position[2] + dp[2] * k],
    target: [raw.target[0] + dt[0] * k, raw.target[1] + dt[1] * k, raw.target[2] + dt[2] * k],
    fov: raw.fov,
  };
}

export function introHeading(plan: IntroPlan, t: number): number {
  const k = smooth(span(t, INTRO.turn[0], INTRO.turn[1]));
  return plan.wakeHeading + wrap(plan.spawnHeading - plan.wakeHeading) * k;
}

export function introFace(t: number): "off" | "boot" | null {
  if (t < INTRO.faceBoot) return "off";
  if (t < INTRO.faceOn) return "boot";
  return null;
}

export function revealRadius(t: number): number {
  if (t >= INTRO.revealEnd) return Infinity;
  if (t <= INTRO.revealStart) return 0;
  return INTRO.revealReach * Math.pow(span(t, INTRO.revealStart, INTRO.revealEnd), 1.6);
}

/** Fog during the boot and the intro: everything farther than the ring (as seen from the camera) fades into the night. */
export function introFog(camDistance: number, reveal: number, follow: { near: number; far: number }): { near: number; far: number } {
  if (!Number.isFinite(reveal)) return { ...follow };
  // Both edges ride the ring, so they reach the follow range before the ring turns off (no jump at revealEnd).
  return { near: Math.min(follow.near, camDistance + reveal + 1), far: Math.min(follow.far, camDistance + reveal + 13) };
}
