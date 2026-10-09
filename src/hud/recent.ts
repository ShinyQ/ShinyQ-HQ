import type { RoomId } from "@/content/schema";

/**
 * Recently opened rooms on the static tier, most recent first. The 3D store keeps its own persisted
 * `visited` list; this key only backs the palette "Recent" group and `surprise` until then.
 */
export const RECENT_KEY = "hq:recent";
const MAX = 12;

export function readRecent(): RoomId[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((v): v is RoomId => typeof v === "string") : [];
  } catch {
    return [];
  }
}

export function pushRecent(room: RoomId): RoomId[] {
  const next = [room, ...readRecent().filter((id) => id !== room)].slice(0, MAX);
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable: recent rooms simply are not remembered.
  }
  return next;
}
