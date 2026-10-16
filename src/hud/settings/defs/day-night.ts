import { dayNightOn, readDayNight, setDayNight, subscribeDayNight } from "@/lib/day-night";
import { getHQStore } from "@/store/useHQStore";
import { defineSetting } from "../registry";

/** Day and night sky cycle (Round 8 K). The stored choice wins; unset, it runs unless reduced motion is on. */
export const dayNightSetting = defineSetting({
  id: "day-night",
  group: "display",
  order: 30,
  labelKey: "dayNight.label",
  hintKey: "dayNight.hint",
  control: {
    kind: "toggle",
    get: () => dayNightOn(readDayNight(), getHQStore().getState().reducedMotion),
    set: setDayNight,
  },
  subscribe: (listener) => {
    const offPref = subscribeDayNight(listener);
    const offStore = getHQStore().subscribe((s, prev) => {
      if (s.reducedMotion !== prev.reducedMotion) listener();
    });
    return () => {
      offPref();
      offStore();
    };
  },
});
