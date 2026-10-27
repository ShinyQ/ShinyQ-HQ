import { LOBBY, SHAFT } from "../config";
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
  /** Past the far corner of the Highlights Hall from the spawn (about 86 u since more room, 2026-10-19). */
  revealReach: 90,
  sweep: 1.5 * Math.PI,
  turn: [1.3, 2.6] as const,
  reduced: 0.9,
  skipFade: 0.3,
} as const;

/** Height of the rover's face screen center above its floor (Rover.tsx head at 1.5, screen +0.02). */
export const FACE_Y = 1.52;
/** How far in front of the face screen the camera looks at it (the screen sits 0.45 u in front of the rover's center). */
const FACE_AHEAD = 0.45;
/**
 * The wake close-up: camera distance from Rover's center, its FOV and height above the floor. The whole head (with its
 * antenna) and the top of the body stay in frame, seen slightly from above: the 0.9 by 0.7 u face screen is about a third
 * of the frame height on desktop and about 60 percent of the frame width on a phone.
 */
interface WakeFrame {
  distance: number;
  fov: number;
  height: number;
  look: number;
  /**
   * Look height held through the boot on portrait screens, so Rover sits above the bottom boot card; the push-in eases
   * it to `look`.
   */
  boot?: number;
}
export const WAKE: Record<ViewportClass, WakeFrame> = {
  desktop: { distance: 3.5, fov: 38, height: 2.4, look: 1.85 },
  tablet: { distance: 3.8, fov: 44, height: 2.5, look: 1.8 },
  mobile: { distance: 3.75, fov: 52, height: 2.4, look: 1.75, boot: 0.6 },
};
/** The slow push-in during the wake (fraction of the wake distance). */
const PUSH = 0.06;
/** How long the pull-back from the close-up to the orbit's high point takes (s after the wake), per camera class. */
const PULL: Record<ViewportClass, number> = { desktop: 2, tablet: 2.1, mobile: 2.6 };
/**
 * The orbit's high point after the pull-back: radius around the orbit's center and how far above the end (follow) height
 * it rises, so the orbit descends onto the follow pose on every camera class.
 */
const PEAK: Record<ViewportClass, { radius: number; rise: number }> = {
  desktop: { radius: 26, rise: 6 },
  tablet: { radius: 18, rise: 10 },
  mobile: { radius: 24, rise: 10 },
};
/**
 * The orbit's center: Rover on desktop; on the narrow (portrait) frames of tablets and phones the plaza (the hologram),
 * which the center glides to during the pull-back, so the stats ring stays in the middle of the frame all the way round.
 */
const PLAZA_ORBIT: Record<ViewportClass, boolean> = { desktop: false, tablet: true, mobile: true };
/**
 * How far past the orbit's center (and at what height) the camera looks during the orbit: on desktop past Rover, so the
 * far side of the plaza (the landmarks) fills the frame; on narrow frames just past the plaza's center, where the look
 * point holds until `land` s before the end and only then moves onto the follow target (desktop: from the pull-back's end).
 */
const ACROSS: Record<ViewportClass, { ahead: number; y: number; land?: number }> = {
  desktop: { ahead: 10, y: 2.5 },
  tablet: { ahead: 4, y: 1, land: 1.4 },
  mobile: { ahead: 4, y: 1, land: 1.4 },
};
/**
 * The elevator shaft (a tower through every floor): the pull-back's radius waits (up to HOLD_MAX s, in HOLD_STEP steps)
 * until the path clears the shaft's footprint plus SHAFT_MARGIN, so the camera turns past the shaft before it pulls out.
 */
const HOLD_STEP = 0.05;
const HOLD_MAX = 2;
const SHAFT_MARGIN = 1.6;
/** The orbit's angular speed ramps up over ORBIT_IN s after the wake, holds, and eases to rest over the last ORBIT_OUT s. */
const ORBIT_IN = 0.8;
const ORBIT_OUT = 1;

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
/** Pull-back: leaves the close-up gently, settles at the high point. */
const pullEase = cubicBezierEase(0.45, 0, 0.35, 1);
/** Descent from the high point onto the follow pose (zero velocity at both ends). */
const settleEase = cubicBezierEase(0.4, 0, 0.3, 1);
/** Integral of smoothstep over [0, u]: 0.5 at u = 1. */
const rampArea = (u: number) => u * u * u - (u * u * u * u) / 2;

