import { ONE_SHOTS, createAmbientPad, createRumble, type LoopVoice, type RumbleVoice } from "./synth";
import type { AudioEngine, AudioEngineDeps, SoundName } from "./types";

export const SOUND_STORAGE_KEY = "hq:sound";
export const CLICK_RATE_LIMIT = 20;
const CLICK_WINDOW_MS = 1000;
/** Time constant of the master fade when muting or unmuting (seconds). */
const FADE_TIME_CONSTANT = 0.03;
/** Delay before suspending the context after a mute, so the fade can finish (ms). */
const SUSPEND_DELAY_MS = 150;
/**
 * User-activation events. Browsers only let an AudioContext start inside one of these; on touch screens
 * that is the end of a tap (pointerup, touchend, click), not touchstart, so all of them are listened to.
 */
const GESTURE_EVENTS = ["pointerdown", "pointerup", "keydown", "touchend", "click"] as const;

type AudioContextCtor = new () => AudioContext;

function defaultCreateContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor };
  const Ctor = w.AudioContext ?? w.webkitAudioContext;
  return Ctor ? new Ctor() : null;
}

function defaultStorage(): AudioEngineDeps["storage"] {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function defaultDoc(): AudioEngineDeps["doc"] {
  return typeof document === "undefined" ? null : document;
}

function defaultNow(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function ignore(promise: Promise<void> | undefined): void {
  promise?.catch(() => {});
}

export function createAudioEngine(deps: Partial<AudioEngineDeps> = {}): AudioEngine {
  const createContext: () => AudioContext | null = deps.createContext ?? defaultCreateContext;
  const storage = deps.storage !== undefined ? deps.storage : defaultStorage();
  const doc = deps.doc !== undefined ? deps.doc : defaultDoc();
  const now = deps.now ?? defaultNow;

  const listeners = new Set<() => void>();
  let muted = readMuted();
  /** Paused while the 3D view is closed (Page View): silent without touching the stored preference. */
  let paused = false;
  let disposed = false;
  let unavailable = false;
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let ambient: LoopVoice | null = null;
  let rumble: RumbleVoice | null = null;
  let rumbleSpeed = 0;
  let suspendTimer: ReturnType<typeof setTimeout> | null = null;
  let clickTimes: number[] = [];

  /** Sound is on by default; only a stored "off" (the visitor muted) keeps it muted. */
  function readMuted(): boolean {
    try {
      return storage?.getItem(SOUND_STORAGE_KEY) === "off";
    } catch {
      return false;
    }
  }

  const silent = () => muted || paused || disposed;

  function persist(): void {
    try {
      storage?.setItem(SOUND_STORAGE_KEY, muted ? "off" : "on");
    } catch {
      // Storage may be full or blocked (private mode); the in-memory setting still applies.
    }
  }

  function isHidden(): boolean {
    return doc?.visibilityState === "hidden";
  }

  function clearSuspendTimer(): void {
    if (suspendTimer !== null) {
      clearTimeout(suspendTimer);
      suspendTimer = null;
    }
  }

  /** Creates the context, master bus and ambient pad on demand. Only called while unmuted. */
  function ensureContext(): AudioContext | null {
    if (ctx || unavailable || disposed) return ctx;
    try {
      ctx = createContext();
    } catch {
      ctx = null;
    }
    if (!ctx) {
      unavailable = true;
      return null;
    }
    master = ctx.createGain();
    master.gain.setValueAtTime(0, ctx.currentTime);
    master.gain.setTargetAtTime(1, ctx.currentTime, FADE_TIME_CONSTANT);
    master.connect(ctx.destination);
    ambient = createAmbientPad(ctx, master);
    return ctx;
  }

  function resume(): void {
    if (ctx && !isHidden() && ctx.state !== "running" && ctx.state !== "closed") ignore(ctx.resume());
  }

  function ensureRumble(): RumbleVoice | null {
    if (!rumble && ctx && master) rumble = createRumble(ctx, master);
    return rumble;
  }

  function notify(): void {
    for (const listener of [...listeners]) listener();
  }

  function onVisibilityChange(): void {
    if (!ctx || disposed) return;
    if (isHidden()) {
      clearSuspendTimer();
      ignore(ctx.suspend());
    } else if (!muted && !paused) {
      resume();
    }
  }

  /**
   * Browsers keep a context suspended until a user gesture, so the first click, tap or key press in
   * the HQ starts it (and the ambient hum). Listeners stay until the context really runs.
   */
  function onGesture(): void {
    if (muted || disposed) {
      removeGestureListeners();
      return;
    }
    if (paused) return;
    const context = ensureContext();
    if (!context) {
      removeGestureListeners();
      return;
    }
    if (context.state === "running") {
      removeGestureListeners();
      return;
    }
    if (isHidden() || context.state === "closed") return;
    context
      .resume()
      ?.then(() => {
        if (context.state === "running") removeGestureListeners();
      })
      .catch(() => {});
  }

  function removeGestureListeners(): void {
    for (const type of GESTURE_EVENTS) doc?.removeEventListener(type, onGesture, true);
  }

  doc?.addEventListener("visibilitychange", onVisibilityChange);
  if (!muted) {
    for (const type of GESTURE_EVENTS) doc?.addEventListener(type, onGesture, true);
  }

  /** Fades the master bus out, then suspends the context (muted or paused). */
  function fadeOut(): void {
    if (!ctx || !master) return;
    const context = ctx;
    master.gain.cancelScheduledValues(context.currentTime);
    master.gain.setTargetAtTime(0, context.currentTime, FADE_TIME_CONSTANT);
    rumble?.setSpeed(0);
    clearSuspendTimer();
    suspendTimer = setTimeout(() => {
      suspendTimer = null;
      if ((muted || paused) && !disposed) ignore(context.suspend());
    }, SUSPEND_DELAY_MS);
  }

  function allowClick(): boolean {
    const t = now();
    clickTimes = clickTimes.filter((time) => t - time < CLICK_WINDOW_MS);
    if (clickTimes.length >= CLICK_RATE_LIMIT) return false;
    clickTimes.push(t);
    return true;
  }

  const engine: AudioEngine = {
    play(name: SoundName) {
      if (silent()) return;
      if (name === "click" && !allowClick()) return;
      const context = ensureContext();
      if (!context || !master) return;
      resume();
      ONE_SHOTS[name](context, master, context.currentTime);
    },

    setRumble(speed: number) {
      rumbleSpeed = speed;
      if (silent()) return;
      if (!rumble && !(speed > 1)) return;
      if (!ensureContext()) return;
      ensureRumble()?.setSpeed(rumbleSpeed);
    },

    setMuted(next: boolean) {
      if (disposed) return;
      const changed = next !== muted;
      muted = next;
      persist();
      removeGestureListeners();
      if (!muted && !paused) {
        clearSuspendTimer();
        const context = ensureContext();
        if (context && master) {
          master.gain.cancelScheduledValues(context.currentTime);
          master.gain.setTargetAtTime(1, context.currentTime, FADE_TIME_CONSTANT);
          if (context.state !== "closed") ignore(context.resume());
          if (rumble) rumble.setSpeed(rumbleSpeed);
        }
      } else {
        fadeOut();
      }
      if (changed) notify();
    },

    setPaused(next: boolean) {
      if (disposed || next === paused) return;
      paused = next;
      if (paused) {
        fadeOut();
        return;
      }
      if (muted || !ctx || !master) return;
      clearSuspendTimer();
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(1, ctx.currentTime, FADE_TIME_CONSTANT);
      resume();
      rumble?.setSpeed(rumbleSpeed);
    },

    isPaused() {
      return paused;
    },

    toggleMuted() {
      engine.setMuted(!muted);
    },

    isMuted() {
      return muted;
    },

    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      clearSuspendTimer();
      doc?.removeEventListener("visibilitychange", onVisibilityChange);
      removeGestureListeners();
      listeners.clear();
      ambient?.stop();
      rumble?.stop();
      ambient = null;
      rumble = null;
      master = null;
      if (ctx && ctx.state !== "closed") ignore(ctx.close());
      ctx = null;
    },
  };

  return engine;
}
