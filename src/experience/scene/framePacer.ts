/**
 * Frame pacing for the 3D canvas (perf report D 8.3, 8.4; round 5 P3; owner item 11). The canvas runs
 * with `frameloop="never"`; `FrameLoop` asks `pacerTick` on every animation frame whether to render: at
 * most FRAME_CAP_FPS (90, 120 and 144 Hz displays skip refreshes, 60 Hz displays render every one),
 * nothing while paused (a panel covers the canvas, coverWatch.ts), and at the idle cadence `idle.ts`
 * picks while nothing moves: 30 fps, or 0 (on demand: a frame only after `invalidatePacer` or at a wake a
 * scene component requested in clock seconds). The clock handed to R3F counts rendered time: the wall
 * time between rendered frames at any cadence, never the paused time, so a pause never shows up as one
 * long frame. Pure (no React, no three), so Vitest runs it in node.
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
  /** Something changed: render on the next tick at any cadence (not while paused). */
  dirty: boolean;
  /** Timestamp (ms) of a requested frame at cadence 0, Infinity for none; cleared by every rendered frame. */
  wake: number;
  /** The last rendered frame, or the gap before it, ran at an idle cadence: frame-time monitors skip it. */
  idleFrame: boolean;
  /** Cadence of the last rendered frame. */
  lastCadence: Cadence;
}

export function createPacer(): Pacer {
  return { last: -1, next: 0, elapsed: 0, paused: false, frames: 0, cadence: 60, dirty: false, wake: Number.POSITIVE_INFINITY, idleFrame: false, lastCadence: 60 };
}

/** A new canvas starts its R3F clock at 0 (`setFrameloop("never")` resets it) at full cadence; the frame count keeps going. */
export function resetPacer(p: Pacer): void {
  p.last = -1;
  p.next = 0;
  p.elapsed = 0;
  p.paused = false;
  p.cadence = 60;
  p.dirty = false;
  p.wake = Number.POSITIVE_INFINITY;
  p.idleFrame = false;
  p.lastCadence = 60;
}

const intervalOf = (c: Cadence) => (c === 30 ? 1000 / 30 : FRAME_INTERVAL_MS);

/** Whether the rAF tick at `now` (ms) renders: the R3F clock time in seconds, or null to skip. */
export function pacerTick(p: Pacer, now: number): number | null {
  if (p.paused) return null;
  const interval = intervalOf(p.cadence);
  if (p.last < 0) {
    p.last = now;
    p.next = now + interval;
    return rendered(p);
  }
  if (!p.dirty && now < (p.cadence === 0 ? p.wake : p.next) - FRAME_SLACK_MS) return null;
  p.elapsed += (now - p.last) / 1000;
  p.last = now;
  // A steady cadence; after a stall, a hidden tab or an off-beat frame start a fresh one instead of catching up.
  const onBeat = p.cadence !== 0 && !p.dirty && now - p.next < interval;
  p.next = onBeat ? p.next + interval : now + interval;
  return rendered(p);
}

function rendered(p: Pacer): number {
  p.frames += 1;
  p.dirty = false;
  p.wake = Number.POSITIVE_INFINITY;
  p.idleFrame = p.cadence !== 60 || p.lastCadence !== 60;
  p.lastCadence = p.cadence;
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

/** Sets the cadence; back to 60 renders on the next tick. True when it changed. */
export function setPacerCadence(p: Pacer, cadence: Cadence, now: number): boolean {
  if (p.cadence === cadence) return false;
  p.cadence = cadence;
  if (p.last >= 0) {
    if (cadence === 60) p.next = now;
    else if (cadence === 30) p.next = p.last + intervalOf(30);
  }
  return true;
}

/** Renders on the next tick whatever the cadence (a change the idle detector cannot see). */
export function invalidatePacer(p: Pacer): void {
  p.dirty = true;
}

/** At cadence 0, renders a frame once the R3F clock reaches `clockSeconds` (the earliest request wins). */
export function requestPacerWake(p: Pacer, clockSeconds: number): void {
  if (p.last < 0) return;
  p.wake = Math.min(p.wake, p.last + (clockSeconds - p.elapsed) * 1000);
}

/** The pacer of the page's canvas (one 3D view at a time). */
export const framePacer = createPacer();

export function pauseFrames(paused: boolean, now = performance.now()): void {
  setPacerPaused(framePacer, paused, now);
}

/** Renders the page's canvas on the next tick (on-demand cadence included). */
export function invalidateFrames(): void {
  invalidatePacer(framePacer);
}

/** Scene components that change on their own at a known clock time (a blink) call this from `useFrame`. */
export function wakeFrameAt(clockSeconds: number): void {
  requestPacerWake(framePacer, clockSeconds);
}
