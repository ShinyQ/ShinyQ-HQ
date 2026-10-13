import type { FloorId, RoomId } from "@/content/schema";

/** The Visitor Observatory room and its Classic anchor (`/{locale}/contact#visits`). Type-only imports: the gate reads it in the main bundle. */
export const VISITS_ROOM: RoomId = "RF:visits";

/** `#visits` on the RF floor route (`/{locale}/contact`) opens the Visitor Observatory; null for anything else. */
export function visitsRoomFromHash(startFloor: FloorId | undefined, hash: string): RoomId | null {
  return startFloor === "RF" && hash.replace(/^#/, "").toLowerCase() === "visits" ? VISITS_ROOM : null;
}
