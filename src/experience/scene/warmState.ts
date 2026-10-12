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
