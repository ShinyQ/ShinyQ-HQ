import type { LibraryData } from "../../types";
import type { LibraryLayout, LibraryStation, LibraryZone } from "./model";

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

/** One placed icon: item key, floor-local center, yaw, size and zone (its tone). */
export type PlacedIcon = [key: string, x: number, y: number, z: number, face: number, size: number, zone: LibraryZone];

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
 * Every item icon on L4: one per docked post station (the featured one excepted) at the zone icon's place, and one
 * per paper, model and talk over its desk (`deskSlots`, in the desk's item order).
 */
export function libraryIcons(layout: LibraryLayout, library: Pick<LibraryData, "research" | "models" | "talks">): PlacedIcon[] {
  const featured = featuredStation(layout);
  return layout.stations
    .filter((s) => s !== featured)
    .flatMap((s): PlacedIcon[] => {
      const face = round(faceRoad(s));
      if (s.zone === "blog") return [[s.room.slice(3), s.center.x, STATION_HEIGHT.blog + ZONE_ICON.lift, s.center.z, face, ZONE_ICON.size, "blog"]];
      const items = library[s.zone];
      return deskSlots(s, items.length).map((p, i) => [items[i].id, round(p.x), round(p.y), round(p.z), face, DESK.size, s.zone]);
    });
}
