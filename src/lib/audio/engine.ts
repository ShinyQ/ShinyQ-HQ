import { createSpaceMusic, type MusicVoice } from "./music";
import { ONE_SHOTS, createRumble, type RumbleVoice } from "./synth";
import type { AmbienceVoice } from "./ambience";
import type { AmbienceFloor, AudioEngine, AudioEngineDeps, AudioSettings, SoundName } from "./types";

export const SOUND_STORAGE_KEY = "hq:sound";
export const EFFECTS_STORAGE_KEY = "hq:sfx";
export const MUSIC_STORAGE_KEY = "hq:music";
export const MUSIC_VOLUME_STORAGE_KEY = "hq:music-volume";
export const AMBIENCE_STORAGE_KEY = "hq:ambience";
export const CLICK_RATE_LIMIT = 20;
const CLICK_WINDOW_MS = 1000;
/** Time constant of the master fade when muting or unmuting (seconds). */
const FADE_TIME_CONSTANT = 0.03;
/** Delay before suspending the context after a mute, so the fade can finish (ms). */
const SUSPEND_DELAY_MS = 150;
/** Time constant of the music volume glide (seconds). */
const VOLUME_TIME_CONSTANT = 0.05;
/**
 * The crossfade between floor layers, and between the music and a floor layer (s). Mirrors `AMBIENCE_CROSSFADE`
 * in ambience.ts, a lazy chunk and so not imported here; a unit test keeps them in step.
 */
