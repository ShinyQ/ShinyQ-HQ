import { Matrix4, type Camera } from "three";
import type { FloorId } from "@/content/schema";
import type { Cadence } from "./framePacer";

/**
 * Idle frame cadence (owner item 11, decision 2026-10-19). While the rover is parked, the camera still
 * and no input or store change arrived for IDLE_AFTER_MS, the canvas drops from 60 fps to the floor's
 * idle cadence:
 * - full motion: 30 fps on L2 and B1; 60 on L1, L3, L4 and RF, whose parked views show motion that
 *   judders at 30 fps (data packets, the newsroom ticker, the roof drone, the reactor rings);
 * - reduced motion: on demand (cadence 0: a frame on an R3F invalidation, at a wake a component asked
 *   for, and a heartbeat), and 30 fps on L1, where the profile hologram keeps a slow spin.
 * Any input, store change, resize or Day and night change brings 60 fps back on the next animation frame.
 * Off under automation (`navigator.webdriver`): e2e frame counts, the perf lane and the virtual clock see
 * 60 fps; a test opts in with `window.__hq.idle.enabled = true`.
 */
export const IDLE_AFTER_MS = 1000;
/** Cadence 0 still renders this often (content that streams in, anything no wake covers). */
export const IDLE_HEARTBEAT_MS = 1000;
/** Cadence 0 while the day and night clock runs: the sun and moon move about 5 CSS px a second. */
export const SKY_HEARTBEAT_MS = 250;

/** Idle cadence per floor (Task E1 inventory: docs/agents/3d-experience.md, "Idle cadence"). */
export const IDLE_CADENCE: Record<"full" | "reduced", Record<FloorId, Cadence>> = {
  full: { B1: 30, L1: 60, L2: 30, L3: 60, L4: 60, RF: 60 },
  reduced: { B1: 0, L1: 30, L2: 0, L3: 0, L4: 0, RF: 0 },
};

export interface IdleClock {
  enabled: boolean;
  /** Last input, store change or resize (ms). */
  lastActivity: number;
  /** The rover, the camera and every ride, beam or drive have been still since (ms). */
  stillSince: number;
}

/** Nothing moved and nothing was touched for IDLE_AFTER_MS (`__hq.idleQuiet()` in tests). */
export function isQuiet(c: IdleClock, now: number): boolean {
  return c.enabled && now - c.lastActivity >= IDLE_AFTER_MS && now - c.stillSince >= IDLE_AFTER_MS;
}

/** 60 until the scene is quiet, then the floor's idle cadence. */
export function idleCadence(c: IdleClock, now: number, reducedMotion: boolean, floor: FloorId): Cadence {
  return isQuiet(c, now) ? (IDLE_CADENCE[reducedMotion ? "reduced" : "full"][floor] ?? 60) : 60;
}

/** Idle: the canvas renders below 60 fps now. */
export function idleState(c: IdleClock, now: number, reducedMotion: boolean, floor: FloorId): boolean {
  return idleCadence(c, now, reducedMotion, floor) < 60;
}

/** The parts of the store state that mean "something is moving" (the store state itself fits). */
export interface MotionState {
  phase: string;
  ride: unknown;
  beam: unknown;
  mission: { status: string } | null;
  reducedMotion: boolean;
}

/** The parts of the rover runtime that mean "something is moving". */
export interface RoverMotion {
  speed: number;
  driving: boolean;
  autopilot: unknown;
  boost: number;
  idle: string | null;
}

const BUSY_PHASES = new Set(["boot", "intro", "autopilot", "elevator"]);
const IDLE_MOTIONS = new Set(["look", "spin", "hop"]);

/**
 * True while the scene moves or waits on its own frames: a ride, a beam, the intro, a mission, a drive, a
 * boost, an idle look, spin or hop. Short tails (a decaying spin, an arrival glide) fall inside the 1 s
 * still window; camera and rover moves are caught by `observeFrame`.
 */
export function sceneBusy(s: MotionState, r: RoverMotion): boolean {
  return (
    BUSY_PHASES.has(s.phase) ||
    s.ride !== null ||
    s.beam !== null ||
    s.mission?.status === "running" ||
    r.speed > 0.01 ||
    r.driving ||
    r.autopilot !== null ||
    r.boost > 0.001 ||
    (!s.reducedMotion && r.idle !== null && IDLE_MOTIONS.has(r.idle))
  );
}

/** Live state (the canvas's FrameLoop drives it); `window.__hq.idle` in tests. */
export const idleRuntime: IdleClock = {
  enabled: typeof navigator === "undefined" || navigator.webdriver !== true,
  lastActivity: 0,
  stillSince: 0,
};

const lastCamera = new Matrix4();
const lastProjection = new Matrix4();
const lastPose = [Number.NaN, 0, 0, 0];
const moved = (a: Matrix4, b: Matrix4) => a.elements.some((v, i) => !(Math.abs(v - b.elements[i]) <= 1e-5));

/** Input, a store change or a resize. */
export function noteActivity(now: number): void {
  idleRuntime.lastActivity = now;
}

/** A new canvas starts busy (its first second renders at 60 fps). */
export function resetIdle(now: number): void {
  idleRuntime.lastActivity = idleRuntime.stillSince = now;
  lastPose[0] = lastCamera.elements[0] = Number.NaN;
}

/** After every rendered frame: restarts the still timer when the scene is busy, the camera moved (position, orbit, zoom, field of view) or the rover moved. */
export function observeFrame(camera: Camera, pose: readonly number[], busy: boolean, now: number): void {
  let still = !busy;
  if (moved(camera.matrixWorld, lastCamera) || moved(camera.projectionMatrix, lastProjection)) {
    lastCamera.copy(camera.matrixWorld);
    lastProjection.copy(camera.projectionMatrix);
    still = false;
  }
  for (let i = 0; i < 4; i++) {
    if (Math.abs(pose[i] - lastPose[i]) <= 1e-4) continue;
    lastPose[i] = pose[i];
    still = false;
  }
  if (!still) idleRuntime.stillSince = now;
}
