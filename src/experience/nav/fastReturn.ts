import type { FloorId } from "@/content/schema";
import type { SignSpec } from "../fx/signLayout";
import type { FloorLayout, PadTrigger, Vec2 } from "../types";
import { elevatorPadId } from "./pads";
import type { Beam } from "./teleport";

/**
 * Fast return (owner decision 2026-10-14: "Beam when far"). Pure: no React or three.
 *
 * - Smart floor change: a ride requested more than `beamDistance` from the floor's elevator call pad
 *   (straight line to `FloorLayout.approach`) beams the rover onto that pad, facing the car, and the
 *   ride boards at once. Closer than that the rover drives to the door as before.
 * - Express Return pads (`return:<floor>`, `FloorLayout.returnPad`): stopping on one (or point-and-go
 *   to it) beams the rover to its floor's elevator call pad, facing the car.
 *
 * Both reuse the L2 teleport beam (`teleport.ts`: 0.3 s rise, jump, 0.3 s fade; the 150 ms fade cut
 * under reduced motion).
 */
export const FAST_RETURN = {
  /** Farther than this (u, straight line) from the elevator call pad, a floor change beams into the car. */
  beamDistance: 25,
  /** "Back to elevator" sign: plate center height (u), clear of the pad icon and the point-and-go name tag. */
  signY: 4.4,
  signSize: 0.42,
  /** Green, like the Return pad and its beam (PAD_TONE.return). */
  signColor: "#34d399",
} as const;

/** The car sits west of the call pad on every floor: heading -PI/2 faces it (forward is (sin, cos)). */
export const CAR_HEADING = -Math.PI / 2;

export const returnPadId = (floor: FloorId) => `return:${floor}`;

/** The floor's Express Return pad, or null when its layout sets no `returnPad`. */
export function returnPad(layout: Pick<FloorLayout, "id" | "returnPad">, face: number): PadTrigger | null {
  if (!layout.returnPad) return null;
  return { id: returnPadId(layout.id), kind: "return", at: { x: layout.returnPad.x, z: layout.returnPad.z }, face };
}

/** Straight-line distance from `pose` to the floor's elevator call pad. */
export function distanceToElevator(pose: Vec2, layout: Pick<FloorLayout, "approach">): number {
  return Math.hypot(pose.x - layout.approach.x, pose.z - layout.approach.z);
}

/** A floor change from `pose` beams into the car (more than `beamDistance` away) instead of driving. */
export function shouldBeamToCar(pose: Vec2, layout: Pick<FloorLayout, "approach">): boolean {
  return distanceToElevator(pose, layout) > FAST_RETURN.beamDistance;
}

/** A beam from `from` onto the floor's elevator call pad, facing the car. */
export function elevatorBeam(from: Vec2, layout: Pick<FloorLayout, "id" | "approach">): Beam {
  return { pad: elevatorPadId(layout.id), from: { x: from.x, z: from.z }, to: { x: layout.approach.x, z: layout.approach.z }, heading: CAR_HEADING, t: 0, jumped: false };
}

/** Beams that land on an elevator call pad (Return pads, far floor changes), as opposed to L2 year teleports. */
export function isElevatorBeam(beam: Pick<Beam, "pad">): boolean {
  return beam.pad.startsWith("elevator:");
}

/** The floating "Back to elevator" sign over a Return pad (fades with the rover's distance along x, like L2 labels). */
export function returnSign(pad: Vec2, text: string): SignSpec {
  return { text, x: pad.x, y: FAST_RETURN.signY, z: pad.z, color: FAST_RETURN.signColor, fontSize: FAST_RETURN.signSize, letterSpacing: 0.04, fadeX: pad.x };
}