export const SOUNDTRACK_CROSSFADE = 2;
/** How long a fading voice (an ambience switched off, the music handing over) lives: the crossfade plus a margin. */
const AMBIENCE_RETIRE_MS = SOUNDTRACK_CROSSFADE * 1000 + 100;
const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1);
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
  const loadAmbience = deps.loadAmbience ?? (() => import("./ambience"));

  const listeners = new Set<() => void>();
  let muted = readMuted();
  let settings: AudioSettings = readSettings();
  /** Paused while the 3D view is closed (Page View, static tier): silent without touching the stored preference. */
  let paused = deps.paused ?? true;
  let disposed = false;
  let unavailable = false;
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let musicBus: GainNode | null = null;
  let music: MusicVoice | null = null;
  let rumble: RumbleVoice | null = null;
  let rumbleSpeed = 0;
  let floor: AmbienceFloor | null = null;
  let ambience: AmbienceVoice | null = null;
  /** Set when the ambience chunk failed to load, so the music plays instead (cleared by the next good load). */
  let ambienceFailed = false;
  /**
   * Voices fading out (an ambience switched off, or the music handing over to a floor layer): stopped by their
   * timer, or earlier by a mute, pause or dispose.
   */
  const retiring = new Map<{ stop(): void }, ReturnType<typeof setTimeout>>();
  let ambienceModule: ReturnType<AudioEngineDeps["loadAmbience"]> | null = null;
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

  function readSettings(): AudioSettings {
    const get = (key: string) => {
      try {
        return storage?.getItem(key) ?? null;
      } catch {
        return null;
      }
    };
    const volume = get(MUSIC_VOLUME_STORAGE_KEY);
    return {
      effects: get(EFFECTS_STORAGE_KEY) !== "off",
      music: get(MUSIC_STORAGE_KEY) !== "off",
      musicVolume: volume === null ? 1 : clamp01(Number(volume)),
      ambience: get(AMBIENCE_STORAGE_KEY) !== "off",
    };
  }

  function write(key: string, value: string): void {
    try {
      storage?.setItem(key, value);
    } catch {
      // The in-memory setting still applies.
    }
  }

  /** Replaces the settings object only when a value changes, so subscribers see a stable snapshot. */
  function update(patch: Partial<AudioSettings>): boolean {
    const next = { ...settings, ...patch };
    if (
      next.effects === settings.effects &&
      next.music === settings.music &&
      next.musicVolume === settings.musicVolume &&
      next.ambience === settings.ambience
    ) {
      return false;
    }
    settings = next;
    notify();
    return true;
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

  /** Fades a voice out over the ambience crossfade, then stops it. */
  function retire(voice: { stop(): void }): void {
    retiring.set(
      voice,
      setTimeout(() => {
        retiring.delete(voice);
        voice.stop();
      }, AMBIENCE_RETIRE_MS),
    );
  }

  /**
   * One soundtrack at a time: while the floor ambience is on and a floor is set, the floor layer replaces the
   * background music (the two never play on top of each other). True also while the ambience chunk is loading,
   * so the music does not start only to fade out again.
   */
  function ambienceOwnsSoundtrack(): boolean {
    return settings.ambience && floor !== null && !ambienceFailed;
  }

  /** Starts the background music on the music bus if it is not playing and no floor layer replaces it. */
  function startMusic(): void {
    if (!music && settings.music && !ambienceOwnsSoundtrack() && ctx && musicBus && !silent() && ctx.state !== "closed") {
      music = createSpaceMusic(ctx, musicBus);
    }
  }

  /** Crossfades the music out (over `AMBIENCE_CROSSFADE`) while a floor layer fades in, then stops it. */
  function yieldMusic(): void {
    if (!music || !ctx) return;
    const voice = music;
    music = null;
    const gain = voice.output.gain;
    const t = ctx.currentTime;
    const value = gain.value;
    gain.cancelScheduledValues(t);
    gain.setValueAtTime(value, t);
    gain.linearRampToValueAtTime(0, t + SOUNDTRACK_CROSSFADE);
    retire(voice);
  }

  /** Cancels every scheduled note and disconnects the music graph. */
  function stopMusic(): void {
    music?.stop();
    music = null;
  }

  /**
   * Starts the floor ambience on the music bus (so the music volume scales it, the music toggle does not).
   * The module is a separate chunk, loaded once; the conditions are checked again when it arrives.
   */
  function startAmbience(): void {
    if (ambience || !settings.ambience || floor === null || !ctx || !musicBus || silent() || ctx.state === "closed") {
      return;
    }
    ambienceModule ??= loadAmbience();
    ambienceModule
      .then(({ createAmbience }) => {
        if (ambience || !settings.ambience || floor === null || !ctx || !musicBus || silent() || ctx.state === "closed") {
          return;
        }
        ambienceFailed = false;
        ambience = createAmbience(ctx, musicBus);
        ambience.setFloor(floor);
        yieldMusic();
      })
      .catch(() => {
        ambienceModule = null;
        ambienceFailed = true;
        startMusic();
      });
  }

  /** Stops every ambience voice at once, the fading ones (and a music handing over) included. */
  function stopAmbience(): void {
    ambience?.stop();
    ambience = null;
    for (const [voice, timer] of retiring) {
      clearTimeout(timer);
      voice.stop();
    }
    retiring.clear();
  }

  /** Creates the context, master bus and background music on demand. Only called while unmuted. */
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
    musicBus = ctx.createGain();
    musicBus.gain.setValueAtTime(settings.musicVolume, ctx.currentTime);
    musicBus.connect(master);
    startMusic();
    startAmbience();
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
      if (muted || paused) {
        stopMusic();
        stopAmbience();
      }
      ignore(ctx.suspend());
    } else if (!muted && !paused) {
      resume();
    }
  }

  /**
   * Browsers keep a context suspended until a user gesture, so the first click, tap or key press in
   * the HQ starts it (and the background music). Listeners stay until the context really runs.
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
      if ((muted || paused) && !disposed) {
        stopMusic();
        stopAmbience();
        ignore(context.suspend());
      }
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
      if (silent() || !settings.effects) return;
      if ((name === "click" || name === "blip") && !allowClick()) return;
      const context = ensureContext();
      if (!context || !master) return;
      resume();
      ONE_SHOTS[name](context, master, context.currentTime);
    },

    setRumble(speed: number) {
      rumbleSpeed = speed;
      if (silent()) return;
      if (!settings.effects) {
        rumble?.setSpeed(0);
        return;
      }
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
          startMusic();
          startAmbience();
          if (rumble) rumble.setSpeed(settings.effects ? rumbleSpeed : 0);
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
      startMusic();
      startAmbience();
      rumble?.setSpeed(settings.effects ? rumbleSpeed : 0);
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

    getSettings() {
      return settings;
    },

    setEffects(on: boolean) {
      if (!update({ effects: on })) return;
      write(EFFECTS_STORAGE_KEY, on ? "on" : "off");
      if (!on) rumble?.setSpeed(0);
      else if (!silent() && rumble) rumble.setSpeed(rumbleSpeed);
    },

    setMusic(on: boolean) {
      if (!update({ music: on })) return;
      write(MUSIC_STORAGE_KEY, on ? "on" : "off");
      if (on) startMusic();
      else stopMusic();
    },

    setMusicVolume(volume: number) {
      const v = clamp01(volume);
      if (!update({ musicVolume: v })) return;
      write(MUSIC_VOLUME_STORAGE_KEY, String(v));
      if (ctx && musicBus) {
        musicBus.gain.cancelScheduledValues(ctx.currentTime);
        musicBus.gain.setTargetAtTime(v, ctx.currentTime, VOLUME_TIME_CONSTANT);
      }
    },

    setAmbience(on: boolean) {
      if (!update({ ambience: on })) return;
      write(AMBIENCE_STORAGE_KEY, on ? "on" : "off");
      if (on) {
        startAmbience();
        return;
      }
      const voice = ambience;
      ambience = null;
      if (voice) {
        voice.setFloor(null);
        retire(voice);
      }
      startMusic();
    },

    setFloor(next: AmbienceFloor | null) {
      if (next === floor) return;
      floor = next;
      if (ambience) ambience.setFloor(next);
      else startAmbience();
      if (ambience?.floor()) yieldMusic();
      else startMusic();
    },

    ambienceFloor() {
      return floor;
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
      stopMusic();
      stopAmbience();
      rumble?.stop();
      rumble = null;
      master = null;
      musicBus = null;
      if (ctx && ctx.state !== "closed") ignore(ctx.close());
      ctx = null;
    },
  };

  return engine;
}
