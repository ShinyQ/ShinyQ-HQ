import { createHash } from "node:crypto";
import { ROOM_DATA_FLOORS, roomFloor } from "@/hud/drawer/data-path";
import type { FloorId, Locale } from "../schema";
import { buildCareerViews } from "./career";
import { buildEngineViews } from "./engine";
import { buildHighlightsViews } from "./highlights";
import { buildLabsViews } from "./labs";
import { buildLibraryViews } from "./library";
import { buildLobbyViews } from "./lobby";
import { buildRoofViews } from "./roof";
import type { RoomViews } from "./types";

/** Every public room's drawer content for one locale (served split per floor, see `buildFloorRoomViews`). The secret B1 views are not here: see `buildEngineViews` (/data/rooms/b1-{locale}.json). */
export function buildRoomViews(locale: Locale): RoomViews {
  const views = [
    ...buildLobbyViews(locale),
    ...buildHighlightsViews(locale),
    ...buildCareerViews(locale),
    ...buildLabsViews(locale),
    ...buildLibraryViews(locale),
    ...buildRoofViews(locale),
  ];
  return Object.fromEntries(views.map((view) => [view.id, view])) as RoomViews;
}

/** The secret B1 Engine Room drawers for one locale (served as /data/rooms/b1-{locale}.json, fetched only when unlocked). */
export function buildEngineRoomViews(locale: Locale): RoomViews {
  return Object.fromEntries(buildEngineViews(locale).map((view) => [view.id, view])) as RoomViews;
}

/** One floor's drawer content (served as /data/rooms/{locale}-{floor}.json, B1 as b1-{locale}.json): the rooms whose id starts with the floor. */
export function buildFloorRoomViews(locale: Locale, floor: FloorId): RoomViews {
  if (floor === "B1") return buildEngineRoomViews(locale);
  return Object.fromEntries(Object.entries(buildRoomViews(locale)).filter(([id]) => roomFloor(id) === floor)) as RoomViews;
}

const versions = new Map<Locale, Record<FloorId, string>>();

/** Content hash per floor file (first 12 hex chars of the sha256 of its JSON body, like `hudIndexVersion`): the file's `?v=`. */
export function roomDataVersions(locale: Locale): Record<FloorId, string> {
  let found = versions.get(locale);
  if (!found) {
    const hash = (floor: FloorId) => createHash("sha256").update(JSON.stringify(buildFloorRoomViews(locale, floor))).digest("hex").slice(0, 12);
    found = Object.fromEntries(ROOM_DATA_FLOORS.map((floor) => [floor, hash(floor)])) as Record<FloorId, string>;
    versions.set(locale, found);
  }
  return found;
}
