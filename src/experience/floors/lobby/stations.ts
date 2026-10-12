import type { FloorId, RoomId } from "@/content/schema";
import type { CareerData, CareerEntryView } from "../../types";

/**
 * L1 Highlights Hall stations (owner request, October 2026): a short walk-through gallery east of the
 * certification wall that sums up the tower. Ids and small helpers only, with type-only imports: the
 * gate reads the deep-link hash in the main bundle, the layout lives in hallLayout.ts.
 */
export const HIGHLIGHT_STATIONS = ["about", "projects", "experience", "contact"] as const;
export type HighlightStation = (typeof HIGHLIGHT_STATIONS)[number];

/** How many headline stats the About station shows (the first ones in content order). */
export const HIGHLIGHT_STAT_COUNT = 4;

export const highlightRoom = (station: HighlightStation): RoomId => `L1:highlights-${station}`;

export function isHighlightRoom(room: string): boolean {
  return HIGHLIGHT_STATIONS.some((s) => room === highlightRoom(s));
}

/** `#highlights` (the first station) or `#highlights-<station>` on `/{locale}`; null for anything else. */
export function highlightsRoomFromHash(hash: string): RoomId | null {
  const value = hash.replace(/^#/, "").toLowerCase();
  if (value === "highlights") return highlightRoom("about");
  const station = HIGHLIGHT_STATIONS.find((s) => value === `highlights-${s}`);
  return station ? highlightRoom(station) : null;
}

/** Employment ("job") and freelance rooms from the L2 payload, newest first (the Career Road reversed). */
export function experienceRows(career: CareerData): { employment: CareerEntryView[]; freelance: CareerEntryView[] } {
  const newest = career.years.flatMap((y) => y.entries).reverse();
  return { employment: newest.filter((e) => e.type === "job"), freelance: newest.filter((e) => e.type === "freelance") };
}

/** The room a gated page starts on: its own room, else (only on `/{locale}`, which has no start floor) a `#highlights-<station>` hash. */
export function gateStartRoom(startFloor: FloorId | undefined, startRoom: RoomId | undefined, hash: string): RoomId | undefined {
  if (startRoom || startFloor) return startRoom;
  return highlightsRoomFromHash(hash) ?? undefined;
}
