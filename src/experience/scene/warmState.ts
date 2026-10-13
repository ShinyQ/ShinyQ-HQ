import { useSyncExternalStore } from "react";
import type { FloorId } from "@/content/schema";

const warm = new Set<FloorId>();

/** True once every program of the floor's main content was compiled and pinned this session. */
export function isFloorWarm(id: FloorId): boolean {
  return warm.has(id);
}

export function markWarm(id: FloorId): void {
  warm.add(id);
}

export function resetWarm(): void {
  warm.clear();
}

export function listWarm(): FloorId[] {
  return [...warm];
}

/** Boot warm-up order: the most visited floors first (Work, Journey, About, Writing). */
const WARM_ORDER: readonly FloorId[] = ["L3", "L2", "RF", "L4", "L1"];

export function warmQueue(current: FloorId): FloorId[] {
  return WARM_ORDER.filter((id) => id !== current && !warm.has(id));
}

let warming: FloorId | null = null;
const listeners = new Set<() => void>();

/** The floor mounted hidden right now to warm its programs (boot only). */
export const warmingFloor = {
  get: (): FloorId | null => warming,
  set(id: FloorId | null): void {
    if (id === warming) return;
    warming = id;
    for (const l of listeners) l();
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export function useWarmingFloor(): FloorId | null {
  return useSyncExternalStore(warmingFloor.subscribe, warmingFloor.get, () => null);
}
