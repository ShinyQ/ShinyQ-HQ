import type { FloorId } from "@/content/schema";
import { LAZY_FLOORS } from "./floorChunks";

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
