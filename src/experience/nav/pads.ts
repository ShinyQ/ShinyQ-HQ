import type { FloorId } from "@/content/schema";
import type { FloorLayout, PadTrigger, Vec2 } from "../types";
import { stepDoorLatch, type DoorLatch } from "./doors";

/**
 * Floor pads (owner request): a glowing call pad in front of the elevator door on every floor, and a
 * teleporter on every L2 year plaza. Pure: no React or three. Pads are not obstacles; they use the door
 * latch, so a pad opens its picker once when the rover stops or slows on it, and again only after the
 * rover has left it.
 */
export const PAD = {
  /** Trigger and glow radius (u): wider than the rover (radius 1), so parking on it is easy. */
  radius: 1.4,
  /** A fast pass opens a pad only after this long on it; stopping or slowing opens it at once. */
  dwell: 0.6,
  /** Floating icon height and width (u). */
  iconY: 2.2,
  iconSize: 1.4,
} as const;

/**
 * What a pad opens: the floor list (elevator), the year list (L2 teleporter, `from` is its own year), or
 * the L2 time console (every year plus Back to elevator).
 */
export type PickerRequest = { kind: "floor" } | { kind: "year"; from: number } | { kind: "console" };

export const elevatorPadId = (floor: FloorId) => `elevator:${floor}`;
export const teleportPadId = (year: number) => `teleport:${year}`;

/** The elevator call pad: on the approach spot in front of the shaft door, where the rover waits for the car. */
export function elevatorPad(layout: Pick<FloorLayout, "id" | "approach">, face: number): PadTrigger {
  return { id: elevatorPadId(layout.id), kind: "elevator", at: { x: layout.approach.x, z: layout.approach.z }, face };
}

export function padRadius(pad: PadTrigger): number {
  return pad.radius ?? PAD.radius;
}

/** The pad whose circle contains `p`, if any. */
export function padAt(pads: readonly PadTrigger[] | undefined, p: Vec2): PadTrigger | null {
  if (!pads) return null;
  for (const pad of pads) if (Math.hypot(p.x - pad.at.x, p.z - pad.at.z) <= padRadius(pad)) return pad;
  return null;
}

export function pickerFor(pad: PadTrigger): PickerRequest {
  return pad.kind === "teleport" && pad.year !== undefined ? { kind: "year", from: pad.year } : { kind: "floor" };
}

export interface PadStep {
  /** A ride runs: the rover is in the shaft, so no pad counts. */
  riding: boolean;
  /** A pad may open its picker now (phase explore, no beam, no picker open). */
  explore: boolean;
  /** The rover follows a path (scrub, autopilot) or a mission runs. */
  following: boolean;
  now: number;
  speed: number;
}

/** The door latch over pads: the pad whose picker should open this frame, if any. */
export function stepPadLatch(latch: DoorLatch<string>, pads: readonly PadTrigger[] | undefined, pose: Vec2, step: PadStep): PadTrigger | null {
  const pad = step.riding ? null : padAt(pads, pose);
  const fired = stepDoorLatch(latch, pad?.id ?? null, {
    explore: step.explore,
    following: step.following,
    now: step.now,
    speed: step.speed,
    dwell: PAD.dwell,
  });
  return fired && pad ? pad : null;
}

/** A latch for a rover standing at `p` (deep link, resume, elevator arrival): the pad under it stays quiet until it leaves. */
export function primedPadLatch(pads: readonly PadTrigger[] | undefined, p: Vec2): DoorLatch<string> {
  return { room: padAt(pads, p)?.id ?? null };
}