/**
 * Orbit progress over the orbit's window (s from 0 to 1): the angular speed ramps up over `a`, stays constant and
 * eases to rest over the last `b` (smoothstep speed ramps), so the sweep is spread evenly with a gentle landing.
 */
export function orbitProgress(s: number, a: number, b: number): number {
  if (s <= 0) return 0;
  if (s >= 1) return 1;
  const v = 1 / (1 - a / 2 - b / 2);
  if (s < a) return v * a * rampArea(s / a);
  if (s > 1 - b) return 1 - v * b * rampArea((1 - s) / b);
  return v * (a / 2 + s - a);
}
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export interface IntroPlan {
  /** Rover: the wake close-up's center. */
  center: Vec3;
  /** The orbit's center after the pull-back (Rover on desktop, the plaza on narrow frames); `end` is measured around it. */
  focus: Vec3;
  across: { ahead: number; y: number; land?: number };
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
  wake: WakeFrame;
  /** Pull-back length (s after the wake). */
  pull: number;
  peak: { radius: number; height: number };
  /** How long (s) the radius waits after the wake before it pulls out, so the path stays clear of the elevator shaft. */
  hold: number;
  /** What the raw path misses `end` by at the end; added in with the orbit ease, so the intro lands exactly on `end`. */
  endError: { position: Vec3; target: Vec3 };
}

export function introPlan(cls: ViewportClass, rover: Vec3, spawnHeading: number, end: CameraPose): IntroPlan {
  const focus: Vec3 = PLAZA_ORBIT[cls] ? [LOBBY.hologram.x, rover[1], LOBBY.hologram.z] : rover;
  const [cx, cy, cz] = focus;
  const ex = end.position[0] - cx;
  const ez = end.position[2] - cz;
  const endAngle = Math.atan2(ex, ez);
  const start = endAngle - INTRO.sweep;
  const plan: IntroPlan = {
    center: rover,
    focus,
    across: ACROSS[cls],
    start,
    sweep: INTRO.sweep,
    wakeHeading: start,
    spawnHeading,
    end,
    endAngle,
    endRadius: Math.hypot(ex, ez),
    endHeight: end.position[1] - cy,
    // The follow target lies on the line from the camera through Rover (followPose), endAhead past the orbit's center.
    endAhead: -((end.target[0] - cx) * Math.sin(endAngle) + (end.target[2] - cz) * Math.cos(endAngle)),
    endLookY: end.target[1] - cy,
    wake: WAKE[cls],
    pull: PULL[cls],
    peak: { radius: PEAK[cls].radius, height: end.position[1] - cy + PEAK[cls].rise },
    hold: 0,
    endError: { position: [0, 0, 0], target: [0, 0, 0] },
  };
  plan.hold = clearHold(plan);
  const raw = rawPose(plan, INTRO.duration);
  plan.endError = {
    position: [0, 1, 2].map((i) => end.position[i] - raw.position[i]) as Vec3,
    target: [0, 1, 2].map((i) => end.target[i] - raw.target[i]) as Vec3,
  };
  return plan;
}

function orbitAt(t: number): number {
  const window = INTRO.duration - INTRO.wake;
  return orbitProgress(span(t, INTRO.wake, INTRO.duration), ORBIT_IN / window, ORBIT_OUT / window);
}

/** How far the radius has pulled out of the close-up (0 to 1); the orbit's center glides from Rover to `focus` with it. */
function pullAt(plan: IntroPlan, t: number): number {
  const pullStart = INTRO.wake + plan.hold;
  return pullEase(span(t, pullStart, pullStart + plan.pull));
}

