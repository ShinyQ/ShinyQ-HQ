import {
  AMBIENCE_STORAGE_KEY,
  EFFECTS_STORAGE_KEY,
  MUSIC_STORAGE_KEY,
  MUSIC_VOLUME_STORAGE_KEY,
  SOUND_STORAGE_KEY,
  clamp01,
  defaultStorage,
  readMuted,
  readSettings,
  writeSetting,
} from "./settings";
import type { AmbienceFloor, AudioEngine, AudioEngineDeps, AudioSettings, SoundName } from "./types";

type EngineModule = Pick<typeof import("./engine"), "createAudioEngine">;

/**
 * Events that start the engine download while the 3D view is open and the page has no user activation yet.
 * They come first in a tap or a key press, so the engine (and its own gesture listeners) is usually up before
 * the `pointerup`, `touchend` or `click` of the same gesture starts the sound.
 */
const WAKE_EVENTS = ["pointerdown", "touchstart", "keydown"] as const;

export interface AudioFacadeOptions {
  /** Loads the engine module (a separate chunk). Tests inject a fake. */
  load?: () => Promise<EngineModule>;
  /** True once the page has had a user activation (sound can start without a new gesture). */
  hasActivation?: () => boolean;
  /** Passed to `createAudioEngine`; `storage` and `doc` are also what the facade itself reads and listens on. */
  deps?: Partial<AudioEngineDeps>;
}

function defaultHasActivation(): boolean {
  if (typeof navigator === "undefined") return false;
  const activation = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
  return Boolean(activation?.hasBeenActive);
}

/** One-shots requested while the engine loads are played when it arrives (a burst of clicks is capped). */
const MAX_QUEUED = 4;

/**
 * The app-wide `audio`: the `AudioEngine` API, with the engine itself (engine.ts, synth.ts, music.ts) in a
 * lazy chunk that loads on the first call that needs sound. Sound needs the 3D view (the Page View is always
 * paused, so it never loads the engine) and a user activation (browsers keep an AudioContext silent before
 * one): while unpaused, the first pointer, touch or key press loads it, and so does a one-shot or a moving
 * rover once the page already had an activation (a click opened the tower). Until the engine exists the
 * facade answers from storage and keeps what callers set: mute and the settings are persisted at once (the
 * engine reads them when it is created); the pause state, the floor, the rumble speed and the one-shots
 * requested while it loads are handed over when it arrives; every one-shot is counted for `playCounts`.
 */
