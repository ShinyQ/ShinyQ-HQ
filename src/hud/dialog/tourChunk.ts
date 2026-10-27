import type * as Tour from "./onboarding";

/** The first-session tour chunk (`./onboarding.ts`): the script, its copy keys and the try-it helpers. */
export type TourModule = typeof Tour;

let pending: Promise<TourModule | null> | null = null;

/**
 * Loads the tour chunk once per page (one shared promise), only for a session that plays the tour or Replay tutorial.
 * Resolves to null when the import fails, and forgets the failure so the next call (the next Replay) tries again.
 * This import() is the only reference to the chunk entry.
 */
export function loadTour(): Promise<TourModule | null> {
  pending ??= import("./onboarding").then(
    (mod) => mod,
    () => {
      pending = null;
      return null;
    },
  );
  return pending;
}
