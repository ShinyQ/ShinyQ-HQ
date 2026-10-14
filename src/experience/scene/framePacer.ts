/**
 * Frame pacing for the 3D canvas (perf report D 8.3, 8.4; round 5 P3). The canvas runs with
 * `frameloop="never"`; `FrameLoop` asks `pacerTick` on every animation frame whether to render: at
 * most FRAME_CAP_FPS (90, 120 and 144 Hz displays skip refreshes, 60 Hz displays render every one,
 * and there is no idle cap), and nothing while paused (a panel covers the canvas, coverWatch.ts).
 * The clock handed to R3F counts rendered time only, so a pause never shows up as one long frame.
 * Pure (no React, no three), so Vitest runs it in node.
 */
export const FRAME_CAP_FPS = 60;
export const FRAME_INTERVAL_MS = 1000 / FRAME_CAP_FPS;
/** rAF timestamps jitter by about a millisecond; a frame this early still counts as on time. */
export const FRAME_SLACK_MS = 2;

export interface Pacer {
  /** rAF timestamp (ms) of the last rendered frame, -1 before the first. */
  last: number;
  /** Earliest timestamp (ms) of the next rendered frame. */
  next: number;
  /** R3F clock (seconds): rendered time only. */
  elapsed: number;
  paused: boolean;
  /** Frames rendered since the page loaded (test and overlay probe; survives canvas remounts). */
  frames: number;
}

export function createPacer(): Pacer {
  return { last: -1, next: 0, elapsed: 0, paused: false, frames: 0 };
}

/** A new canvas starts its R3F clock at 0 (`setFrameloop("never")` resets it); the frame count keeps going. */
export function resetPacer(p: Pacer): void {
  p.last = -1;
  p.next = 0;
  p.elapsed = 0;
  p.paused = false;
}

/** Whether the rAF tick at `now` (ms) renders: the R3F clock time in seconds, or null to skip. */
export function pacerTick(p: Pacer, now: number): number | null {
  if (p.paused) return null;
  if (p.last < 0) {
    p.last = now;
    p.next = now + FRAME_INTERVAL_MS;
    p.frames += 1;
    return p.elapsed;
  }
  if (now < p.next - FRAME_SLACK_MS) return null;
  p.elapsed += (now - p.last) / 1000;
  p.last = now;
  // A steady cadence; after a stall (or a hidden tab) start a fresh one instead of catching up.
  p.next = now - p.next >= FRAME_INTERVAL_MS ? now + FRAME_INTERVAL_MS : p.next + FRAME_INTERVAL_MS;
  p.frames += 1;
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

/** The pacer of the page's canvas (one 3D view at a time). */
export const framePacer = createPacer();

export function pauseFrames(paused: boolean, now = performance.now()): void {
  setPacerPaused(framePacer, paused, now);
}
