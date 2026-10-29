import type * as Touch from "./Joystick";

/** The touch controls chunk (`./Joystick.tsx`): the tablet joystick, the phone's floating stick and the Boost button. */
export type TouchModule = typeof Touch;

let pending: Promise<TouchModule | null> | null = null;

/**
 * Loads the touch controls chunk once per page (one shared promise), when the HUD first mounts them on a coarse pointer,
 * so a mouse visitor never loads it and it stays off the first-frame 3D path and out of the session totals (spec
 * 2026-10-29, decision 3.8, the menu and picker precedent). Resolves to null when the import fails, and forgets the
 * failure so the next mount tries again. This import() is the only reference to the chunk entry.
 */
export function loadTouch(): Promise<TouchModule | null> {
  pending ??= import("./Joystick").then(
    (mod) => mod,
    () => {
      pending = null;
      return null;
    },
  );
  return pending;
}
