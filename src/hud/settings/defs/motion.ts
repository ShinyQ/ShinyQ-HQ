import { MOTION_PREFS, type MotionPref } from "@/lib/motion";
import { getHQStore } from "@/store/useHQStore";
import { defineSetting } from "../registry";

export const motionSetting = defineSetting({
  id: "motion",
  group: "display",
  order: 10,
  labelKey: "motion.label",
  hintKey: "motion.hint",
  control: {
    kind: "choice",
    options: MOTION_PREFS.map((value) => ({ value, labelKey: `motion.${value}` })),
    get: () => getHQStore().getState().motion,
    set: (value) => getHQStore().getState().setMotion(value as MotionPref),
  },
  subscribe: (listener) => getHQStore().subscribe(() => listener()),
});
