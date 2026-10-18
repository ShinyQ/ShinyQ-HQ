import type { FloorId } from "@/content/schema";
import { PUBLIC_LAZY_FLOORS, type FloorChunkState } from "./floorChunks";

export interface PrefetchSnapshot {
  ride: { to: FloorId } | null;
  picker: { kind: string } | null;
  hover: { item: { kind: string } } | null;
  /** B1 is unlocked: its chunk joins the speculative prefetches. */
  b1Unlocked?: boolean;
  /** The first frame is drawn and the page went idle once (FloorChunkPrefetch). */
  idle?: boolean;
}

/**
 * Which floor chunks a store state needs now (`need`: the ride target, loaded even with ?prefetch=off) or will
 * likely need soon (`soon`: the floor picker is open or an elevator call pad is targeted; B1 also on idle once
 * unlocked). B1 never loads for a locked visitor.
 */
export function prefetchFor({ ride, picker, hover, b1Unlocked = false, idle = false }: PrefetchSnapshot): { need: FloorId[]; soon: FloorId[] } {
  const intent = picker?.kind === "floor" || hover?.item.kind === "elevator-pad";
  const lazy: FloorId[] = b1Unlocked ? [...PUBLIC_LAZY_FLOORS, "B1"] : [...PUBLIC_LAZY_FLOORS];
  const soon: FloorId[] = intent ? lazy : b1Unlocked && idle ? ["B1"] : [];
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
