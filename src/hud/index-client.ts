import { useEffect, useSyncExternalStore } from "react";
import type { HudIndex } from "./index-data";
import { HUD_INDEX_PATH } from "./index-path";

/**
 * Client side of the HUD index. The pages no longer inline it (about 9 KB of compressed HTML on
 * every page, on the LCP path): MissionHud fetches the static file once per page load, when the
 * palette or the Rover menu opens, when a mission needs the runner, or when the page is idle after
 * `load` (`requestIdleCallback`, 2 s timeout), whichever comes first.
 */

/** `requestIdleCallback` timeout for the background index load. */
export const HUD_INDEX_IDLE_TIMEOUT_MS = 2000;

let current: HudIndex | null = null;
let pending: Promise<HudIndex | null> | null = null;
let settled = false;
let scheduled = false;
/** The deployed index version, remembered from MissionHud's first call, so a launcher preload can fetch the same URL. */
let knownVersion: string | undefined;
const listeners = new Set<() => void>();

const notify = () => listeners.forEach((listener) => listener());

/** Fetches the index once per page load (`version` busts the 1 h `/data/*` cache after a deploy; defaults to the one MissionHud passed). Resolves null on failure. */
export function loadHudIndex(version: string | undefined = knownVersion): Promise<HudIndex | null> {
  knownVersion ??= version;
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

/** Loads the index once the page is idle after `load` (at most `HUD_INDEX_IDLE_TIMEOUT_MS` after it). */
export function scheduleHudIndex(version?: string) {
  knownVersion ??= version;
  if (scheduled || current || typeof window === "undefined") return;
  scheduled = true;
  const run = () => void loadHudIndex(version);
  const idle = () => {
    if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(run, { timeout: HUD_INDEX_IDLE_TIMEOUT_MS });
    else window.setTimeout(run, 0);
  };
  if (document.readyState === "complete") idle();
  else window.addEventListener("load", idle, { once: true });
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

/** The HUD index: `initial` when given (tests), else loaded at idle after mount (or earlier through `loadHudIndex`). */
export function useHudIndex(version?: string, initial?: HudIndex): HudIndexState {
  const state = useSyncExternalStore(subscribe, read, () => serverSnapshot);
  useEffect(() => {
    if (!initial) scheduleHudIndex(version);
  }, [initial, version]);
  return initial ? { index: initial, settled: true } : state;
}

/** Test hook: seeds or clears the loaded index. */
export function primeHudIndex(index: HudIndex | null) {
  current = index;
  settled = Boolean(index);
  scheduled = false;
  pending = index ? Promise.resolve(index) : null;
  notify();
}
