import { LIBRARY_ICONS, type PlacedIcon, type Stroke } from "../../fx/holoIcons";
import type { LibraryData, Vec2 } from "../../types";
import { SHELF_PLINTH } from "./shelf";
import { ZONE_TONE, type LibraryLayout, type LibrarySection, type LibraryStation } from "./model";

/**
 * Where the L4 floating icons stand (pure; no React). The client draws the zone icons from these heights
 * (`ZoneIcons`), and `src/content/shapes.ts` places every item's own icon at build (`libraryIcons`) from the same
 * layout the floor builds, so the client draws the unique icons straight from the shapes JSON.
 */

/** Station heights (`layout.stations` hold the stage and the desks, never a bay: their `zone` is a section). */
export const STATION_HEIGHT: Record<LibrarySection, number> = { blog: 1.1, research: 3.2, models: 2.6, talks: 2.6 };

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
    return { x: s.center.x - s.facing.z * o + s.facing.x * d, y: STATION_HEIGHT[s.zone as LibrarySection] + DESK.lift, z: s.center.z + s.facing.x * o + s.facing.z * d };
  });
}

/**
 * Paper plates of the Research station: spread along its front, 0.15 u outside the glass (so a click
 * reaches the plate, not the station) and turned toward the road (`yaw` as in `HoloIcon` faces).
 */
export function paperSlots(station: LibraryStation, count: number): (Vec2 & { yaw: number; width: number })[] {
  const along = { x: Math.abs(station.facing.z), z: Math.abs(station.facing.x) };
  const w = station.rect.maxX - station.rect.minX;
  const d = station.rect.maxZ - station.rect.minZ;
  const span = along.x * w + along.z * d;
  const front = Math.abs(station.facing.x) * (w / 2) + Math.abs(station.facing.z) * (d / 2) + 0.15;
  const step = (span - 1) / Math.max(1, count);
  const yaw = Math.atan2(-station.facing.x, -station.facing.z);
  return Array.from({ length: count }, (_, i) => {
    const t = -span / 2 + 0.5 + step * (i + 0.5);
    return { x: station.center.x + along.x * t - station.facing.x * front, z: station.center.z + along.z * t - station.facing.z * front, yaw, width: Math.min(1.8, step - 0.3) };
  });
}

/** The station the newsroom features on its stage (the turning book instead of an icon), if any. */
export const featuredStation = (layout: LibraryLayout) => (layout.stations[0]?.zone === "blog" ? layout.stations[0] : undefined);

const round = (v: number) => Math.round(v * 1000) / 1000 + 0;

/**
 * Every item icon on L4: one per reader track over its bay's lead (the lead post's own icon, in the track tone, keyed by
 * its slug; the other posts on the shelf get none), and one per paper, model and talk over its desk (`deskSlots`, in
 * the desk's item order, its zone tone); an item without an icon in `items` keeps its zone icon.
 */
export function libraryIcons(layout: LibraryLayout, library: Pick<LibraryData, "research" | "models" | "talks">, items: Record<string, Stroke[]>): PlacedIcon[] {
  const place = (key: string, s: Pick<LibraryStation, "facing">, zone: LibrarySection, p: { x: number; y: number; z: number }, size: number, color = ZONE_TONE[zone]): PlacedIcon => ({
    key,
    x: round(p.x),
    y: round(p.y),
    z: round(p.z),
    face: round(faceRoad(s)),
    size,
    color,
    strokes: items[key] ?? LIBRARY_ICONS[zone],
  });
  return [
    ...layout.bays.map(({ slots: [lead], ...bay }) => place(lead.slug, bay, "blog", { x: lead.at.x, y: lead.y + lead.h + SHELF_PLINTH + ZONE_ICON.lift, z: lead.at.z }, ZONE_ICON.size, ZONE_TONE.track)),
    ...layout.stations.flatMap((s) => {
      const zone = s.zone;
      if (zone === "blog" || zone === "track") return [];
      const list = library[zone];
      return deskSlots(s, list.length).map((p, i) => place(list[i].id, s, zone, p, DESK.size));
    }),
  ];
}
