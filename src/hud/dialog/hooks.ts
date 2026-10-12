"use client";

import { useSyncExternalStore } from "react";
import { hintsOn, onboarded, subscribeFlags } from "./storage";
import { subscribeTutorial, tutorialAvailable } from "./tutorial";

/** The first-session tour is done or skipped (floor lines wait for it). */
export function useOnboardingSettled(): boolean {
  return useSyncExternalStore(subscribeFlags, () => onboarded(), () => false);
}

export function useHintsOn(): boolean {
  return useSyncExternalStore(subscribeFlags, () => hintsOn(), () => false);
}

/** The 3D HUD is open, so "Replay the tutorial" can run. */
export function useTutorialAvailable(): boolean {
  return useSyncExternalStore(subscribeTutorial, tutorialAvailable, () => false);
}
