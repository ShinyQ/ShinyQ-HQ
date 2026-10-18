import type { FloorId } from "@/content/schema";
import { floorIndex, floorY } from "../config";

export type RideStage = "toDoor" | "boarding" | "closing" | "moving" | "opening" | "exiting";

export interface Ride {
  from: FloorId;
  to: FloorId;
  stage: RideStage;
  /** Ride time spent in the current stage, in seconds (at most RIDE_CAP per frame). */
  t: number;
  /** Seconds the car waited at closed doors for the destination floor (see PREPARE_TIMEOUT). */
  held?: number;
  /** Seconds the car waited at closed doors for the destination floor's code chunk (Round 7 B; no timeout). */
  chunkHeld?: number;
}

/** Fixed stage lengths in seconds. The dolly length depends on the distance. */
export const STAGE_TIME = { boarding: 0.45, closing: 0.2, opening: 0.2, exiting: 0.45 } as const;
/** Reduced motion: a 150 ms fade cut instead of the ride (appendix 02 section 2). */
export const REDUCED_CUT = 0.15;
/**
 * Most ride time one frame may add (R5 P6). A long frame (a shader compile, a floor mounting) pauses
 * the ride instead of skipping it: at 60 fps a stall adds at most 1/30 s, so the 0.8 s dolly shows at
 * least 16 car heights however long the stall. Devices that are steadily slower keep riding in real
 * time down to 20 fps (`rideCap`).
 */
export const RIDE_CAP = { min: 1 / 30, max: 1 / 20 } as const;
/** Starting estimate of a typical frame (60 fps) for `trackFrameDt`. */
export const TYPICAL_FRAME_DT = 1 / 60;
/** Longest wait at closed doors for the destination floor to be built, compiled and typeset (R5 P6). */
export const PREPARE_TIMEOUT = 1.5;

/** Ride time one frame may add: twice the typical frame, within RIDE_CAP. */
export function rideCap(typicalDt: number): number {
  return Math.min(RIDE_CAP.max, Math.max(RIDE_CAP.min, 2 * typicalDt));
}

/** Moving average of recent frame times; one stall moves it by at most a tenth of RIDE_CAP.max. */
export function trackFrameDt(typical: number, frameDt: number): number {
  return typical + (Math.min(Math.max(frameDt, 0), RIDE_CAP.max) - typical) * 0.1;
}

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

export interface RideOptions {
  /** The rover reached the shaft door (`toDoor` only). */
  atDoor: boolean;
  reduced: boolean;
  /** The destination floor is ready (`destinationReady` in ridePrep.ts); the car waits at closed doors until then. */
  ready?: boolean;
  /** The destination floor's chunk has not settled (floors/floorChunks.ts): never move, whatever the wait. */
  hold?: boolean;
  /** Most ride time this frame may add (`rideCap`); defaults to RIDE_CAP.min. */
  cap?: number;
  /** Test-only animation speed (`animationSpeed`): multiplies the capped stage time, never the closed-door waits. */
  speed?: number;
}

/**
 * Enters `moving` once the destination is ready or the wait hit PREPARE_TIMEOUT; until then returns
 * `waiting` (doors closed) with the wait grown by the frame time, not the capped ride time. While the
 * destination chunk loads (`hold`) the car never moves and that time counts as `chunkHeld`, so the
 * preparation timeout only starts once the floor can mount: a ride never shows an empty floor.
 */
function enterMoving(ride: Ride, frameDt: number, ready: boolean, hold: boolean, waiting: Ride): Ride {
  if (hold) return { ...waiting, chunkHeld: (ride.chunkHeld ?? 0) + frameDt };
  const held = ride.held ?? 0;
  if (ready || held >= PREPARE_TIMEOUT) return { ...ride, stage: "moving", t: 0, held };
  return { ...waiting, held: held + frameDt };
}

/**
 * Advances the ride by one frame of `frameDt` seconds. Returns null when the rover has left the car on
 * the new floor. `toDoor` runs on the frame time (the rover drives in real time); every other stage
 * adds at most `cap` (times the test-only `speed`). The car only starts moving once `ready` (or after PREPARE_TIMEOUT, and never while `hold`): at the end of
 * `closing`, or at the door under reduced motion.
 */
export function advanceRide(ride: Ride, frameDt: number, { atDoor, reduced, ready = true, hold = false, cap = RIDE_CAP.min, speed = 1 }: RideOptions): Ride | null {
  if (ride.stage === "toDoor") {
    if (!atDoor) return { ...ride, t: ride.t + frameDt };
    return reduced ? enterMoving(ride, frameDt, ready, hold, ride) : { ...ride, stage: "boarding", t: 0 };
  }
  const duration = stageDuration(ride, reduced);
  const t = ride.t + Math.min(frameDt, cap) * speed;
  if (t < duration) return { ...ride, t };
  const next = reduced && ride.stage === "moving" ? null : NEXT[ride.stage];
  if (next === "moving") return enterMoving(ride, frameDt, ready, hold, { ...ride, t: duration });
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
