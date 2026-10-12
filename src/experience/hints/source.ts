import type { FloorId } from "@/content/schema";
import { extraInteractables, type Interactable } from "../interact/registry";
import { interactRuntime } from "../interact/runtime";

export type { Interactable };

/**
 * Point-and-go targets for the dialog and the hint bubbles: the only place this feature reads the
 * interactables registry. The current floor's list (built-in plus extras, labels already in the
 * tower's locale) is the one InteractLayer keeps in `interactRuntime.items`, so a bubble always
 * points at exactly what a click would pick.
 */
export function hintItems(): readonly Interactable[] {
  return interactRuntime.items;
}

/** Targets other features registered on a floor (for example the L1 Highlights Hall), on any floor the rover is on. */
export function extraItems(floor: FloorId): readonly Interactable[] {
  return extraInteractables(floor);
}
