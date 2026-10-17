/**
 * Replay bridge between the always-mounted MissionHud (the settings panel, Cmd-K) and the 3D HUD's
 * OnboardingLayer, which registers itself while the tower is open. Same pattern as
 * `register3DHost` and `registerRunner` in experience/missions/bridge.ts.
 */
let host: (() => void) | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

export function registerTutorial(run: () => void): () => void {
  host = run;
  notify();
  return () => {
    if (host !== run) return;
    host = null;
    notify();
  };
}

export function tutorialAvailable(): boolean {
  return host !== null;
}

/** Starts the full tour again; false when the 3D HUD is not open. */
export function replayTutorial(): boolean {
  if (!host) return false;
  host();
  return true;
}

export function subscribeTutorial(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
