import { signPlate, type SignSpec } from "../../../fx/signLayout";
import { FONTS } from "../../../tower/primitives";
import type { Vec2 } from "../../../types";
import { LIBRARY_ZONES, ZONE_TONE, type LibraryLayout, type LibraryZone } from "../model";

/** L4 floating signs (spectacle round: no words painted on the floor). Pure: Vitest runs it in node. */

/** Floating zone signs: bottom height and type size (they used to be painted on the road). */
export const ZONE_SIGN = { bottom: 3.4, fontSize: 0.8, letterSpacing: 0.12 } as const;

/** One floating sign per zone that has a station, where its road starts (pure: the layout test reads it). */
export function zoneSignSpecs(layout: LibraryLayout, zones: Record<LibraryZone, string>): SignSpec[] {
  return LIBRARY_ZONES.filter((z) => layout.stations.some((s) => s.zone === z)).map((zone) => {
    const { at } = layout.signs[zone];
    const text = zones[zone].toUpperCase();
    const { h } = signPlate({ text, fontSize: ZONE_SIGN.fontSize, letterSpacing: ZONE_SIGN.letterSpacing });
    return { text, x: at.x, y: ZONE_SIGN.bottom + h / 2, z: at.z, color: ZONE_TONE[zone], fontSize: ZONE_SIGN.fontSize, letterSpacing: ZONE_SIGN.letterSpacing, font: FONTS.monoBold };
  });
}

/** Timeline year marks float over the lane (they used to be painted on it): bottom height and type size. */
export const YEAR_MARK = { bottom: 3, fontSize: 1.2 } as const;

/** One floating year per timeline year mark, in the posts tone. */
export function yearMarkSigns(years: readonly { year: string; at: Vec2 }[]): SignSpec[] {
  return years.map((mark) => {
    const { h } = signPlate({ text: mark.year, fontSize: YEAR_MARK.fontSize });
    return { text: mark.year, x: mark.at.x, y: YEAR_MARK.bottom + h / 2, z: mark.at.z, color: ZONE_TONE.blog, fontSize: YEAR_MARK.fontSize, font: FONTS.monoBold };
  });
}
