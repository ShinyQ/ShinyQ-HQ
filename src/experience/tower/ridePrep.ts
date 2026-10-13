import type { FloorId } from "@/content/schema";
import type { RideSummary } from "./rideStats";

/**
 * Elevator ride preparation (R5 P6): which mounted floors have their shader programs compiled
 * (`FloorPrep` in Tower.tsx) and how many troika texts each still typesets (`textSync.ts`).
 * `advanceRide` holds the car at closed doors until `destinationReady(to)`. Plain module state mutated
 * outside React, like `roverRuntime`; exposed to Playwright as `window.__hq.ridePrep`.
 */
interface FloorPrepState {
  state: "compiling" | "ready";
  /** The mount that started this compile; a late finish from an earlier mount is ignored. */
  token: number;
}

export const ridePrep = {
  floors: new Map<FloorId, FloorPrepState>(),
  texts: new Map<FloorId, number>(),
  /** The last finished ride, measured by the Director (`rideStats.ts`). */
  lastRide: null as RideSummary | null,
};

let tokens = 0;

/** A floor's content committed: its programs start compiling. Returns this mount's token. */
export function beginFloorPrep(floor: FloorId): number {
  tokens += 1;
  ridePrep.floors.set(floor, { state: "compiling", token: tokens });
  return tokens;
}

export function finishFloorPrep(floor: FloorId, token: number): void {
  const prep = ridePrep.floors.get(floor);
  if (prep?.token === token) prep.state = "ready";
}

/** The floor's content unmounted. */
export function endFloorPrep(floor: FloorId, token: number): void {
  if (ridePrep.floors.get(floor)?.token !== token) return;
  ridePrep.floors.delete(floor);
  ridePrep.texts.delete(floor);
}

export function floorReady(floor: FloorId): boolean {
  return ridePrep.floors.get(floor)?.state === "ready";
}

export function textStarted(floor: FloorId): void {
  ridePrep.texts.set(floor, (ridePrep.texts.get(floor) ?? 0) + 1);
}

export function textDone(floor: FloorId): void {
  ridePrep.texts.set(floor, Math.max(0, (ridePrep.texts.get(floor) ?? 0) - 1));
}

/** The destination is built and typeset, and no mounted floor is still compiling (the car may move). */
export function destinationReady(to: FloorId): boolean {
  if (!floorReady(to) || (ridePrep.texts.get(to) ?? 0) > 0) return false;
  for (const prep of ridePrep.floors.values()) if (prep.state === "compiling") return false;
  return true;
}

/** Tests only. */
export function resetRidePrep(): void {
  ridePrep.floors.clear();
  ridePrep.texts.clear();
  ridePrep.lastRide = null;
}
