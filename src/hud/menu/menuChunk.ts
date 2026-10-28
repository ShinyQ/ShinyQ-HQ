import type * as Sheet from "./MenuSheet";

/** The menu sheet chunk (`./MenuSheet.tsx`): the profile, the actions and the settings host of the Corners menu. */
export type MenuModule = typeof Sheet;

let pending: Promise<MenuModule | null> | null = null;

/**
 * Loads the menu sheet chunk once per page (one shared promise), on the first press of the menu button or its key, so
 * it stays off the first-frame 3D path and out of the session totals (owner decision 2026-10-28). Resolves to null when
 * the import fails, and forgets the failure so the next open tries again. This import() is the only reference to the
 * chunk entry.
 */
export function loadMenu(): Promise<MenuModule | null> {
  pending ??= import("./MenuSheet").then(
    (mod) => mod,
    () => {
      pending = null;
      return null;
    },
  );
  return pending;
}
