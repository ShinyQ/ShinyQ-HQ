import type { AudioEngineDeps, AudioSettings } from "./types";

/**
 * Storage keys and parsing of the audio settings, and the AudioContext factory, shared by the engine and the
 * lazy `audio` facade (which answers and persists the settings, and creates the context inside the first
 * gesture, before the engine chunk has loaded).
 */
export const SOUND_STORAGE_KEY = "hq:sound";
export const EFFECTS_STORAGE_KEY = "hq:sfx";
export const MUSIC_STORAGE_KEY = "hq:music";
export const MUSIC_VOLUME_STORAGE_KEY = "hq:music-volume";
export const AMBIENCE_STORAGE_KEY = "hq:ambience";
/** Key clicks (and dialog blips) allowed per second; extras are dropped. */
export const CLICK_RATE_LIMIT = 20;

type Storage = AudioEngineDeps["storage"];

export const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1);

type AudioContextCtor = new () => AudioContext;

/** The browser's AudioContext (`webkitAudioContext` on older Safari), or null where Web Audio is missing. */
export function defaultCreateContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { AudioContext?: AudioContextCtor; webkitAudioContext?: AudioContextCtor };
  const Ctor = w.AudioContext ?? w.webkitAudioContext;
  return Ctor ? new Ctor() : null;
}

export function defaultStorage(): Storage {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Sound is on by default; only a stored "off" (the visitor muted) keeps it muted. */
export function readMuted(storage: Storage): boolean {
  try {
    return storage?.getItem(SOUND_STORAGE_KEY) === "off";
  } catch {
    return false;
  }
}

export function readSettings(storage: Storage): AudioSettings {
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

export function writeSetting(storage: Storage, key: string, value: string): void {
  try {
    storage?.setItem(key, value);
  } catch {
    // Storage may be full or blocked (private mode); the in-memory setting still applies.
  }
}
