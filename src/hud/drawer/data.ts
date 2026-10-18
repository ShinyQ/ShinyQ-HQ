import type { Locale } from "@/content/schema";
import type { RoomViews } from "@/content/room-views/types";
import { ENGINE_ROOMS_FILE, ROOMS_FILE } from "./data-path";

const cache = new Map<Locale, Promise<RoomViews>>();
const engineCache = new Map<Locale, Promise<RoomViews>>();

function load(store: Map<Locale, Promise<RoomViews>>, locale: Locale, file: string): Promise<RoomViews> {
  let pending = store.get(locale);
  if (!pending) {
    pending = fetch(`/data/rooms/${file}`).then((res) => {
      if (!res.ok) throw new Error(`Room data ${res.status}`);
      return res.json() as Promise<RoomViews>;
    });
    pending.catch(() => store.delete(locale));
    store.set(locale, pending);
  }
  return pending;
}

/** Loads the Glass Drawer content once per locale (static JSON built from site-content.json). */
export function loadRoomViews(locale: Locale): Promise<RoomViews> {
  return load(cache, locale, ROOMS_FILE(locale));
}

/** The B1 Engine Room drawers (a separate file): fetched only once B1 is unlocked or one of its rooms opens. */
export function loadEngineViews(locale: Locale): Promise<RoomViews> {
  return load(engineCache, locale, ENGINE_ROOMS_FILE(locale));
}

/** Test hook: seeds or clears the cache. */
export function primeRoomViews(locale: Locale, views: RoomViews | null) {
  if (views) cache.set(locale, Promise.resolve(views));
  else cache.delete(locale);
}

/** Test hook: seeds or clears the B1 cache. */
export function primeEngineViews(locale: Locale, views: RoomViews | null) {
  if (views) engineCache.set(locale, Promise.resolve(views));
  else engineCache.delete(locale);
}
