import { STATE_TONE } from "@/lib/office/model";
import type { OfficeState } from "@/lib/office/protocol";

/**
 * Agent Office state looks (owner design D5, the approved mock's state table, eyes and pose switch): a face, a
 * desk screen and a tone per state, the Rover's pose over time, and the part sizes. Pure (no three).
 */
export type FaceKind = "focus" | "look" | "scan" | "watch" | "wait" | "ask" | "happy" | "oops" | "sleep";
export type ScreenKind = "code" | "dots" | "diff" | "progress" | "ci" | "question" | "check" | "cross" | "off";

export interface OfficeStateStyle {
  color: string;
  face: FaceKind;
  screen: ScreenKind;
}

export const OFFICE_STATE_STYLE: Record<OfficeState, OfficeStateStyle> = {
  working: { color: STATE_TONE.working, face: "focus", screen: "code" },
  thinking: { color: STATE_TONE.thinking, face: "look", screen: "dots" },
  reviewing: { color: STATE_TONE.reviewing, face: "scan", screen: "diff" },
  testing: { color: STATE_TONE.testing, face: "watch", screen: "progress" },
  ci: { color: STATE_TONE.ci, face: "wait", screen: "ci" },
  input: { color: STATE_TONE.input, face: "ask", screen: "question" },
  done: { color: STATE_TONE.done, face: "happy", screen: "check" },
  failed: { color: STATE_TONE.failed, face: "oops", screen: "cross" },
  asleep: { color: STATE_TONE.asleep, face: "sleep", screen: "off" },
};

/** Body offset (y), pitch toward the desk (rx, positive leans forward), sway (ry), roll (rz), arm angles about x (negative raises) and the antenna tip scale. */
export interface OfficePose {
  y: number;
  rx: number;
  ry: number;
  rz: number;
  armL: number;
  armR: number;
  tipScale: number;
}

/** Faces and screens under reduced motion are drawn at this fixed time (a frame that reads well), never animated. */
export const STILL_T = 0.5;
/** Reduced motion: a state change crossfades the face and the screen over this long instead of cutting. */
export const CROSSFADE_S = 0.4;
/** A stable phase per slot, so the five Rovers never move in step. */
export const slotPhase = (slot: number): number => slot * 1.7 + 0.4;

const REST: OfficePose = { y: 0, rx: 0, ry: 0, rz: 0, armL: 0, armR: 0, tipScale: 1 };

/** The pose a state holds under reduced motion (and the reference the bob probe measures from). */
export function stillPose(state: OfficeState): OfficePose {
  switch (state) {
    case "thinking":
      return { ...REST, armR: -0.9 };
    case "testing":
      return { ...REST, rx: 0.08, armL: -0.3, armR: -0.3 };
    case "input":
      return { ...REST, armL: -1.6 };
    case "done":
      return { ...REST, armL: -1.8, armR: -1.8 };
    case "failed":
      return { ...REST, y: -0.05, rx: 0.22 };
    case "asleep":
      return { ...REST, y: -0.06, rx: 0.14 };
    default:
      return { ...REST };
  }
}

/** The pose at time `t` (s): typing bob, head tilt, side to side, leaning in, idle sway, a raised arm, a hop, a slump with a shake. Asleep holds its slump in both motion settings (no breath), so a sleeping office costs no writes. */
export function pose(state: OfficeState, t: number, phase: number, reduced: boolean): OfficePose {
  const p = stillPose(state);
  if (reduced) return p;
  switch (state) {
    case "working":
      p.y = Math.abs(Math.sin(t * 9 + phase)) * 0.04;
      p.armL = Math.sin(t * 14) * 0.25;
      p.armR = Math.sin(t * 14 + 2) * 0.25;
      break;
    case "thinking":
      p.rz = Math.sin(t * 1.2 + phase) * 0.08;
      p.tipScale = 1 + Math.sin(t * 5) * 0.35;
      break;
    case "reviewing":
      p.ry = Math.sin(t * 0.9 + phase) * 0.25;
      break;
    case "ci":
      p.y = Math.sin(t * 2 + phase) * 0.03;
      p.armL = Math.sin(t * 3) * 0.1;
      p.armR = Math.sin(t * 3 + 1) * 0.1;
      break;
    case "input":
      p.rz = Math.sin(t * 2 + phase) * 0.05;
      break;
    case "done":
      p.y = Math.max(0, Math.sin(t * 6 + phase)) * 0.35;
      p.ry = Math.sin(t * 3 + phase) * 0.2;
      break;
    case "failed":
      p.rz = Math.sin(t * 20) * (Math.sin(t * 1.5 + phase) > 0.8 ? 0.04 : 0);
      break;
    default:
      break;
  }
  return p;
}

/** Largest body offset from the state's still pose (0 under reduced motion): the `bob` probe. */
export function poseOffset(state: OfficeState, p: OfficePose): number {
  const s = stillPose(state);
  return Math.max(Math.abs(p.y - s.y), Math.abs(p.rx - s.rx), Math.abs(p.ry - s.ry), Math.abs(p.rz - s.rz));
}

/**
 * True when any pose field differs. Covers only what the pose drives: the Rover's instance matrices, its face quad
 * and its chip anchor (and the tip's scale). Glow colours and dots also depend on state, progress and time: check
 * `glowKey` (officeRig) for those.
 */
export function poseChanged(a: OfficePose, b: OfficePose): boolean {
  return a.y !== b.y || a.rx !== b.rx || a.ry !== b.ry || a.rz !== b.rz || a.armL !== b.armL || a.armR !== b.armR || a.tipScale !== b.tipScale;
}

/** Rover parts in its own frame (forward +z, toward the plaza) as unit-box instances: x, y, z, w, h, d. */
export const OFFICE_ROVER = {
  treads: [
    [-0.6, 0.22, 0, 0.3, 0.44, 1.0],
    [0.6, 0.22, 0, 0.3, 0.44, 1.0],
  ],
  chest: [0, 0.7, 0, 1.2, 0.5, 0.9],
  head: [0, 1.45, 0, 1.1, 1.0, 0.85],
  stalk: [0.35, 2.15, -0.1, 0.05, 0.5, 0.05],
  shoulder: { x: 0.68, y: 0.85, z: 0.2 },
  arm: { w: 0.14, h: 0.14, d: 0.6 },
  /** The face screen (a 128 x 96 atlas cell) just in front of the head. */
  face: { y: 1.47, z: 0.43, w: 0.86, h: 0.645 },
  tip: { x: 0.35, y: 2.45, z: -0.1, size: 0.34 },
  halo: { size: 2.4, y: 0.03 },
  progress: { count: 16, r: 1.2, size: 0.16, y: 0.04 },
} as const;

/** The desk screen (a 256 x 160 atlas cell) in the desk's frame: beside the Rover's face, toed in toward the middle. */
export const DESK_SCREEN = { x: 0.8, y: 1.28, z: 0.1, w: 0.96, h: 0.6, toe: -0.3 } as const;
