import { createAudioEngine } from "./engine";
import type { AudioEngine } from "./types";

let instance: AudioEngine | null = null;

function engine(): AudioEngine {
  instance ??= createAudioEngine();
  return instance;
}

/**
 * App-wide audio engine. A thin proxy: the real engine (and later the AudioContext)
 * is only created on the first method call, so importing this module is free and SSR safe.
 */
export const audio: AudioEngine = {
  play: (name) => engine().play(name),
  setRumble: (speed) => engine().setRumble(speed),
  setMuted: (muted) => engine().setMuted(muted),
  setPaused: (paused) => engine().setPaused(paused),
  isPaused: () => engine().isPaused(),
  toggleMuted: () => engine().toggleMuted(),
  isMuted: () => engine().isMuted(),
  subscribe: (listener) => engine().subscribe(listener),
  dispose: () => {
    instance?.dispose();
    instance = null;
  },
};
