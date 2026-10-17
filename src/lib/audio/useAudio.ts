"use client";

import { useSyncExternalStore } from "react";
import { audio } from "./singleton";
import type { AudioEngine, AudioSettings, SoundName } from "./types";

export interface UseAudioResult {
  muted: boolean;
  setMuted: (muted: boolean) => void;
  toggleMuted: () => void;
  play: (name: SoundName) => void;
  setRumble: (speed: number) => void;
}

const serverSnapshot = () => true;

/** React binding for the audio engine. Server render and hydration always report muted. */
export function useAudio(engine: AudioEngine = audio): UseAudioResult {
  const muted = useSyncExternalStore(engine.subscribe, engine.isMuted, serverSnapshot);
  return {
    muted,
    setMuted: engine.setMuted,
    toggleMuted: engine.toggleMuted,
    play: engine.play,
    setRumble: engine.setRumble,
  };
}

const serverSettings: AudioSettings = { effects: true, music: true, musicVolume: 1, ambience: true };
const serverSettingsSnapshot = () => serverSettings;

/** Effects, music, music volume and ambience (Settings panel). Server render reports the defaults. */
export function useAudioSettings(engine: AudioEngine = audio): AudioSettings {
  return useSyncExternalStore(engine.subscribe, engine.getSettings, serverSettingsSnapshot);
}
