import type * as Sheet from "./PickerSheet";

/** The pad picker sheet chunk (`./PickerSheet.tsx`): the floor, year and time console lists and their option builders. */
export type PickerModule = typeof Sheet;

let pending: Promise<PickerModule | null> | null = null;

/**
 * Loads the pad picker sheet chunk once per page (one shared promise), when a picker first opens, so it stays off the
 * first-frame 3D path and out of the session totals (owner decision 2026-10-28). Resolves to null when the import fails,
 * and forgets the failure so the next open tries again. This import() is the only reference to the chunk entry.
 */
export function loadPicker(): Promise<PickerModule | null> {
  pending ??= import("./PickerSheet").then(
    (mod) => mod,
    () => {
      pending = null;
      return null;
    },
  );
  return pending;
}
