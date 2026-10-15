import type { FloorId } from "@/content/schema";
import { PREPARE_TIMEOUT, type RideStage } from "./elevator";

/** One finished ride, as measured on the visitor's device (`window.__hq.ridePrep.lastRide`, `?perf=1`). */
export interface RideSummary {
  from: FloorId;
  to: FloorId;
  /** Frames from boarding (or the reduced-motion cut) to the arrival. */
  frames: number;
  /** Frames while the car moved, and how many different car heights they showed. */
  dollyFrames: number;
  distinctY: number;
  /** Largest car jump between two moving frames, as a share of the trip height (0 to 1). */
  maxStep: number;
  longestFrameMs: number;
  /** Seconds the car waited at closed doors for the destination, and whether it gave up. */
  held: number;
  timedOut: boolean;
  /** Seconds the car waited at closed doors for the destination floor's code chunk (no timeout). */
  chunkHeld: number;
  /** Shader programs linked between the start of the dolly and the arrival (0 when precompile worked). */
  programs: number;
  /** Wall time from boarding to the arrival. */
  elapsedMs: number;
}

export interface RideStats {
  summary: RideSummary;
  seen: Set<string>;
  lastY: number | null;
  programsAtMove: number | null;
  /** Trip height in world units. */
  span: number;
}

export function startRideStats(from: FloorId, to: FloorId, span: number): RideStats {
  return {
    summary: { from, to, frames: 0, dollyFrames: 0, distinctY: 0, maxStep: 0, longestFrameMs: 0, held: 0, timedOut: false, chunkHeld: 0, programs: 0, elapsedMs: 0 },
    seen: new Set(),
    lastY: null,
    programsAtMove: null,
    span,
  };
}

/** Records one frame of a ride past `toDoor`: its stage, the car height drawn and the raw frame time. */
export function stepRideStats(stats: RideStats, sample: { stage: RideStage; y: number; frameDt: number; held: number; chunkHeld?: number; programs: number }): void {
  const s = stats.summary;
  s.frames += 1;
  s.elapsedMs += sample.frameDt * 1000;
  s.longestFrameMs = Math.max(s.longestFrameMs, sample.frameDt * 1000);
  s.held = Math.max(s.held, sample.held);
  s.chunkHeld = Math.max(s.chunkHeld, sample.chunkHeld ?? 0);
  if (sample.stage !== "moving") return;
  stats.programsAtMove ??= sample.programs;
  s.dollyFrames += 1;
  stats.seen.add(sample.y.toFixed(3));
  s.distinctY = stats.seen.size;
  if (stats.lastY !== null && stats.span > 0) s.maxStep = Math.max(s.maxStep, Math.abs(sample.y - stats.lastY) / stats.span);
  stats.lastY = sample.y;
}

export function finishRideStats(stats: RideStats, programs: number): RideSummary {
  const s = stats.summary;
  return {
    ...s,
    timedOut: s.held >= PREPARE_TIMEOUT,
    programs: stats.programsAtMove === null ? 0 : Math.max(0, programs - stats.programsAtMove),
  };
}

export function formatRideSummary(s: RideSummary): string {
  const waited = `waited ${s.held.toFixed(2)} s${s.timedOut ? " (gave up)" : ""}`;
  const chunk = s.chunkHeld > 0 ? `, chunk ${s.chunkHeld.toFixed(2)} s` : "";
  return `[hq ride] ${s.from} to ${s.to}: ${s.dollyFrames} dolly frames, ${s.distinctY} car heights, biggest jump ${Math.round(s.maxStep * 100)}% of the trip, longest frame ${Math.round(s.longestFrameMs)} ms, ${waited}${chunk}, ${s.programs} shaders compiled while moving, ${(s.elapsedMs / 1000).toFixed(2)} s in total`;
}
