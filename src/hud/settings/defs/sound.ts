import { audio } from "@/lib/audio";
import { defineSetting } from "../registry";

/** Master switch (key M): on means not muted. Effects and music stay visible while it is off. */
export const soundSetting = defineSetting({
  id: "sound",
  group: "sound",
  order: 10,
  labelKey: "sound.label",
  hintKey: "sound.hint",
  control: { kind: "toggle", get: () => !audio.isMuted(), set: (on) => audio.setMuted(!on) },
  subscribe: (listener) => audio.subscribe(listener),
});

export const effectsSetting = defineSetting({
  id: "effects",
  group: "sound",
  order: 20,
  labelKey: "effects.label",
  control: { kind: "toggle", get: () => audio.getSettings().effects, set: (on) => audio.setEffects(on) },
  subscribe: (listener) => audio.subscribe(listener),
  available: () => true,
});

export const musicSetting = defineSetting({
  id: "music",
  group: "sound",
  order: 30,
  labelKey: "music.label",
  control: { kind: "toggle", get: () => audio.getSettings().music, set: (on) => audio.setMusic(on) },
  subscribe: (listener) => audio.subscribe(listener),
  available: () => true,
});

/** The per-floor background layer; independent of the music toggle, scaled by the music volume. */
export const ambienceSetting = defineSetting({
  id: "ambience",
  group: "sound",
  order: 35,
  labelKey: "ambience.label",
  control: { kind: "toggle", get: () => audio.getSettings().ambience, set: (on) => audio.setAmbience(on) },
  subscribe: (listener) => audio.subscribe(listener),
  available: () => true,
});

/** The slider works in percent (0 to 100); the engine volume is 0 to 1. */
export const musicVolumeSetting = defineSetting({
  id: "music-volume",
  group: "sound",
  order: 40,
  labelKey: "musicVolume.label",
  control: {
    kind: "range",
    min: 0,
    max: 100,
    step: 5,
    get: () => Math.round(audio.getSettings().musicVolume * 100),
    set: (percent) => audio.setMusicVolume(percent / 100),
  },
  subscribe: (listener) => audio.subscribe(listener),
  available: () => true,
});
