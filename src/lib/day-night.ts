/** The visitor's Day and night choice (settings panel). Unset follows the Motion setting. */
export const DAY_NIGHT_KEY = "hq:day-night";
export type DayNightPref = "on" | "off" | null;

/** The stored choice wins; without one the cycle runs unless reduced motion is on. */
export function dayNightOn(pref: DayNightPref, reducedMotion: boolean): boolean {
  return pref === null ? !reducedMotion : pref === "on";
}

const listeners = new Set<() => void>();
// Private mode: the choice lives here for the rest of the page session when storage throws.
let memoryPref: DayNightPref = null;

export function readDayNight(): DayNightPref {
  try {
    const v = localStorage.getItem(DAY_NIGHT_KEY);
    return v === "on" || v === "off" ? v : null;
  } catch {
    return memoryPref;
  }
}

export function setDayNight(on: boolean): void {
  memoryPref = on ? "on" : "off";
  try {
    localStorage.setItem(DAY_NIGHT_KEY, memoryPref);
  } catch {
    // Blocked storage: the in-memory choice above serves reads until reload.
  }
  for (const l of listeners) l();
}

export function subscribeDayNight(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    // A null key means the storage was cleared.
    if (e.key === DAY_NIGHT_KEY || e.key === null) listener();
  };
  if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
  };
}
