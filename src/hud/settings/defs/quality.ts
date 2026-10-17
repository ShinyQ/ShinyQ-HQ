import { QUALITY_PREFS, qualityPref, type QualityPref } from "@/lib/quality-pref";
import { defineSetting } from "../registry";

/** A quality change remounts the canvas, so the choice applies once the radios rest this long (arrow keys pass Full on the way to Lite). */
export const QUALITY_APPLY_MS = 400;
/** How long after applying a choice the remounted panel may still take focus back to the checked radio. */
const FOCUS_WINDOW_MS = 1500;

let pending: QualityPref | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let focusUntil = 0;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

const get = (): QualityPref => pending ?? qualityPref.get();

function apply(): void {
  timer = null;
  const value = pending;
  pending = null;
  if (value === null) return;
  if (value === qualityPref.get()) {
    notify();
    return;
  }
  // The write changes the gate tier, which remounts the HUD and the open sheet with it.
  focusUntil = Date.now() + FOCUS_WINDOW_MS;
  qualityPref.set(value);
}

/** Takes the focus hand-off once: true when a quality change just remounted the sheet the radios live in. */
function takeFocus(): boolean {
  const take = Date.now() < focusUntil;
  focusUntil = 0;
  return take;
}

export const qualitySetting = defineSetting({
  id: "quality",
  group: "display",
  order: 20,
  labelKey: "quality.label",
  hintKey: "quality.hint",
  control: {
    kind: "choice",
    options: QUALITY_PREFS.map((value) => ({ value, labelKey: `quality.${value}` })),
    get,
    set(value) {
      pending = value as QualityPref;
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(apply, QUALITY_APPLY_MS);
      notify();
    },
  },
  subscribe(listener) {
    listeners.add(listener);
    const stop = qualityPref.subscribe(listener);
    return () => {
      listeners.delete(listener);
      stop();
    };
  },
  takeFocus,
});