/** The orbit's center at `t`: Rover through the wake, `focus` from the end of the pull-back. */
export function orbitCenter(plan: IntroPlan, t: number): Vec3 {
  const { center: a, focus: b } = plan;
  if (a === b) return a;
  const k = pullAt(plan, t);
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

function orbitPos(plan: IntroPlan, t: number): [number, number] {
  const angle = plan.start + plan.sweep * orbitAt(t);
  const r = pathRadius(plan, t);
  const c = orbitCenter(plan, t);
  return [c[0] + Math.sin(angle) * r, c[2] + Math.cos(angle) * r];
}

/**
 * The shortest radius hold that keeps the orbit out of the elevator shaft's footprint; when none does (the follow pose
 * itself stands at the shaft), the one that spends the least time in it.
 */
function clearHold(plan: IntroPlan): number {
  const reach = SHAFT.size / 2 + SHAFT_MARGIN;
  let best = 0;
  let fewest = Infinity;
  for (let k = 0; k * HOLD_STEP <= HOLD_MAX; k++) {
    plan.hold = k * HOLD_STEP;
    let inside = 0;
    for (let i = 0; i <= 160; i++) {
      const [x, z] = orbitPos(plan, INTRO.wake + ((INTRO.duration - INTRO.wake) * i) / 160);
      if (Math.abs(x - SHAFT.x) < reach && Math.abs(z - SHAFT.z) < reach) inside++;
    }
    if (inside === 0) return plan.hold;
    if (inside < fewest) {
      fewest = inside;
      best = plan.hold;
    }
  }
  return best;
}

function pathRadius(plan: IntroPlan, t: number): number {
  const { wake, peak } = plan;
  const push = smooth(span(t, 0, INTRO.wake));
  const pullStart = INTRO.wake + plan.hold;
  const pull = pullAt(plan, t);
  const settle = settleEase(span(t, pullStart + plan.pull, INTRO.duration));
  return wake.distance * (1 - PUSH * push) + (peak.radius - wake.distance * (1 - PUSH)) * pull + (plan.endRadius - peak.radius) * settle;
}

function rawPose(plan: IntroPlan, t: number): CameraPose {
  const { wake, peak } = plan;
  const pullEnd = INTRO.wake + plan.pull;
  const pull = pullEase(span(t, INTRO.wake, pullEnd));
  const settle = settleEase(span(t, pullEnd, INTRO.duration));
  const angle = plan.start + plan.sweep * orbitAt(t);
  const radius = pathRadius(plan, t);
  const height = wake.height + (peak.height - wake.height) * pull + (plan.endHeight - peak.height) * settle;
  const { ahead: across, y: acrossY, land } = plan.across;
  const look = land === undefined ? settle : settleEase(span(t, Math.max(pullEnd, INTRO.duration - land), INTRO.duration));
  const ahead = -FACE_AHEAD + (across + FACE_AHEAD) * pull + (plan.endAhead - across) * look;
  const push = smooth(span(t, 0, INTRO.wake));
  const lookY = wake.look + ((wake.boot ?? wake.look) - wake.look) * (1 - push) + (acrossY - wake.look) * pull + (plan.endLookY - acrossY) * look;
  const fov = wake.fov + (plan.end.fov - wake.fov) * orbitAt(t);
  const [cx, cy, cz] = orbitCenter(plan, t);
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
  const k = orbitAt(at);
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

/** Intents that skip the reveal orbit (drive, turn, zoom, reset view, Esc); the boot ignores them. */
const SKIP_INTENTS: ReadonlySet<string> = new Set(["move", "orbit", "zoom", "view", "cancel"]);

export function skipsIntro(phase: string, intent: string): boolean {
  return phase === "intro" && SKIP_INTENTS.has(intent);
}

/** Reduced motion: the veil over the cut to the follow pose clears linearly over `INTRO.reduced`. */
export function reducedVeil(t: number): number {
  return Math.min(1, Math.max(0, 1 - t / INTRO.reduced));
}

/** After a skip (or the reduced-motion intro) the veil fades out over `INTRO.skipFade`. */
export function decayVeil(veil: number, dt: number): number {
  return Math.max(0, veil - dt / INTRO.skipFade);
}
