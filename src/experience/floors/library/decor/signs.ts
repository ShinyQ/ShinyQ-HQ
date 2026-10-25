import type { RoomId } from "@/content/schema";
import { signPlate, wrapSign, type SignSpec } from "../../../fx/signLayout";
import { FONTS } from "../../../tower/primitives";
import type { Vec2 } from "../../../types";
import { LIBRARY_ZONES, roomOfPost, ZONE_TONE, type LibraryLayout, type LibraryStation, type LibraryZone, type LibrarySection } from "../model";

/** L4 floating signs (spectacle round: no words painted on the floor). Pure: Vitest runs it in node. */

/** One height rule (Round 7 F): section and track signs have their plate bottom here, above the rover and the station icons. */
export const L4_SIGN = { bottom: 5.6 } as const;
/** Zone and track sign type size. */
export const ZONE_SIGN = { fontSize: 0.6, letterSpacing: 0.12 } as const;
/** Post titles: type size and the wrap width (characters). */
export const TITLE_SIGN = { fontSize: 0.4, wrap: 22 } as const;
/** Lead titles hang this far under `L4_SIGN.bottom` (just over the lead cover); a spine title floats `lift` over its spine. */
export const SHELF_SIGN = { leadDrop: 1.6, lift: 0.6 } as const;

/** `track`: a reader track's name over its bay; `lead`: the lead post's title over its cover; `spine`: a post title over its spine. */
export type LibrarySignKind = "section" | "track" | "lead" | "spine";

export interface LibrarySignMeta {
  kind: LibrarySignKind;
  zone: LibraryZone;
  /** The bay room (`L4:track:<slug>`) of a track sign, the post room (`L4:<slug>`) of a lead or spine sign. */
  room?: RoomId;
  /** Index of the sign's bay in `layout.bays`. */
  bay?: number;
}

/** A sign whose plate bottom sits at `bottom`. */
const atBottom = (bottom: number, spec: Omit<SignSpec, "y">): SignSpec => ({ ...spec, y: bottom + signPlate(spec).h / 2 });

/**
 * Back-edge anchor of a station or bay: the middle of the edge farthest from the road (`facing` points from the
 * pad into it, `across` is its extent along it).
 */
export function stationBackEdge(s: Pick<LibraryStation, "rect" | "center" | "facing">): Vec2 {
  const across = Math.abs(s.facing.x) * (s.rect.maxX - s.rect.minX) + Math.abs(s.facing.z) * (s.rect.maxZ - s.rect.minZ);
  return { x: s.center.x + (s.facing.x * across) / 2, z: s.center.z + (s.facing.z * across) / 2 };
}

/** A section or track name: upper case, the zone sign type, plate bottom on `L4_SIGN.bottom`. */
const nameSign = (text: string, at: Vec2, color: string): SignSpec =>
  atBottom(L4_SIGN.bottom, { text: text.toUpperCase(), x: at.x, z: at.z, color, fontSize: ZONE_SIGN.fontSize, letterSpacing: ZONE_SIGN.letterSpacing, font: FONTS.monoBold });

/** A post title wrapped at `TITLE_SIGN.wrap`, plate bottom at `bottom`. */
const titleSign = (text: string, at: Vec2, bottom: number): SignSpec =>
  atBottom(bottom, { text: wrapSign(text, TITLE_SIGN.wrap), x: at.x, z: at.z, color: ZONE_TONE.track, fontSize: TITLE_SIGN.fontSize, font: FONTS.monoBold });

/**
 * One floating sign per zone that has a station, hung over the back edge of the zone's first station (a
 * storefront sign over the first desk; for the posts that is the featured stage). Off the road, so it is
 * never the plate between the follow camera and the rover. `layout.signs` (the zone anchors on the road)
 * stays in the layout contract for the tests; no decor reads it. Pure: the layout test reads it.
 */
export function zoneSignSpecs(layout: LibraryLayout, zones: Record<LibrarySection, string>): SignSpec[] {
  return LIBRARY_ZONES.flatMap((zone) => {
    const first = layout.stations.find((s) => s.zone === zone);
    return first ? [nameSign(zones[zone], stationBackEdge(first), ZONE_TONE[zone])] : [];
  });
}

/** Each bay's track name (`labels` by track slug) over the bay's back edge, like a section sign. */
export function trackSignSpecs(layout: LibraryLayout, labels: Map<string, string>): SignSpec[] {
  return layout.bays.map((bay) => nameSign(labels.get(bay.track) ?? bay.track, stationBackEdge(bay), ZONE_TONE.track));
}

/** Each bay's lead title (`titles` by post room) just over the lead cover. */
export function leadSignSpecs(layout: LibraryLayout, titles: Map<RoomId, string>): SignSpec[] {
  return layout.bays.map(({ slots: [lead] }) => titleSign(titles.get(roomOfPost(lead.slug)) ?? lead.slug, lead.at, L4_SIGN.bottom - SHELF_SIGN.leadDrop));
}

/** One title per spine (every slot but the lead), floating just over the spine; only the live or picked one shows. */
export function spineSignSpecs(layout: LibraryLayout, titles: Map<RoomId, string>): SignSpec[] {
  return layout.bays.flatMap((bay) => bay.slots.slice(1).map((s) => titleSign(titles.get(roomOfPost(s.slug)) ?? s.slug, s.at, s.y + s.h + SHELF_SIGN.lift)));
}

/** Every L4 timeline sign in one list (sections, track names, lead titles, spine titles) with what each one is, for the screen placement rule. */
export function librarySigns(input: {
  layout: LibraryLayout;
  zones: Record<LibrarySection, string>;
  /** Post titles by post room (`stationTitles`). */
  titles: Map<RoomId, string>;
  /** Track names by track slug. */
  tracks: Map<string, string>;
}): { signs: SignSpec[]; meta: LibrarySignMeta[] } {
  const { layout, titles } = input;
  const bays = layout.bays;
  const present = LIBRARY_ZONES.filter((z) => layout.stations.some((s) => s.zone === z));
  return {
    signs: [...zoneSignSpecs(layout, input.zones), ...trackSignSpecs(layout, input.tracks), ...leadSignSpecs(layout, titles), ...spineSignSpecs(layout, titles)],
    meta: [
      ...present.map((zone): LibrarySignMeta => ({ kind: "section", zone })),
      ...bays.map((b, bay): LibrarySignMeta => ({ kind: "track", zone: "track", room: b.room, bay })),
      ...bays.map((b, bay): LibrarySignMeta => ({ kind: "lead", zone: "track", room: roomOfPost(b.slots[0].slug), bay })),
      ...bays.flatMap((b, bay) => b.slots.slice(1).map((s): LibrarySignMeta => ({ kind: "spine", zone: "track", room: roomOfPost(s.slug), bay }))),
    ],
  };
}
