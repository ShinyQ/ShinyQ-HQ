export type SoundName = "beep" | "ding" | "whoosh" | "click";

export interface AudioEngine {
  /** Plays a one-shot sound. No-op while muted or when Web Audio is unavailable. */
  play(name: SoundName): void;
  /** Rover speed in units per second. At or below 1 the rumble is silent; values clamp at 12. */
  setRumble(speed: number): void;
  /** Persists the setting ("on" / "off"). The first unmute lazily creates the AudioContext and starts the ambient hum. */
  setMuted(muted: boolean): void;
  /** Silences everything while the 3D view is closed (Page View) without changing the stored setting. */
  setPaused(paused: boolean): void;
  isPaused(): boolean;
  toggleMuted(): void;
  isMuted(): boolean;
  /** Notified whenever the muted state changes. Returns an unsubscribe function. */
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
}