export function createAudioFacade(options: AudioFacadeOptions = {}): AudioEngine {
  const loadModule = options.load ?? (() => import("./engine"));
  const hasActivation = options.hasActivation ?? defaultHasActivation;
  const deps = options.deps ?? {};
  const storage = () => (deps.storage !== undefined ? deps.storage : defaultStorage());
  const doc = () => (deps.doc !== undefined ? deps.doc : typeof document === "undefined" ? null : document);

  let instance: AudioEngine | null = null;
  let engineModule: EngineModule | null = null;
  let loading: Promise<void> | null = null;
  let wanted = false;
  let waking: Pick<Document, "addEventListener" | "removeEventListener"> | null = null;
  let offEngine: (() => void) | null = null;
  /** One-shots the engine played on the facade's behalf (already in `counts`). */
  let replayed: Partial<Record<SoundName, number>> = {};
  const listeners = new Set<() => void>();
  // Before the engine exists.
  let paused = deps.paused ?? true;
  let floor: AmbienceFloor | null = null;
  let rumble = 0;
  let counts: Partial<Record<SoundName, number>> = {};
  let queued: SoundName[] = [];
  let muted: boolean | null = null;
  let settings: AudioSettings | null = null;

  const notify = () => {
    for (const listener of [...listeners]) listener();
  };
  const storedMuted = () => (muted ??= readMuted(storage()));
  const storedSettings = () => (settings ??= readSettings(storage()));

  function create(): void {
    if (instance || !engineModule || !wanted) return;
    const engine = engineModule.createAudioEngine({ ...deps, paused });
    instance = engine;
    stopWaking();
    // What storage could not keep (private mode) still wins over the engine's defaults.
    if (muted !== null && engine.isMuted() !== muted) engine.setMuted(muted);
    if (settings) {
      const current = engine.getSettings();
      if (current.effects !== settings.effects) engine.setEffects(settings.effects);
      if (current.music !== settings.music) engine.setMusic(settings.music);
      if (current.musicVolume !== settings.musicVolume) engine.setMusicVolume(settings.musicVolume);
      if (current.ambience !== settings.ambience) engine.setAmbience(settings.ambience);
    }
    if (floor !== null) engine.setFloor(floor);
    if (rumble) engine.setRumble(rumble);
    offEngine = engine.subscribe(notify);
    const replay = queued;
    queued = [];
    for (const name of replay) {
      replayed[name] = (replayed[name] ?? 0) + 1;
      engine.play(name);
    }
    notify();
  }

  /** A sound could be heard now: the 3D view is open and the page had a user activation. */
  const audible = () => !paused && hasActivation();

  function download(): Promise<void> {
    loading ??= loadModule().then(
      (module) => {
        engineModule = module;
        create();
      },
      () => {
        // Offline or a replaced deploy: the next wake retries.
        loading = null;
        if (wanted && !instance && !paused) startWaking();
      },
    );
    return loading;
  }

  function load(): void {
    wanted = true;
    if (instance) return;
    if (engineModule) create();
    else void download();
  }

  function wake(): void {
    load();
  }

  function startWaking(): void {
    const target = doc();
    if (waking || !target) return;
    waking = target;
    for (const type of WAKE_EVENTS) target.addEventListener(type, wake, { capture: true, passive: true });
  }

  function stopWaking(): void {
    if (!waking) return;
    for (const type of WAKE_EVENTS) waking.removeEventListener(type, wake, { capture: true });
    waking = null;
  }

  /** Replaces the remembered settings only when a value changes (a stable snapshot), persists it and notifies. */
  function updateSetting<K extends keyof AudioSettings>(key: K, value: AudioSettings[K], storageKey: string, stored: string): void {
    const current = storedSettings();
    if (current[key] === value) return;
    settings = { ...current, [key]: value };
    writeSetting(storage(), storageKey, stored);
    notify();
  }

  const facade: AudioEngine = {
    play(name) {
      if (instance) return instance.play(name);
      counts = { ...counts, [name]: (counts[name] ?? 0) + 1 };
      if (!audible()) return;
      if (queued.length < MAX_QUEUED) queued.push(name);
      load();
    },
    setRumble(speed) {
      if (instance) return instance.setRumble(speed);
      rumble = speed;
      if (speed > 1 && audible()) load();
    },
    setMuted(next) {
      if (instance) return instance.setMuted(next);
      const changed = next !== storedMuted();
      muted = next;
      writeSetting(storage(), SOUND_STORAGE_KEY, next ? "off" : "on");
      if (changed) notify();
    },
    setPaused(next) {
      if (instance) return instance.setPaused(next);
      paused = next;
      if (next) {
        queued = [];
        stopWaking();
      } else startWaking();
    },
    isPaused: () => (instance ? instance.isPaused() : paused),
    toggleMuted() {
      facade.setMuted(!facade.isMuted());
    },
    isMuted: () => (instance ? instance.isMuted() : storedMuted()),
    getSettings: () => (instance ? instance.getSettings() : storedSettings()),
    setEffects(on) {
      if (instance) return instance.setEffects(on);
      updateSetting("effects", on, EFFECTS_STORAGE_KEY, on ? "on" : "off");
    },
    setMusic(on) {
      if (instance) return instance.setMusic(on);
      updateSetting("music", on, MUSIC_STORAGE_KEY, on ? "on" : "off");
    },
    setMusicVolume(volume) {
      if (instance) return instance.setMusicVolume(volume);
      const v = clamp01(volume);
      updateSetting("musicVolume", v, MUSIC_VOLUME_STORAGE_KEY, String(v));
    },
    setAmbience(on) {
      if (instance) return instance.setAmbience(on);
      updateSetting("ambience", on, AMBIENCE_STORAGE_KEY, on ? "on" : "off");
    },
    setFloor(next) {
      if (instance) return instance.setFloor(next);
      floor = next;
    },
    ambienceFloor: () => (instance ? instance.ambienceFloor() : floor),
    playCounts() {
      if (!instance) return { ...counts };
      const total: Partial<Record<SoundName, number>> = { ...counts };
      // The engine counted the replayed one-shots too; `counts` already holds them.
      for (const [name, n] of Object.entries(instance.playCounts()) as [SoundName, number][]) {
        total[name] = (total[name] ?? 0) + n - (replayed[name] ?? 0);
      }
      return total;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose() {
      offEngine?.();
      offEngine = null;
      instance?.dispose();
      instance = null;
      stopWaking();
      listeners.clear();
      wanted = false;
      paused = deps.paused ?? true;
      floor = null;
      rumble = 0;
      counts = {};
      queued = [];
      replayed = {};
      muted = null;
      settings = null;
    },
  };
  return facade;
}

/**
 * App-wide audio engine. Importing this module is free and SSR safe: the engine chunk loads only when the
 * 3D view needs sound (see `createAudioFacade`), and the AudioContext only on a user gesture after that.
 */
export const audio: AudioEngine = createAudioFacade();
