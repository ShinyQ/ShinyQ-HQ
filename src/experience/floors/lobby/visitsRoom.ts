import type { FloorId, RoomId } from "@/content/schema";

/**
 * The Visitor Observatory room (owner decision 2026-10-14: moved from the roof to the Lobby's south-west
 * corner) and its Classic anchor (`/{locale}/contact#visits`, unchanged). Type-only imports: the gate
 * reads it in the main bundle.
 */
export const VISITS_ROOM: RoomId = "L1:visits";
/** The room id before the move (PR #90): old history entries, drawer links and recent rooms still name it. */
export const OLD_VISITS_ROOM: RoomId = "RF:visits";
export const VISITS_HASH = "visits";

/**
 * `#visits` on the RF route (`/{locale}/contact#visits`, the deep link from before the move) or on the
 * Lobby route (`/{locale}#visits`) opens the Visitor Observatory on L1; null for anything else.
 */
export function visitsRoomFromHash(startFloor: FloorId | undefined, hash: string): RoomId | null {
  if (startFloor !== undefined && startFloor !== "RF") return null;
  return hash.replace(/^#/, "").toLowerCase() === VISITS_HASH ? VISITS_ROOM : null;
}
