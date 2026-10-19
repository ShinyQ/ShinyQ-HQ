/**
 * Frame pacing for the 3D canvas (perf report D 8.3, 8.4; round 5 P3; owner item 11). The canvas runs
 * with `frameloop="never"`; `FrameLoop` asks `pacerTick` on every animation frame whether to render: at
 * most FRAME_CAP_FPS (90, 120 and 144 Hz displays skip refreshes, 60 Hz displays render every one),
 * nothing while paused (a panel covers the canvas, coverWatch.ts), and at the idle cadence `idle.ts`
 * picks while nothing moves: 30 fps, or 0 (on demand: a frame only after `invalidateFrames` or at a wake a
 * scene component requested in clock seconds). The clock handed to R3F counts rendered time: the wall
 * time between rendered frames at any cadence, never the paused time nor the idle gap before a faster
 * cadence, so a pause or an input after an on-demand spell never shows up as one long frame. Pure (no React, no three), so Vitest runs it in node.
 */
export const FRAME_CAP_FPS = 60;
export const FRAME_INTERVAL_MS = 1000 / FRAME_CAP_FPS;
/** rAF timestamps jitter by about a millisecond; a frame this early still counts as on time. */
export const FRAME_SLACK_MS = 2;

/** Frames per second the pacer aims for: 60 (the cap), 30 (idle) or 0 (idle, on demand). */
export type Cadence = 60 | 30 | 0;

export interface Pacer {
  /** rAF timestamp (ms) of the last rendered frame, -1 before the first. */
  last: number;
  /** Earliest timestamp (ms) of the next rendered frame (cadence 60 and 30). */
  next: number;
  /** R3F clock (seconds): rendered time only. */
  elapsed: number;
  paused: boolean;
  /** Frames rendered since the page loaded (test and overlay probe; survives canvas remounts). */
  frames: number;
  cadence: Cadence;
  /** Timestamp (ms) of a requested frame at cadence 0, Infinity for none; cleared by every rendered frame. */
  wake: number;
}

export function createPacer(): Pacer {
  return { last: -1, next: 0, elapsed: 0, paused: false, frames: 0, cadence: 60, wake: Number.POSITIVE_INFINITY };
}

/** A new canvas starts its R3F clock at 0 (`setFrameloop("never")` resets it) at full cadence; the frame count keeps going. */
export function resetPacer(p: Pacer): void {
  Object.assign(p, createPacer(), { frames: p.frames });
}

/** Whether the rAF tick at `now` (ms) renders: the R3F clock time in seconds, or null to skip. */
export function pacerTick(p: Pacer, now: number): number | null {
  if (p.paused) return null;
  const interval = 1000 / (p.cadence || FRAME_CAP_FPS);
  if (p.last < 0) {
    p.last = now;
    p.next = now + interval;
    return rendered(p);
  }
  if (now < (p.cadence ? p.next : p.wake) - FRAME_SLACK_MS) return null;
  p.elapsed += (now - p.last) / 1000;
  p.last = now;
  // A steady cadence; after a stall, a hidden tab or an off-beat frame start a fresh one instead of catching up.
  const onBeat = p.cadence && now - p.next < interval;
  p.next = onBeat ? p.next + interval : now + interval;
  return rendered(p);
}

function rendered(p: Pacer): number {
  p.frames += 1;
  p.wake = Number.POSITIVE_INFINITY;
  return p.elapsed;
}

/** Pauses or resumes; a resume renders on the next tick with a one-frame delta. True when the state changed. */
export function setPacerPaused(p: Pacer, paused: boolean, now: number): boolean {
  if (p.paused === paused) return false;
  p.paused = paused;
  if (!paused && p.last >= 0) {
    p.last = now - FRAME_INTERVAL_MS;
    p.next = now;
  }
  return true;
}

/**
 * Sets the cadence; back to 60 renders on the next tick. Going faster drops the idle gap from the clock, like a
 * resume: the first frame after the switch gets a normal frame's delta, so the rover and the camera never jump a
 * whole on-demand gap.
 */
export function setPacerCadence(p: Pacer, cadence: Cadence, now: number): void {
  if (p.cadence === cadence) return;
  p.cadence = cadence;
  if (p.last >= 0 && cadence) {
    p.last = Math.max(p.last, now - 1000 / cadence);
    p.next = p.last + (cadence < FRAME_CAP_FPS ? 1000 / cadence : 0);
  }
}

/** Renders on the next tick whatever the cadence (not while paused): R3F invalidations (prop changes, mounts, text syncs). */
export function invalidateFrames(p: Pacer = framePacer): void {
  p.next = p.wake = 0;
}

/** The pacer of the page's canvas (one 3D view at a time). Below 60 fps (`cadence < 60`) frame-time monitors skip frames. */
export const framePacer = createPacer();

/**
 * Idle detector state (idle.ts, FrameLoop), `window.__hq.idle` in tests. Off under automation (`navigator.webdriver`), so
 * e2e, the perf lane and the virtual clock see 60 fps; a test sets `enabled`.
 */
export const idleRuntime = { enabled: !globalThis.navigator?.webdriver, lastActivity: 0, stillSince: 0 };

export function pauseFrames(paused: boolean, now = performance.now()): void {
  setPacerPaused(framePacer, paused, now);
}

/**
 * At cadence 0, renders a frame once the R3F clock reaches `clockSeconds` (the earliest request wins). Scene
 * components that change on their own at a known clock time (a blink) call it from `useFrame`.
 */
export function wakeFrameAt(clockSeconds: number, p: Pacer = framePacer): void {
  if (p.last >= 0) p.wake = Math.min(p.wake, p.last + (clockSeconds - p.elapsed) * 1000);
}
