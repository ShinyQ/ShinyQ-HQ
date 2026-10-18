import type * as IntroScene from "./scene";

/** The intro chunk (`./scene.ts`): the camera timeline, the floor beacons and the veil. */
export type IntroModule = typeof IntroScene;

let pending: Promise<IntroModule | null> | null = null;
let loaded: IntroModule | null = null;

/**
 * Loads the intro chunk once per page (one shared promise). Resolves to null when the import fails: the caller
 * then skips the intro instead of waiting on it. This import() is the only reference to the chunk entry.
 */
export function loadIntro(): Promise<IntroModule | null> {
  pending ??= import("./scene").then(
    (mod) => (loaded = mod),
    () => null,
  );
  return pending;
}

/** The loaded intro chunk, or null before it loaded (and in a session that never plays the intro). */
export function introModule(): IntroModule | null {
  return loaded;
}
