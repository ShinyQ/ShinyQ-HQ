import type { SettingDef } from "../registry";
import { dayNightSetting } from "./day-night";
import { languageSetting } from "./language";
import { minimapSetting } from "./minimap";
import { motionSetting } from "./motion";
import { openLinks } from "./open-links";
import { qualitySetting } from "./quality";
import { ambienceSetting, effectsSetting, musicSetting, musicVolumeSetting, soundSetting } from "./sound";
import { hintsSetting, replayTutorialSetting } from "./tutorial";

/** Every setting the panel shows. Sibling features append their definition here (one import, one entry). */
export const SETTINGS: readonly SettingDef[] = [
  languageSetting,
  openLinks,
  replayTutorialSetting,
  hintsSetting,
  motionSetting,
  qualitySetting,
  dayNightSetting,
  minimapSetting,
  soundSetting,
  effectsSetting,
  musicSetting,
  ambienceSetting,
  musicVolumeSetting,
];
