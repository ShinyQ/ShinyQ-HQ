import type { FloorId, Locale, RoomId } from "@/content/schema";
import type { RoomView, RoomViews } from "@/content/room-views/types";
import { roomFloor, roomsUrl } from "./data-path";

const pending = new Map<string, Promise<RoomViews>>();
const ready = new Map<string, RoomViews>();
const versions = new Map<Locale, Partial<Record<FloorId, string>>>();

/** Hands over the content hash of each floor file (`ExperienceData.roomData`), used as the files' `?v=`. */
export function setRoomDataVersions(locale: Locale, roomData: Partial<Record<FloorId, string>> | undefined) {
  if (roomData) versions.set(locale, roomData);
}

/** Loads one floor's Glass Drawer content once per locale (static JSON built from site-content.json). B1 is the secret Engine Room file. */
export function loadFloorViews(locale: Locale, floor: FloorId): Promise<RoomViews> {
  const key = `${locale}-${floor}`;
  let load = pending.get(key);
  if (!load) {
    load = fetch(roomsUrl(locale, floor, versions.get(locale)?.[floor])).then(async (res) => {
      if (!res.ok) throw new Error(`Room data ${res.status}`);
      const views = (await res.json()) as RoomViews;
      ready.set(key, views);
      return views;
    });
    load.catch(() => pending.delete(key));
    pending.set(key, load);
  }
  return load;
}

/** One room's view, from its floor's file only. */
export function loadRoomView(locale: Locale, room: RoomId): Promise<RoomView | undefined> {
  return loadFloorViews(locale, roomFloor(room)).then((views) => views[room]);
}

/** A floor's views when already loaded (no render waits a tick for a cached file). */
export function peekFloorViews(locale: Locale, floor: FloorId): RoomViews | undefined {
  return ready.get(`${locale}-${floor}`);
}

/** Test hook: seeds or clears one floor's cache. */
export function primeFloorViews(locale: Locale, floor: FloorId, views: RoomViews | null) {
  const key = `${locale}-${floor}`;
  if (views) {
    pending.set(key, Promise.resolve(views));
    ready.set(key, views);
  } else {
    pending.delete(key);
    ready.delete(key);
  }
}
