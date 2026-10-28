import { signPlate, type SignSpec } from "../../fx/signLayout";
import { headingTo, type Readable } from "../../readable";
import type { Vec2 } from "../../types";
import { librarySigns } from "./decor/signs";
import type { LibraryLayout, LibrarySection } from "./model";

/**
 * The headline wall's texts (`NewsroomDecor`): the featured title (left aligned from `inset`, top at `top`) and the
 * scrolling ticker (middle at `y`), each standing `out` in front of the wall.
 */
export const WALL_TEXT = {
  title: { fontSize: 0.95, lineHeight: 1.1, inset: 0.6, top: 6.4, out: 0.06 },
  ticker: { fontSize: 0.62, y: 1.7, out: 0.07 },
} as const;

/** What an end plaza sign is (`EndSignMeta.kind` in decor/EndPlaza.tsx). */
type EndKind = "topic" | "count" | "monument" | "guide" | "vault";
type EndSigns = { signs: readonly SignSpec[]; meta: readonly { kind: EndKind }[] };

/** A sign as drawn on desktops (`d`) and on portrait phones (`p`): the phone's position and plate, both sizes. */
function sized(d: SignSpec, p: SignSpec): Pick<Readable, "fontSize" | "phoneFontSize" | "width" | "phoneWidth"> {
  const w = signPlate(d).w;
  const pw = signPlate(p).w;
  return { fontSize: d.fontSize, ...(p.fontSize !== d.fontSize && { phoneFontSize: p.fontSize }), width: w, ...(pw !== (w * p.fontSize) / d.fontSize && { phoneWidth: pw }) };
}

/**
 * Every L4 title and name with the pose a visitor reads it from (the phone reading rule, `src/experience/readable.ts`):
 * the section signs from their first station's door, each bay's track name and post titles from the bay stop, the
 * headline wall's featured title and ticker from the wall's view zone, and the end plaza signs (`endPlazaSigns`,
 * relative to the plaza center): topic labels and the pieces count from the constellation stop, the monument's values
 * from its stop, the vault's spines and title from the vault stop. Fine print (the monument's names and source) is left out.
 */
export function readableLabels({
  layout,
  zones,
  titles,
  tracks,
  end,
}: {
  layout: LibraryLayout;
  /** Section names, post titles by slug and track names by slug (`librarySigns`). */
  zones: Record<LibrarySection, string>;
  titles: Map<string, string>;
  tracks: Map<string, string>;
  /** `endPlazaSigns(...)` with a topic picked so the count sign shows, as drawn on desktops and on portrait phones. */
  end: { desktop: EndSigns; phone: EndSigns };
}): Readable[] {
  const out: Readable[] = [];
  const toward = (from: Vec2, to: Vec2) => ({ at: from, heading: headingTo(from, to) });
  const sections = layout.stations.filter((s, i, all) => all.findIndex((t) => t.zone === s.zone) === i);
  let section = 0;
  const desktop = librarySigns({ layout, zones, titles, tracks });
  const phone = librarySigns({ layout, zones, titles, tracks, phone: true });
  phone.signs.forEach((sign, i) => {
    const { kind, room } = phone.meta[i];
    const bay = layout.bays.find((b) => b.room === room || b.posts.some((slug) => `L4:${slug}` === room));
    const station = kind === "section" ? sections[section++] : null;
    const reading = station ? toward(station.door, station.center) : bay ? toward(bay.stop, bay.center) : null;
    if (!reading) return;
    out.push({ id: `${kind}:${room ?? station?.zone}`, text: sign.text, at: [sign.x, sign.y, sign.z], ...sized(desktop.signs[i], sign), reading });
  });
  const wall = layout.extras.wall;
  if (wall) {
    const stop: Vec2 = { x: (wall.minX + wall.maxX) / 2, z: wall.maxZ + 2.75 };
    const reading = toward(stop, { x: stop.x, z: wall.maxZ });
    const T = WALL_TEXT.title;
    out.push({ id: "wall:featured", text: "featured", at: [wall.minX + T.inset + 2, T.top - T.fontSize / 2, wall.maxZ + T.out], fontSize: T.fontSize, yaw: 0, reading });
    const K = WALL_TEXT.ticker;
    out.push({ id: "wall:ticker", text: "ticker", at: [stop.x, K.y, wall.maxZ + K.out], fontSize: K.fontSize, yaw: 0, reading });
  }
  const e = layout.end;
  if (e) {
    const c = e.center;
    end.phone.signs.forEach((sign, i) => {
      const { kind } = end.phone.meta[i];
      const at: Vec2 | null = kind === "topic" || kind === "count" ? e.ringStop : kind === "monument" ? (e.monument?.stop ?? null) : (e.vault?.stop ?? null);
      // The monument's names and source line are fine print under its values.
      if (!at || (kind === "monument" && sign.fontSize < 0.5)) return;
      // A topic label rides its orb's orbit: it reads as it passes the front of the cloud, nearest the stop.
      const r = Math.hypot(sign.x, sign.z);
      const front = Math.hypot(at.x - c.x, at.z - c.z) || 1;
      const rel = kind === "topic" ? { x: ((at.x - c.x) * r) / front, z: ((at.z - c.z) * r) / front } : { x: sign.x, z: sign.z };
      const toSign = { x: c.x + rel.x, z: c.z + rel.z };
      const target = kind === "topic" || kind === "count" ? c : kind === "monument" ? toSign : (e.vault?.center ?? toSign);
      out.push({ id: `${kind}:${i}`, text: sign.text, at: [toSign.x, sign.y, toSign.z], ...sized(end.desktop.signs[i], sign), reading: toward(at, target) });
    });
  }
  return out;
}
