import type { OfficeState } from "@/lib/office/protocol";
import type { Vec2 } from "../../../types";
import type { OfficeSlot } from "../officeLayout";
import { pose, stillPose, type OfficePose } from "./officeVisual";

/**
 * The living crew (design 2026-10-20 section 5): each desk's Rover acts out its state with its body. Pure: an actor
 * per desk, stepped by frame deltas; every motion is a function of the actor's state clock and the slot phase, so the
 * same steps give the same poses. Under reduced motion every pose is a held still pose and a state change cuts.
 */
export const CREW = {
  /** Shortest blend between two states (s); longer for a big turn, so `turnRate` (rad/s) is the turn's average rate. */
  blend: 0.35,
  /** Average turn rate of a blend, not a hard cap: the smoothstep ease peaks at 1.5x this mid-blend. */
  turnRate: 3,
  cameraClamp: (70 * Math.PI) / 180,
  workPitch: 0.12,
  pace: { amp: 0.4, hz: 0.2 },
  dock: { back: 0.35, drop: 0.06 },
  spin: { s: 0.9, hop: 0.3 },
  /** Two short bursts every period (s): at most 2 flashes in 3 s. */
  flicker: { period: 3, on: [[0, 0.12], [0.25, 0.37]] as const },
  charge: { hz: 0.2, lo: 0.3, hi: 0.6, still: 0.45 },
  confetti: 1.2,
  wave: { hz: 1.2, amp: 0.35 },
} as const;

/** Yaw offsets (radians, on top of the desk heading) toward the camera and the CI tower. */
export interface CrewLook {
  camera: number;
  tower: number;
}

export interface CrewActor {
  state: OfficeState;
  /** Seconds in the current state. */
  t: number;
  from: OfficePose;
  blendFor: number;
  pose: OfficePose;
  /** Scratch target pose, rewritten every step (no per-frame allocation). */
  target: OfficePose;
}

export interface CrewFx {
  /** 0 to 1: how many of the 5 sparks show (0 none). */
  sparks: number;
  trail: number;
  /** Confetti burst progress 0 to 1, -1 when none. */
  confetti: number;
  /** Halo and antenna tip gain (1 steady). */
  flicker: number;
  /** Charge pad level (0 none). */
  charge: number;
  /** Desk light level 0 to 1. */
  deskLight: number;
}

const TAU = Math.PI * 2;
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x: number) => x * x * (3 - 2 * x);
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const hash = (n: number) => {
  const s = Math.sin(n * 12.9898) * 43758.5453;
  return s - Math.floor(s);
};

/** Turn (radians, on top of the slot's heading) that faces `target`, clamped to `clamp` either side. */
export function lookYaw(slot: OfficeSlot, target: Vec2, clamp = Math.PI): number {
  const want = Math.atan2(target.x - slot.rover.x, target.z - slot.rover.z);
  const d = wrap(want - slot.yaw);
  return Math.max(-clamp, Math.min(clamp, d));
}

/** The pose a state aims for at its local time `t`; `spin` is the victory spin's progress (0 to 1). Writes into `out` when given. */
export function crewTarget(state: OfficeState, t: number, phase: number, reduced: boolean, look: CrewLook, spin: number, out?: OfficePose): OfficePose {
  const p = pose(state, t, phase, reduced, out);
  switch (state) {
    case "working":
      p.rx += CREW.workPitch;
      break;
    case "ci":
      p.yaw = look.tower;
      if (!reduced) p.x = Math.sin(t * TAU * CREW.pace.hz + phase) * CREW.pace.amp;
      break;
    case "input":
      p.yaw = look.camera;
      p.flag = 1;
      p.wave = reduced ? 0 : Math.sin(t * TAU * CREW.wave.hz + phase) * CREW.wave.amp;
      break;
    case "done":
      // The spin ends facing the camera, so the happy face reads (owner decision 2026-10-20).
      p.yaw = look.camera;
      if (spin > 0 && spin < 1) {
        p.yaw += TAU * smooth(spin);
        p.y += CREW.spin.hop * Math.sin(Math.PI * spin);
      }
      break;
    case "asleep":
      p.z = -CREW.dock.back;
      p.y -= CREW.dock.drop;
      break;
    default:
      break;
  }
  return p;
}

export function newActor(state: OfficeState): CrewActor {
  // t starts long past every blend and burst, so a new actor is already settled (no entry spin or confetti).
  return { state, t: 1e3, from: stillPose(state), blendFor: 0, pose: stillPose(state), target: stillPose(state) };
}

/** Every `OfficePose` field, in one constant list (blending walks it without allocating). */
export const POSE_KEYS = ["y", "rx", "ry", "rz", "armL", "armR", "tipScale", "x", "z", "yaw", "flag", "wave"] as const satisfies readonly (keyof OfficePose)[];

function mix(a: OfficePose, b: OfficePose, w: number, out: OfficePose): void {
  for (const k of POSE_KEYS) out[k] = a[k] + (b[k] - a[k]) * w;
}

const spinOf = (a: CrewActor, reduced: boolean) => (a.state === "done" && !reduced ? clamp01((a.t - a.blendFor) / CREW.spin.s) : 0);

