/** The visitor's Day and night choice (settings panel). Unset follows the Motion setting. */
export const DAY_NIGHT_KEY = "hq:day-night";
export type DayNightPref = "on" | "off" | null;

/** The stored choice wins; without one the cycle runs unless reduced motion is on. */
export function dayNightOn(pref: DayNightPref, reducedMotion: boolean): boolean {
  return pref === null ? !reducedMotion : pref === "on";
}

const listeners = new Set<() => void>();

export function readDayNight(): DayNightPref {
  try {
    const v = localStorage.getItem(DAY_NIGHT_KEY);
    return v === "on" || v === "off" ? v : null;
  } catch {
    return null;
  }
}

export function setDayNight(on: boolean): void {
  try {
    localStorage.setItem(DAY_NIGHT_KEY, on ? "on" : "off");
  } catch {
    // Private mode: the choice lasts until reload through the listeners below.
  }
  for (const l of listeners) l();
}

export function subscribeDayNight(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === DAY_NIGHT_KEY) listener();
  };
  if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
  };
}
