import type { AmbienceFloor } from "./ambience";

export type { AmbienceFloor };
export type SoundName = "beep" | "ding" | "whoosh" | "click" | "blip" | "chime";

export interface AudioSettings {
  /** One-shots and the tread rumble. */
  effects: boolean;
  /** Background music ("Deep Space Ambient"). */
  music: boolean;
  /** Music level, 0 to 1 (scales the music bus; the master mute still wins). */
  musicVolume: number;
  /** Per-floor background layer (the ambience), independent of the music toggle. */
  ambience: boolean;
}

export interface AudioEngine {
  /** Plays a one-shot sound. No-op while muted or when Web Audio is unavailable. */
  play(name: SoundName): void;
  /** Rover speed in units per second. At or below 1 the rumble is silent; values clamp at 12. */
  setRumble(speed: number): void;
  /** Persists the setting ("on" / "off"). The first unmute lazily creates the AudioContext and starts the background music. */
  setMuted(muted: boolean): void;
  /** Silences everything while the 3D view is closed (Page View) without changing the stored setting. */
  setPaused(paused: boolean): void;
  isPaused(): boolean;
  toggleMuted(): void;
  isMuted(): boolean;
  /** Effects, music and music volume. The same object is returned until a setting changes. */
  getSettings(): AudioSettings;
  /** Persists `hq:sfx`. Off silences one-shots and the rumble; the master mute still wins. */
  setEffects(on: boolean): void;
  /** Persists `hq:music`. Off stops the music; on starts it again when the engine is audible. */
  setMusic(on: boolean): void;
  /** Persists `hq:music-volume` (clamped 0 to 1) and glides the music bus to it. */
  setMusicVolume(volume: number): void;
  /** Persists `hq:ambience`. Off fades the floor ambience out and stops it; on starts it again when audible and a floor is set. */
  setAmbience(on: boolean): void;
  /** The floor the ambience follows (`null` fades it out). Crossfades while sounding; remembered while silent. */
  setFloor(floor: AmbienceFloor | null): void;
  /** The remembered floor (a probe for tests). */
  ambienceFloor(): AmbienceFloor | null;
  /** Notified whenever the muted state or a setting changes. Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void;
  /** Removes document listeners and closes the AudioContext. */
  dispose(): void;
}

export interface AudioEngineDeps {
  createContext: () => AudioContext;
  storage: Pick<Storage, "getItem" | "setItem"> | null;
  doc: Pick<Document, "visibilityState" | "addEventListener" | "removeEventListener"> | null;
  /** Milliseconds, used for the key click rate limit. */
  now: () => number;
  /** Start state of the Page View pause; true unless a test drives the 3D state directly. `Experience` unpauses on mount. */
  paused: boolean;
  /** Loads the ambience module on demand (a separate chunk). Tests inject a fake. */
  loadAmbience: () => Promise<Pick<typeof import("./ambience"), "createAmbience">>;
}
