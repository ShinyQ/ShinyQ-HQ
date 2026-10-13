import { useCallback, useSyncExternalStore } from "react";
import { isStatsOptedOut as optedOutIn, STATS_OPTOUT_EVENT, STATS_OPTOUT_KEY, STATS_OPTOUT_VALUE } from "@/lib/stats/optout";

export { STATS_OPTOUT_EVENT, STATS_OPTOUT_KEY };

/**
 * "Don't count my visits": the toggle side of S1's opt-out (`@/lib/stats/optout`). Checked writes
 * `localStorage["hq:stats-optout"] = "1"`, unchecked removes the key, and every change fires the window
 * event `hq:stats-optout` (the visit beacon cancels its pending point; the key also stops the RUM beacon
 * and the Cloudflare beacon). Only the visitor's own choice is stored.
 */
export function isStatsOptedOut(): boolean {
  try {
    return optedOutIn(window.localStorage);
  } catch {
    return false;
  }
}

export function setStatsOptOut(on: boolean): void {
  try {
    if (on) window.localStorage.setItem(STATS_OPTOUT_KEY, STATS_OPTOUT_VALUE);
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
