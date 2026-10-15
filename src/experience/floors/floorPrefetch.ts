import type { FloorId } from "@/content/schema";
import { LAZY_FLOORS, type FloorChunkState } from "./floorChunks";

export interface PrefetchSnapshot {
  ride: { to: FloorId } | null;
  picker: { kind: string } | null;
  hover: { item: { kind: string } } | null;
}

/**
 * Which floor chunks a store state needs now (`need`: the ride target, loaded even with ?prefetch=off)
 * or will likely need soon (`soon`: the floor picker is open or an elevator call pad is targeted).
 */
export function prefetchFor({ ride, picker, hover }: PrefetchSnapshot): { need: FloorId[]; soon: FloorId[] } {
  const soon = picker?.kind === "floor" || hover?.item.kind === "elevator-pad" ? [...LAZY_FLOORS] : [];
  return { need: ride ? [ride.to] : [], soon };
}

/**
 * Once per ride (keyed by `from->to`), a target whose chunk failed earlier is retried, so the car holds
 * for it instead of arriving at a floor that pops in. Everything else keeps the idle-only rule.
 */
export function rideRetry(
  lastKey: string | null,
  ride: { from: FloorId; to: FloorId } | null,
  targetState: FloorChunkState,
): { key: string | null; retry: FloorId | null } {
  if (!ride) return { key: null, retry: null };
  const key = `${ride.from}->${ride.to}`;
  if (key === lastKey) return { key, retry: null };
  return { key, retry: targetState === "failed" ? ride.to : null };
}
