import type { Locale } from "@/content/schema";
import type { RoomViews } from "@/content/room-views/types";

const cache = new Map<Locale, Promise<RoomViews>>();

/** Loads the Glass Drawer content once per locale (static JSON built from site-content.json). */
export function loadRoomViews(locale: Locale): Promise<RoomViews> {
  let pending = cache.get(locale);
  if (!pending) {
    pending = fetch(`/data/rooms/${locale}.json`).then((res) => {
      if (!res.ok) throw new Error(`Room data ${res.status}`);
      return res.json() as Promise<RoomViews>;
    });
    pending.catch(() => cache.delete(locale));
    cache.set(locale, pending);
  }
  return pending;
}

/** Test hook: seeds or clears the cache. */
export function primeRoomViews(locale: Locale, views: RoomViews | null) {
  if (views) cache.set(locale, Promise.resolve(views));
  else cache.delete(locale);
}
