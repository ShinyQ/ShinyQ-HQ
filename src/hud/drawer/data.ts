import type { FloorId, Locale, RoomId } from "@/content/schema";
import type { RoomView, RoomViews } from "@/content/room-views/types";
import { loadJson, peekJson } from "@/lib/json-cache";
import { roomFloor, roomsUrl } from "./data-path";

const versions = new Map<Locale, Partial<Record<FloorId, string>>>();

/** Hands over the content hash of each floor file (`ExperienceData.roomData`), used as the files' `?v=`. */
export function setRoomDataVersions(locale: Locale, roomData: Partial<Record<FloorId, string>> | undefined) {
  if (roomData) versions.set(locale, roomData);
}

/** Loads one floor's Glass Drawer content once per locale (static JSON built from site-content.json). B1 is the secret Engine Room file. */
export const loadFloorViews = (locale: Locale, floor: FloorId): Promise<RoomViews> => loadJson(roomsUrl(locale, floor, versions.get(locale)?.[floor]), `${locale}-${floor}`);

/** One room's view, from its floor's file only. */
export function loadRoomView(locale: Locale, room: RoomId): Promise<RoomView | undefined> {
  return loadFloorViews(locale, roomFloor(room)).then((views) => views[room]);
}

/** A floor's views when already loaded (no render waits a tick for a cached file). */
export const peekFloorViews = (locale: Locale, floor: FloorId) => peekJson<RoomViews>(`${locale}-${floor}`);
