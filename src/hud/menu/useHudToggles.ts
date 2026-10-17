"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { intents } from "@/experience/input/intents";

export type HudToggle = "map" | "settings";

/**
 * Open state of the HUD panels a key toggles, kept outside React: a graphics quality change remounts the
 * whole experience (the gate keys it by `mount:tier`), and the sheet the visitor is using must stay open
 * through that. A remount releases and retains a toggle in the same commit, so the state survives it;
 * once nothing holds a toggle after that commit (Classic site, a reload of the HUD), it closes.
 */
const state: Record<HudToggle, boolean> = { map: false, settings: false };
const holders: Record<HudToggle, number> = { map: 0, settings: 0 };
const stopIntents: Partial<Record<HudToggle, () => void>> = {};
const listeners = new Set<() => void>();

export const hudToggles = {
  get: (what: HudToggle): boolean => state[what],
  set(what: HudToggle, open: boolean): void {
    if (state[what] === open) return;
    state[what] = open;
    listeners.forEach((l) => l());
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

function retain(what: HudToggle): () => void {
  holders[what] += 1;
  if (holders[what] === 1) {
    stopIntents[what] = intents.on((intent) => {
      if (intent.type === "toggle" && intent.what === what) hudToggles.set(what, !state[what]);
    });
  }
  return () => {
    holders[what] -= 1;
    if (holders[what] > 0) return;
    stopIntents[what]?.();
    delete stopIntents[what];
    // A keyed remount retains the toggle again in this same commit, before the microtask runs.
    queueMicrotask(() => {
      if (holders[what] === 0) hudToggles.set(what, false);
    });
  };
}

/**
 * Open state of a HUD panel that a key toggles (`N` the map overview, `,` the settings): each
 * `{ type: "toggle", what }` intent flips it. While an `aria-modal` sheet is open world keys pause,
 * so the key opens the sheet and Esc (or its close button) closes it.
 */
export function useHudToggle(what: HudToggle): [open: boolean, setOpen: (open: boolean) => void] {
  const open = useSyncExternalStore(
    hudToggles.subscribe,
    () => hudToggles.get(what),
    () => false,
  );
  useEffect(() => retain(what), [what]);
  const setOpen = useCallback((next: boolean) => hudToggles.set(what, next), [what]);
  return [open, setOpen];
}
