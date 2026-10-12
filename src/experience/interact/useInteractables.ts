"use client";

import { useMemo, useSyncExternalStore } from "react";
import type { FloorId } from "@/content/schema";
import type { FloorLayouts } from "../types";
import { baseInteractables, extraInteractables, mergeInteractables, onInteractablesChange, type InteractData, type Interactable } from "./registry";

const NO_EXTRAS: readonly Interactable[] = [];

/** The floor's targets (built-in plus registered extras); re-renders when extras change. Pass a memoized `data`. */
export function useInteractables(floor: FloorId, layouts: FloorLayouts, data: InteractData): Interactable[] {
  const base = useMemo(() => baseInteractables(floor, layouts, data), [floor, layouts, data]);
  const extras = useSyncExternalStore(onInteractablesChange, () => extraInteractables(floor), () => NO_EXTRAS);
  return useMemo(() => mergeInteractables(base, extras), [base, extras]);
}
