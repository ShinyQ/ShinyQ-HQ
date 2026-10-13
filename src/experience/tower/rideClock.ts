import type { Beam } from "../nav/teleport";
import type { Ride } from "./elevator";

/**
 * Live progress of the elevator ride and the L2 teleport beam (perf report D 6.2). The store holds
 * the ride and the beam and changes only when a stage starts, the rover jumps or the motion ends; the
 * Director keeps the per-frame `t` here, keyed by the store object it belongs to, so a retarget, a
 * cancel or a new ride (a new store object) starts from that object's own `t`. Per-frame readers use
 * `rideNow` / `beamNow`; React and the store keep seeing stage changes only. Pure.
 */
const clock = {
  rideOf: null as Ride | null,
  ride: null as Ride | null,
  beamOf: null as Beam | null,
  beam: null as Beam | null,
};

export function rideNow(stored: Ride): Ride {
  return clock.rideOf === stored && clock.ride ? clock.ride : stored;
}

export function keepRide(stored: Ride, next: Ride): void {
  clock.rideOf = stored;
  clock.ride = next;
}

export function clearRide(): void {
  clock.rideOf = null;
  clock.ride = null;
}

export function beamNow(stored: Beam): Beam {
  return clock.beamOf === stored && clock.beam ? clock.beam : stored;
}

export function keepBeam(stored: Beam, next: Beam): void {
  clock.beamOf = stored;
  clock.beam = next;
}

export function clearBeam(): void {
  clock.beamOf = null;
  clock.beam = null;
}
