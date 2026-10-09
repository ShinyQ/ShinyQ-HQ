import type { FloorId } from "@/content/schema";
import { floorIndex, floorY } from "../config";

export type RideStage = "toDoor" | "boarding" | "closing" | "moving" | "opening" | "exiting";

export interface Ride {
  from: FloorId;
  to: FloorId;
  stage: RideStage;
  /** Seconds spent in the current stage. */
  t: number;
}

/** Fixed stage lengths in seconds. The dolly length depends on the distance. */
export const STAGE_TIME = { boarding: 0.45, closing: 0.2, opening: 0.2, exiting: 0.45 } as const;
/** Reduced motion: a 150 ms fade cut instead of the ride (appendix 02 section 2). */
export const REDUCED_CUT = 0.15;

export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** 0.8 s for one floor (appendix 03), slightly longer for longer trips. */
export function dollyDuration(from: FloorId, to: FloorId): number {
  const floors = Math.abs(floorIndex(to) - floorIndex(from));
  return 0.8 + 0.15 * Math.max(0, floors - 1);
}

export function stageDuration(ride: Ride, reduced: boolean): number {
  if (ride.stage === "toDoor") return Infinity;
  if (ride.stage === "moving") return reduced ? REDUCED_CUT : dollyDuration(ride.from, ride.to);
  return STAGE_TIME[ride.stage];
}

const NEXT: Record<RideStage, RideStage | null> = {
  toDoor: "boarding",
  boarding: "closing",
  closing: "moving",
  moving: "opening",
  opening: "exiting",
  exiting: null,
};

/** Advances the ride. Returns null when the rover has left the car on the new floor. */
export function advanceRide(ride: Ride, dt: number, { atDoor, reduced }: { atDoor: boolean; reduced: boolean }): Ride | null {
  if (ride.stage === "toDoor") {
    if (!atDoor) return { ...ride, t: ride.t + dt };
    return { ...ride, stage: reduced ? "moving" : "boarding", t: 0 };
  }
  const t = ride.t + dt;
  if (t < stageDuration(ride, reduced)) return { ...ride, t };
  const next = reduced && ride.stage === "moving" ? null : NEXT[ride.stage];
  return next ? { ...ride, stage: next, t: 0 } : null;
}

/** Normalized progress in the current stage (0 to 1). */
export function stageProgress(ride: Ride, reduced: boolean): number {
  const d = stageDuration(ride, reduced);
  return Number.isFinite(d) ? Math.min(1, ride.t / d) : 0;
}

/** Height of the elevator car (and the camera rig) during the ride. */
export function carY(ride: Ride, reduced: boolean): number {
  const from = floorY(ride.from);
  const to = floorY(ride.to);
  if (ride.stage === "moving") {
    const p = stageProgress(ride, reduced);
    if (reduced) return p < 0.5 ? from : to;
    return from + (to - from) * easeInOutCubic(p);
  }
  return ride.stage === "opening" || ride.stage === "exiting" ? to : from;
}

/** Direction glyph for the rover face while riding. */
export function rideDirection(ride: Ride): "up" | "down" {
  return floorIndex(ride.to) > floorIndex(ride.from) ? "up" : "down";
}

/** Whether the car doors on `floor` are open at this point of the ride. */
export function doorsOpen(ride: Ride | null, floor: FloorId, reduced: boolean): number {
  if (!ride) return 0;
  const p = stageProgress(ride, reduced);
  if (floor === ride.from) {
    if (ride.stage === "boarding") return 1;
    if (ride.stage === "closing") return 1 - p;
    if (ride.stage === "toDoor") return 0;
  }
  if (floor === ride.to) {
    if (ride.stage === "opening") return p;
    if (ride.stage === "exiting") return 1;
  }
  return 0;
}
