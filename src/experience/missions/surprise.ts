import type { RoomId } from "@/content/schema";
import type { RoomInfo } from "./rooms";

/**
 * Weighted random pick for the `surprise` mission (appendix 02 section 3): unvisited rooms only,
 * weighted toward hero pods by `surpriseWeight`. When every candidate was visited, all are eligible again.
 * `random` returns a number in [0, 1).
 */
export function pickSurprise(rooms: readonly RoomInfo[], visited: readonly RoomId[], random: () => number = Math.random): RoomInfo | undefined {
  const candidates = rooms.filter((room) => room.surpriseWeight > 0);
  const seen = new Set(visited);
  const fresh = candidates.filter((room) => !seen.has(room.id));
  const pool = fresh.length > 0 ? fresh : candidates;
  const total = pool.reduce((sum, room) => sum + room.surpriseWeight, 0);
  if (total <= 0) return undefined;
  let roll = Math.min(Math.max(random(), 0), 0.999999) * total;
  for (const room of pool) {
    roll -= room.surpriseWeight;
    if (roll < 0) return room;
  }
  return pool[pool.length - 1];
}
