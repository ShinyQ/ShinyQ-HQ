import type { Locale } from "../schema";
import { buildCareerViews } from "./career";
import { buildLabsViews } from "./labs";
import { buildLibraryViews } from "./library";
import { buildLobbyViews } from "./lobby";
import { buildRoofViews } from "./roof";
import type { RoomViews } from "./types";

/** Every room's drawer content for one locale (served as /data/rooms/{locale}.json). */
export function buildRoomViews(locale: Locale): RoomViews {
  const views = [
    ...buildLobbyViews(locale),
    ...buildCareerViews(locale),
    ...buildLabsViews(locale),
    ...buildLibraryViews(locale),
    ...buildRoofViews(locale),
  ];
  return Object.fromEntries(views.map((view) => [view.id, view])) as RoomViews;
}

export function roomViewsPath(locale: Locale): string {
  return `/data/rooms/${locale}.json`;
}
