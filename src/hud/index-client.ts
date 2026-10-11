import { useEffect, useSyncExternalStore } from "react";
import type { HudIndex } from "./index-data";
import { HUD_INDEX_PATH } from "./index-path";

/**
 * Client side of the HUD index. The pages no longer inline it (about 9 KB of compressed HTML on
 * every page, on the LCP path): MissionHud fetches the static file once after hydration.
 */

let current: HudIndex | null = null;
let pending: Promise<HudIndex | null> | null = null;
let settled = false;
const listeners = new Set<() => void>();

const notify = () => listeners.forEach((listener) => listener());

/** Fetches the index once per page load (`version` busts the 1 h `/data/*` cache after a deploy). Resolves null on failure. */
export function loadHudIndex(version?: string): Promise<HudIndex | null> {
  if (current) return Promise.resolve(current);
  if (!pending) {
    pending = fetch(version ? `${HUD_INDEX_PATH}?v=${version}` : HUD_INDEX_PATH)
      .then((res) => (res.ok ? (res.json() as Promise<HudIndex>) : null))
      .catch(() => null)
      .then((index) => {
        current = index;
        settled = true;
        // A failed load may be retried by the next caller (for example after the network returns).
        if (!index) pending = null;
        notify();
        return index;
      });
  }
  return pending;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export interface HudIndexState {
  index: HudIndex | null;
  /** True once the first load finished (also when it failed). */
  settled: boolean;
}

let snapshot: HudIndexState = { index: null, settled: false };
const read = (): HudIndexState => {
  if (snapshot.index !== current || snapshot.settled !== settled) snapshot = { index: current, settled };
  return snapshot;
};
const serverSnapshot: HudIndexState = { index: null, settled: false };

/** The HUD index: `initial` when given (tests), else loaded after mount. */
export function useHudIndex(version?: string, initial?: HudIndex): HudIndexState {
  const state = useSyncExternalStore(subscribe, read, () => serverSnapshot);
  useEffect(() => {
    if (!initial) void loadHudIndex(version);
  }, [initial, version]);
  return initial ? { index: initial, settled: true } : state;
}

/** Test hook: seeds or clears the loaded index. */
export function primeHudIndex(index: HudIndex | null) {
  current = index;
  settled = Boolean(index);
  pending = index ? Promise.resolve(index) : null;
  notify();
}
