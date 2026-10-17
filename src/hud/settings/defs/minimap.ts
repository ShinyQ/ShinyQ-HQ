import { minimapPref } from "@/hud/minimap/pref";
import { defineSetting } from "../registry";

export const minimapSetting = defineSetting({
  id: "minimap",
  group: "display",
  order: 40,
  labelKey: "minimap.label",
  control: {
    kind: "toggle",
    get: () => minimapPref.get() === "on",
    set: (on) => minimapPref.set(on ? "on" : "off"),
  },
  subscribe: minimapPref.subscribe,
});
