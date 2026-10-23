import { LIBRARY_ICONS, type PlacedIcon, type Stroke } from "../../fx/holoIcons";
import type { LibraryData } from "../../types";
import { ZONE_TONE, type LibraryLayout, type LibraryStation, type LibraryZone } from "./model";

/**
 * Where the L4 floating icons stand (pure; no React or three). The client draws the zone icons from these heights
 * (`ZoneIcons`), and `src/content/shapes.ts` places every item's own icon at build (`libraryIcons`) from the same
 * layout the floor builds, so the client draws the unique icons straight from the shapes JSON.
 */

export const STATION_HEIGHT: Record<LibraryZone, number> = { blog: 1.1, research: 3.2, models: 2.6, talks: 2.6 };

/** Zone icons over each station: lift above the station top and size. */
export const ZONE_ICON = { lift: 2.2, size: 2.4 } as const;
/** Desk item icons (`deskSlots`): lift over the desk top, spacing and size. */
export const DESK = { lift: 1.3, gap: 2.4, size: 2 } as const;

/** Yaw (HoloIcon `face`) that turns an icon from its station toward the road. */
export const faceRoad = (s: Pick<LibraryStation, "facing">) => Math.atan2(-s.facing.x, -s.facing.z);

/**
 * Where a desk's item icons float, low over the desk so they stay clear of the zone sign on its back edge: one row
 * of up to 4 across the desk, left to right as seen from the road, `DESK.gap` apart (5 or more items: two rows, the
 * first nearer the road; up to 6 items stay within an 8 u desk).
 */
export function deskSlots(s: LibraryStation, n: number): { x: number; y: number; z: number }[] {
  const cols = n > 4 ? Math.ceil(n / 2) : n;
  return Array.from({ length: n }, (_, i) => {
    // Right as seen from the road, looking along `facing`, is (-facing.z, facing.x); `d` < 0 is toward the road.
    const o = ((i % cols) - (cols - 1) / 2) * DESK.gap;
    const d = n > 4 ? (i < cols ? -1.2 : 1.2) : 0;
    return { x: s.center.x - s.facing.z * o + s.facing.x * d, y: STATION_HEIGHT[s.zone] + DESK.lift, z: s.center.z + s.facing.x * o + s.facing.z * d };
  });
}

/** The station the newsroom features on its stage (the turning book instead of an icon), if any. */
export const featuredStation = (layout: LibraryLayout) => (layout.stations[0]?.zone === "blog" ? layout.stations[0] : undefined);

const round = (v: number) => Math.round(v * 1000) / 1000 + 0;

/**
 * Every item icon on L4, in its zone tone: one per docked post station (the featured one excepted) at the zone icon's
 * place, and one per paper, model and talk over its desk (`deskSlots`, in the desk's item order); an item without an
 * icon in `items` keeps its zone icon.
 */
export function libraryIcons(layout: LibraryLayout, library: Pick<LibraryData, "research" | "models" | "talks">, items: Record<string, Stroke[]>): PlacedIcon[] {
  const featured = featuredStation(layout);
  const place = (key: string, s: LibraryStation, p: { x: number; y: number; z: number }, size: number): PlacedIcon => ({
    key,
    x: round(p.x),
    y: round(p.y),
    z: round(p.z),
    face: round(faceRoad(s)),
    size,
    color: ZONE_TONE[s.zone],
    strokes: items[key] ?? LIBRARY_ICONS[s.zone],
  });
  return layout.stations
    .filter((s) => s !== featured)
    .flatMap((s) => {
      if (s.zone === "blog") return [place(s.room.slice(3), s, { x: s.center.x, y: STATION_HEIGHT.blog + ZONE_ICON.lift, z: s.center.z }, ZONE_ICON.size)];
      const list = library[s.zone];
      return deskSlots(s, list.length).map((p, i) => place(list[i].id, s, p, DESK.size));
    });
}
