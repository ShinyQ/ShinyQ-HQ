import { QUALITY_PREFS, qualityPref, type QualityPref } from "@/lib/quality-pref";
import { defineSetting } from "../registry";

export const qualitySetting = defineSetting({
  id: "quality",
  group: "display",
  order: 20,
  labelKey: "quality.label",
  hintKey: "quality.hint",
  control: {
    kind: "choice",
    options: QUALITY_PREFS.map((value) => ({ value, labelKey: `quality.${value}` })),
    get: qualityPref.get,
    set: (value) => qualityPref.set(value as QualityPref),
  },
  subscribe: qualityPref.subscribe,
});
