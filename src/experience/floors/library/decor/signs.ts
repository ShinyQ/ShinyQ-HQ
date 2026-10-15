import type { RoomId } from "@/content/schema";
import { signPlate, wrapSign, type SignSpec } from "../../../fx/signLayout";
import { FONTS } from "../../../tower/primitives";
import type { Vec2 } from "../../../types";
import { LIBRARY_ZONES, YEAR_POST, ZONE_TONE, type LibraryLayout, type LibraryStation, type LibraryZone } from "../model";

/** L4 floating signs (spectacle round: no words painted on the floor). Pure: Vitest runs it in node. */

/** One height rule (Round 7 F): every floating plate on the L4 timeline has its bottom here, above the rover and the station icons. */
export const L4_SIGN = { bottom: 5.6 } as const;
/** Zone sign type size. */
export const ZONE_SIGN = { fontSize: 0.8, letterSpacing: 0.12 } as const;
/** Post titles: type size and the wrap width (characters). */
export const TITLE_SIGN = { fontSize: 0.4, wrap: 22 } as const;
export { YEAR_POST };

export type LibrarySignKind = "section" | "title" | "year";

export interface LibrarySignMeta {
  kind: LibrarySignKind;
  zone: LibraryZone;
  room?: RoomId;
}

/** A sign whose plate bottom sits at `bottom`. */
const atBottom = (bottom: number, spec: Omit<SignSpec, "y">): SignSpec => ({ ...spec, y: bottom + signPlate(spec).h / 2 });

/** One floating sign per zone that has a station, where its road starts (pure: the layout test reads it). */
export function zoneSignSpecs(layout: LibraryLayout, zones: Record<LibraryZone, string>): SignSpec[] {
  return LIBRARY_ZONES.filter((z) => layout.stations.some((s) => s.zone === z)).map((zone) => {
    const { at } = layout.signs[zone];
    return atBottom(L4_SIGN.bottom, {
      text: zones[zone].toUpperCase(),
      x: at.x,
      z: at.z,
      color: ZONE_TONE[zone],
      fontSize: ZONE_SIGN.fontSize,
      letterSpacing: ZONE_SIGN.letterSpacing,
      font: FONTS.monoBold,
    });
  });
}

/** Post titles over their stations (shelves keep their zone sign alone), wrapped at `TITLE_SIGN.wrap`. */
export function stationTitleSpecs(stations: readonly LibraryStation[], titles: Map<RoomId, string>): SignSpec[] {
  return stations
    .filter((s) => s.zone === "blog")
    .map((s) =>
      atBottom(L4_SIGN.bottom, {
        text: wrapSign(titles.get(s.room) ?? s.room, TITLE_SIGN.wrap),
        x: s.center.x,
        z: s.center.z,
        color: ZONE_TONE.blog,
        fontSize: TITLE_SIGN.fontSize,
        font: FONTS.monoBold,
      }),
    );
}

/** One small year plate per timeline year mark, on top of its low post. */
export function yearPostSpecs(years: readonly { year: string; at: Vec2 }[]): SignSpec[] {
  return years.map((mark) =>
    atBottom(YEAR_POST.top, { text: mark.year, x: mark.at.x, z: mark.at.z, color: ZONE_TONE.blog, fontSize: YEAR_POST.fontSize, font: FONTS.monoBold }),
  );
}

/** The post under each year plate as a line segment `[x1, y1, z1, x2, y2, z2]`, floor to plate. */
export function yearPostSegments(years: readonly { year: string; at: Vec2 }[]): [number, number, number, number, number, number][] {
  return years.map(({ at }) => [at.x, 0, at.z, at.x, YEAR_POST.top, at.z]);
}

/** Every L4 sign in one list (sections, years, titles) with what each one is, for the screen placement rule. */
export function librarySigns(input: {
  layout: LibraryLayout;
  zones: Record<LibraryZone, string>;
  titles: Map<RoomId, string>;
  titled: readonly LibraryStation[];
}): { signs: SignSpec[]; meta: LibrarySignMeta[] } {
  const sections = zoneSignSpecs(input.layout, input.zones);
  const present = LIBRARY_ZONES.filter((z) => input.layout.stations.some((s) => s.zone === z));
  const years = yearPostSpecs(input.layout.extras.years ?? []);
  const blog = input.titled.filter((s) => s.zone === "blog");
  const titles = stationTitleSpecs(blog, input.titles);
  return {
    signs: [...sections, ...years, ...titles],
    meta: [
      ...present.map((zone): LibrarySignMeta => ({ kind: "section", zone })),
      ...years.map((): LibrarySignMeta => ({ kind: "year", zone: "blog" })),
      ...blog.map((s): LibrarySignMeta => ({ kind: "title", zone: "blog", room: s.room })),
    ],
  };
}
