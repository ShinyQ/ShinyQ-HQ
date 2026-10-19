import type { Camera } from "three";
import type { FloorId } from "@/content/schema";
import { idleRuntime, type Cadence } from "./framePacer";

/**
 * Idle frame cadence (owner item 11, decision 2026-10-19). While the camera is still and no input, store change
 * or resize arrived for IDLE_AFTER_MS, the canvas drops from 60 fps to the floor's idle cadence:
 * - full motion: 30 fps on L2 and B1; 60 on L1, L3, L4 and RF, whose parked views show motion that judders at
 *   30 fps (data packets, the newsroom ticker, the roof drone, the reactor rings);
 * - reduced motion: on demand (cadence 0: a frame on an R3F invalidation or at a wake a component asked for),
 *   and 30 fps on L1, where the profile hologram keeps a slow spin.
 * `FrameLoop` runs it inline: input (the rover's activity counter), store changes and resizes bring 60 fps back
 * on the next animation frame. Off under automation (`idleRuntime` in framePacer.ts).
 */
export const IDLE_AFTER_MS = 1000;

export interface IdleClock {
  enabled: boolean;
  /** Last input, store change or resize (ms). */
  lastActivity: number;
  /** The camera has been still and the scene not busy since (ms). */
  stillSince: number;
}

/** 60 until nothing moved and nothing was touched for IDLE_AFTER_MS, then the floor's idle cadence. */
export function idleCadence(c: IdleClock, now: number, reducedMotion: boolean, floor: FloorId): Cadence {
  if (!c.enabled || now - c.lastActivity < IDLE_AFTER_MS || now - c.stillSince < IDLE_AFTER_MS) return 60;
  return reducedMotion ? (floor === "L1" ? 30 : 0) : floor === "L2" || floor === "B1" ? 30 : 60;
}

/** The store state and the rover runtime fit these. */
export interface MotionState {
  phase: string;
  ride: unknown;
  beam: unknown;
  mission: { status: string } | null;
  reducedMotion: boolean;
}
export interface RoverMotion {
  face: string;
  status?: string;
  idle: string | null;
}

/**
 * True while the scene changes on its own with a still camera: a ride (doors, holds), a beam, a running mission,
 * the boot or the intro, any face but the idle one (arrived, blocked, thinking, driving, boot), a status line, or
 * an idle look, spin or hop (full motion). A moving rover moves the follow camera, which `observeFrame` sees.
 */
export function sceneBusy(s: MotionState, r: RoverMotion): boolean {
  return Boolean(
    s.ride || s.beam || s.mission?.status === "running" || /^(boot|intro)$/.test(s.phase) || r.face !== "idle" || r.status || (!s.reducedMotion && /^(look|spin|hop)$/.test(r.idle ?? "")),
  );
}

const seen = new Float64Array(16);

/** A new canvas starts busy: its first second renders at 60 fps. */
export function resetIdle(now: number): void {
  idleRuntime.lastActivity = idleRuntime.stillSince = now;
  seen[0] = Number.NaN;
}

/** After every rendered frame: restarts the still timer while the scene is busy or the camera moved (position, orbit, zoom). */
export function observeFrame(camera: Camera, busy: boolean, now: number): void {
  const m = camera.matrixWorld.elements;
  for (let i = 0; i < 16; i++) {
    if (Math.abs(m[i] - seen[i]) <= 1e-5) continue;
    seen[i] = m[i];
    busy = true;
  }
  if (busy) idleRuntime.stillSince = now;
}
