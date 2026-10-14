import type { RoomId } from "@/content/schema";
import { currentRoom } from "@/content/workshop";
import { OLD_VISITS_ROOM, VISITS_ROOM } from "../floors/lobby/visitsRoom";

/**
 * Room ids that moved, mapped to their current id, so old links keep working: history entries, drawer
 * links in a cached room data file, recent rooms and mission steps. Light imports only (the store loads it).
 */
const ALIASES: Readonly<Record<string, RoomId>> = {
  // The Visitor Observatory moved from the roof to the Lobby (owner decision 2026-10-14).
  [OLD_VISITS_ROOM]: VISITS_ROOM,
};

export function canonicalRoom(id: RoomId): RoomId;
export function canonicalRoom(id: RoomId | null): RoomId | null;
export function canonicalRoom(id: RoomId | null): RoomId | null {
  // Retired L2 side project benches resolve to their L3 pods (content/workshop.ts, RETIRED_SIDE_ROOMS).
  return id === null ? null : (ALIASES[id] ?? currentRoom(id));
}
