import { useSyncExternalStore } from "react";

/**
 * A Cmd-K action the 3D HUD adds while it applies. The palette lives in the locale layout, whose messages and
 * JS every page ships, so the action brings its resolved label, its search terms and its handler with it.
 */
export interface HudAction {
  id: string;
  label: string;
  keywords: readonly string[];
  run: () => void;
}

const NONE: readonly HudAction[] = [];
let actions: readonly HudAction[] = NONE;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

/** Adds (or replaces) an action in the palette; returns the unregister, which removes only this registration. */
export function registerHudAction(action: HudAction): () => void {
  actions = [...actions.filter((a) => a.id !== action.id), action];
  notify();
  return () => {
    if (!actions.includes(action)) return;
    actions = actions.filter((a) => a !== action);
    notify();
  };
}

export function hudActions(): readonly HudAction[] {
  return actions;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The registered actions (none on the server, on the Classic site, or before the 3D HUD mounts). */
export function useHudActions(): readonly HudAction[] {
  return useSyncExternalStore(subscribe, hudActions, () => NONE);
}