/** Advances the actor by `dt` toward `state`; returns its pose (the same object every call). */
export function stepCrew(a: CrewActor, state: OfficeState, dt: number, phase: number, reduced: boolean, look: CrewLook): OfficePose {
  if (state !== a.state) {
    const aim = crewTarget(state, 0, phase, reduced, look, 0, a.target);
    // Start from the pose's yaw on the aim's branch, so the blend takes the short way round (a cut spin never unwinds).
    const turn = wrap(a.pose.yaw - aim.yaw);
    Object.assign(a.from, a.pose);
    a.from.yaw = aim.yaw + turn;
    a.blendFor = reduced ? 0 : Math.max(CREW.blend, Math.abs(turn) / CREW.turnRate);
    a.state = state;
    a.t = 0;
  } else {
    a.t += dt;
  }
  const target = crewTarget(state, a.t, phase, reduced, look, spinOf(a, reduced), a.target);
  const w = a.blendFor <= 0 ? 1 : smooth(clamp01(a.t / a.blendFor));
  if (w >= 1) Object.assign(a.pose, target);
  else mix(a.from, target, w, a.pose);
  return a.pose;
}

/** The actor's effects now (read by `crewFx.ts`); writes into `out` when given (no allocation). */
export function crewFx(a: CrewActor, reduced: boolean, out?: CrewFx): CrewFx {
  const s = a.state;
  const t = a.t;
  const spinEnd = a.blendFor + CREW.spin.s;
  const confetti = s === "done" ? (reduced ? -1 : t < a.blendFor || t > spinEnd + CREW.confetti ? -1 : clamp01((t - a.blendFor) / (CREW.spin.s + CREW.confetti))) : -1;
  let flicker = 1;
  if (s === "failed" && !reduced) {
    const k = t % CREW.flicker.period;
    flicker = CREW.flicker.on.some(([on, off]) => k >= on && k < off) ? 1.8 : 0.55;
  }
  const charge = s !== "asleep" ? 0 : reduced ? CREW.charge.still : CREW.charge.lo + (CREW.charge.hi - CREW.charge.lo) * (0.5 + 0.5 * Math.sin(t * TAU * CREW.charge.hz));
  const o = out ?? ({} as CrewFx);
  o.sparks = s === "working" ? (reduced ? 0.6 : 1) : 0;
  o.trail = s === "thinking" ? 1 : 0;
  o.confetti = confetti;
  o.flicker = flicker;
  o.charge = charge;
  o.deskLight = s === "asleep" ? 0.1 : 1;
  return o;
}

export interface FxPoint {
  x: number;
  y: number;
  z: number;
  a: number;
}

/** Spark `i` (0 to 4) in the Rover's frame: pops 0.2 to 0.6 u over the keys between the hands, living 0.3 s. Reduced motion: three fixed sparks. */
export function sparkAt(i: number, t: number, phase: number, reduced: boolean, o: FxPoint): FxPoint {
  if (reduced) {
    o.x = (i - 1) * 0.3;
    o.y = 1.3;
    o.z = 0.9;
    o.a = i < 3 ? 1 : 0;
    return o;
  }
  const cycle = t / 0.6 + hash(i + phase);
  const life = cycle - Math.floor(cycle);
  const k = Math.floor(cycle);
  o.x = (hash(k * 7 + i * 13 + phase) - 0.5) * 0.9;
  o.y = 1.15 + clamp01(life / 0.5) * 0.4;
  o.z = 0.9;
  o.a = life < 0.5 ? 1 - life / 0.5 : 0;
  return o;
}

/** Thought trail dot `j` (0 to 2), rising from the tip, sizes 0.08, 0.12 and 0.18 u. */
export const TRAIL_SIZE = [0.08, 0.12, 0.18] as const;
export function trailAt(j: number, t: number, reduced: boolean, o: FxPoint): FxPoint {
  o.x = 0.35 + j * 0.12;
  o.y = 2.55 + (j + 1) * 0.22 + (reduced ? 0 : Math.sin(t * 2.4 + j) * 0.04);
  o.z = -0.1;
  o.a = 1;
  return o;
}

/** Confetti dot `j` (0 to 5) at burst progress `u`. */
export function confettiAt(j: number, u: number, o: FxPoint): FxPoint {
  const a = (j / 6) * TAU;
  o.x = Math.cos(a) * u * 1.2;
  o.y = 1.9 + u * 0.9 - u * u * 0.6;
  o.z = Math.sin(a) * u * 1.2;
  o.a = 1 - u;
  return o;
}

/** Helper drones (one per active sub-agent, at most 4 drawn) orbiting the head; `body` is the drone's box size (u). */
export const DRONES = { max: 4, r: 1.15, y: 2.5, speed: 1.2, bob: 0.06, body: [0.3, 0.12, 0.3] } as const;

/** Drone `i` of `n` (at most 4 drawn) orbiting the head, in the Rover's frame; parked at fixed angles under reduced motion. */
export function dronePoint(i: number, n: number, t: number, phase: number, reduced: boolean, o: FxPoint): FxPoint {
  const k = Math.max(1, Math.min(n, DRONES.max));
  const a = (i / k) * TAU + (reduced ? 0.6 : t * DRONES.speed + phase);
  o.x = Math.cos(a) * DRONES.r;
  o.y = DRONES.y + (reduced ? 0 : Math.sin(t * 2.2 + i * 1.3 + phase) * DRONES.bob);
  o.z = Math.sin(a) * DRONES.r;
  o.a = i < Math.min(n, DRONES.max) ? 1 : 0;
  return o;
}
