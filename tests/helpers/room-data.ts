import type { RoomViews } from "@/content/room-views/types";
import type { FloorId, Locale } from "@/content/schema";
import { jsonCache } from "@/lib/json-cache";

/** Seeds (or with null clears) one floor's Glass Drawer file in the client JSON cache (`hud/drawer/data.ts` keys). */
export function primeFloorViews(locale: Locale, floor: FloorId, views: RoomViews | null) {
  const key = `${locale}-${floor}`;
  if (views === null) {
    jsonCache.pending.delete(key);
    jsonCache.ready.delete(key);
  } else {
    jsonCache.pending.set(key, Promise.resolve(views));
    jsonCache.ready.set(key, views);
  }
}
