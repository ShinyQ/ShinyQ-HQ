import type { RoomId } from "@/content/schema";
import { signPlate, wrapSign, type SignSpec } from "../../../fx/signLayout";
import { FONTS } from "../../../tower/primitives";
import type { Vec2 } from "../../../types";
import { baySlots, type ShelfSlot } from "../slots";
import { LIBRARY_ZONES, roomOfPost, ZONE_TONE, type LibraryLayout, type LibraryStation, type LibrarySection } from "../model";

/** L4 floating signs (spectacle round: no words painted on the floor). Pure: Vitest runs it in node. */

/**
 * One height rule (Round 7 F): section and track signs have their plate bottom here, above the rover and the station icons.
 * A track name on a portrait phone sits `phoneLift` higher: at the phone size it would otherwise end a few pixels above
 * its bay's live spine title at the bay's stop and lose the place to it (nightly sweep, 2026-10-29).
 */
export const L4_SIGN = { bottom: 5.6, phoneLift: 0.4 } as const;
/** Zone and track sign type size; a track name on a portrait phone (camera class `mobile`): `phone` size, wrapped at `phoneWrap` characters. */
export const ZONE_SIGN = { fontSize: 0.6, letterSpacing: 0.12, phone: 0.7, phoneWrap: 14 } as const;
/** Post titles: type size and the wrap width (characters); on a portrait phone `phone` and `phoneWrap` (the phone reading rule). */
export const TITLE_SIGN = { fontSize: 0.4, wrap: 22, phone: 0.76, phoneWrap: 16 } as const;
/** Lead titles hang this far under `L4_SIGN.bottom` (just over the lead cover); a spine title floats `lift` over its spine. */
export const SHELF_SIGN = { leadDrop: 1.6, lift: 0.9 } as const;

/** `track`: a reader track's name over its bay; `lead`: the lead post's title over its cover; `spine`: a post title over its spine. */
export type LibrarySignKind = "section" | "track" | "lead" | "spine";

export interface LibrarySignMeta {
  kind: LibrarySignKind;
  /** The bay room (`L4:track:<slug>`) of a track sign, the post room (`L4:<slug>`) of a lead or spine sign. */
  room?: RoomId;
}

/** A sign whose plate bottom sits at `bottom`. */
const atBottom = (bottom: number, spec: Omit<SignSpec, "y">): SignSpec => ({ ...spec, y: bottom + signPlate(spec).h / 2 });

/**
 * Back-edge anchor of a station or bay: the middle of the edge farthest from the road (`facing`, axis-aligned, points
 * from the pad into it).
 */
export function stationBackEdge({ rect: r, center: c, facing: f }: Pick<LibraryStation, "rect" | "center" | "facing">): Vec2 {
  return { x: c.x + (f.x * (r.maxX - r.minX)) / 2, z: c.z + (f.z * (r.maxZ - r.minZ)) / 2 };
}

/** A section or track name: upper case, the zone sign type, plate bottom on `L4_SIGN.bottom` (`phone`: a track name on a portrait phone, `phoneLift` higher). */
const nameSign = (text: string, at: Vec2, color: string, phone = false): SignSpec =>
  atBottom(L4_SIGN.bottom + (phone ? L4_SIGN.phoneLift : 0), {
    text: phone ? wrapSign(text.toUpperCase(), ZONE_SIGN.phoneWrap) : text.toUpperCase(),
    x: at.x,
    z: at.z,
    color,
    fontSize: phone ? ZONE_SIGN.phone : ZONE_SIGN.fontSize,
    letterSpacing: ZONE_SIGN.letterSpacing,
    font: FONTS.monoBold,
  });

/** A post title wrapped at `TITLE_SIGN.wrap` (on a portrait phone `phoneWrap`, at the `phone` size), plate bottom at `bottom`. */
const titleSign = (text: string, at: Vec2, bottom: number, phone = false): SignSpec =>
  atBottom(bottom, { text: wrapSign(text, phone ? TITLE_SIGN.phoneWrap : TITLE_SIGN.wrap), x: at.x, z: at.z, color: ZONE_TONE.track, fontSize: phone ? TITLE_SIGN.phone : TITLE_SIGN.fontSize, font: FONTS.monoBold });

/**
 * One floating sign per zone that has a station, hung over the back edge of the zone's first station (a
 * storefront sign over the first desk; for the posts that is the featured stage). Off the road, so it is
 * never the plate between the follow camera and the rover. Pure: the layout test reads it.
 */
export function zoneSignSpecs(layout: LibraryLayout, zones: Record<LibrarySection, string>): SignSpec[] {
  return LIBRARY_ZONES.flatMap((zone) => {
    const first = layout.stations.find((s) => s.zone === zone);
    return first ? [nameSign(zones[zone], stationBackEdge(first), ZONE_TONE[zone])] : [];
  });
}

/**
 * Every L4 timeline sign in one list with what each one is, for the screen placement rule: the sections, each bay's track
 * name over its back edge (like a section sign), each bay's lead title just over the lead cover, then one title per spine
 * (every slot but the lead) just over its spine; only the live or picked spine title shows. `phone` (camera class
 * `mobile`): the track names and titles take their portrait phone sizes (the phone reading rule).
 */
export function librarySigns({ layout, zones, titles, tracks, phone = false }: {
  layout: LibraryLayout;
  zones: Record<LibrarySection, string>;
  /** Post titles by post slug (`postTitles`). */
  titles: Map<string, string>;
  /** Track names by track slug. */
  tracks: Map<string, string>;
  phone?: boolean;
}): { signs: SignSpec[]; meta: LibrarySignMeta[] } {
  const signs = zoneSignSpecs(layout, zones);
  const meta = signs.map((): LibrarySignMeta => ({ kind: "section" }));
  const slots = layout.bays.map(baySlots);
  const add = (kind: LibrarySignKind, room: RoomId, spec: SignSpec) => (signs.push(spec), meta.push({ kind, room }));
  const title = (kind: LibrarySignKind, s: ShelfSlot, bottom: number) => add(kind, roomOfPost(s.slug), titleSign(titles.get(s.slug) ?? s.slug, s.at, bottom, phone));
  layout.bays.forEach((bay) => add("track", bay.room, nameSign(tracks.get(bay.track) ?? bay.track, stationBackEdge(bay), ZONE_TONE.track, phone)));
  slots.forEach(([lead]) => title("lead", lead, L4_SIGN.bottom - SHELF_SIGN.leadDrop));
  slots.forEach(([, ...spines]) => spines.forEach((s) => title("spine", s, s.y + s.h + SHELF_SIGN.lift)));
  return { signs, meta };
}
