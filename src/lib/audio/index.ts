export type { AmbienceFloor, AudioEngine, AudioEngineDeps, AudioSettings, SoundName } from "./types";
// The engine (createAudioEngine in ./engine) is a lazy chunk: import it from "@/lib/audio/engine" (tests), never from here.
export {
  SOUND_STORAGE_KEY,
  EFFECTS_STORAGE_KEY,
  MUSIC_STORAGE_KEY,
  MUSIC_VOLUME_STORAGE_KEY,
  AMBIENCE_STORAGE_KEY,
  CLICK_RATE_LIMIT,
} from "./settings";
export { audio, createAudioFacade, type AudioFacadeOptions } from "./singleton";
export { useAudio, type UseAudioResult } from "./useAudio";
