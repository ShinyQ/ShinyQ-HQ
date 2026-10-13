import { useCallback, useSyncExternalStore } from "react";

/**
 * "Don't count my visits" (owner decision, agreed with S1): `localStorage["hq:stats-optout"] === "1"`
 * means opted out; turning counting back on removes the key. Every change fires the window event
 * `hq:stats-optout`, which S1's visit beacon listens to (opting out after load cancels its pending point).
 * Only the visitor's own choice is stored.
 */
export const STATS_OPTOUT_KEY = "hq:stats-optout";
export const STATS_OPTOUT_EVENT = "hq:stats-optout";

export function isStatsOptedOut(): boolean {
  try {
    return window.localStorage.getItem(STATS_OPTOUT_KEY) === "1";
  } catch {
    return false;
  }
}

export function setStatsOptOut(on: boolean): void {
  try {
    if (on) window.localStorage.setItem(STATS_OPTOUT_KEY, "1");
    else window.localStorage.removeItem(STATS_OPTOUT_KEY);
  } catch {
    // Storage blocked: nothing to remember; the beacon then honours DNT and GPC only.
  }
  window.dispatchEvent(new Event(STATS_OPTOUT_EVENT));
}

function subscribe(listener: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === STATS_OPTOUT_KEY) listener();
  };
  window.addEventListener(STATS_OPTOUT_EVENT, listener);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(STATS_OPTOUT_EVENT, listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** The opt-out choice and its setter; every toggle on the page (footer, drawer) stays in sync. */
export function useStatsOptOut(): [boolean, (on: boolean) => void] {
  const value = useSyncExternalStore(subscribe, isStatsOptedOut, () => false);
  return [value, useCallback((on: boolean) => setStatsOptOut(on), [])];
}
