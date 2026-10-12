import { REDUCED_CUT } from "../tower/elevator";
import type { PadTrigger, Vec2 } from "../types";

/**
 * L2 year teleporters: a short beam. Pure. The beam rises over the origin pad, the rover jumps to the
 * target pad (the camera cuts with it), then the beam fades over the target. Reduced motion swaps it
 * for the elevator's 150 ms fade cut, jumping halfway under the fade.
 */
export const BEAM = { out: 0.3, in: 0.3 } as const;

export interface Beam {
  /** Target pad id (`teleport:<year>`). */
  pad: string;
  from: Vec2;
  to: Vec2;
  /** Heading after the jump: east, forward in time along the Career Road. */
  heading: number;
  /** Seconds since the beam started. */
  t: number;
  jumped: boolean;
}

export function startBeam(from: Vec2, pad: PadTrigger): Beam {
  return { pad: pad.id, from: { x: from.x, z: from.z }, to: { x: pad.at.x, z: pad.at.z }, heading: Math.PI / 2, t: 0, jumped: false };
}

export function beamDuration(reduced: boolean): number {
  return reduced ? REDUCED_CUT : BEAM.out + BEAM.in;
}

export function beamJumpAt(reduced: boolean): number {
  return reduced ? REDUCED_CUT / 2 : BEAM.out;
}

/** Advances the beam: `jump` is true on the one step that crosses the jump time, `beam` is null once it is over. */
export function advanceBeam(beam: Beam, dt: number, reduced: boolean): { beam: Beam | null; jump: boolean } {
  const t = beam.t + dt;
  const jump = !beam.jumped && t >= beamJumpAt(reduced);
  if (t >= beamDuration(reduced)) return { beam: null, jump };
  return { beam: { ...beam, t, jumped: beam.jumped || jump }, jump };
}

/** The beam column to draw: over the origin while it rises (0 to 1), over the target while it fades (1 to 0); none under reduced motion. */
export function beamGlow(beam: Beam | null, reduced: boolean): { at: Vec2; level: number } | null {
  if (!beam || reduced) return null;
  if (beam.t < BEAM.out) return { at: beam.from, level: beam.t / BEAM.out };
  return { at: beam.to, level: Math.max(0, 1 - (beam.t - BEAM.out) / BEAM.in) };
}
