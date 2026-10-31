import type { CareerEntryView } from "../../types";
import { headingTo, type Readable } from "../../readable";
import { CAREER_ROAD, type CareerRoadLayout } from "./layout";
import { placingSize, roomLabelSet, signpostSet, workshopSigns } from "./labels";

/**
 * Geometry the L2 scene draws inline (main 3D path, so the components keep their literals): the year digits over each
 * arch (`YearGates.tsx`: type size, bottom over the arch beam) and the award placings on an award room's plinth
 * (`CareerRooms.tsx`: height, offset toward the road side, lean back; the type size is `placingSize`).
 */
const YEAR_DIGITS = { fontSize: 2.2, bar: 0.5, lift: 0.3 } as const;
const PLACING = { y: 0.6, ahead: 1.15, tilt: 0.55 } as const;

/** `phoneFontSize` when the portrait size differs. */
const phoneSize = (fontSize: number, phone: number) => (phone !== fontSize ? { phoneFontSize: phone } : {});

/**
 * Every L2 title and name with the pose a visitor reads it from (the phone reading rule, `src/experience/readable.ts`):
 * room names and award placings from the room's door pad, the year digits and signposts from the arch, the Workshop,
 * time console and repo skyline signs from their stops. Positions are as drawn on portrait phones; text is the label's
 * kind (the test reads only the geometry).
 */
export function readableLabels(road: CareerRoadLayout): Readable[] {
  const out: Readable[] = [];
  const entries = new Map(road.rooms.map((r): [string, CareerEntryView] => [r.slug, { slug: r.slug, type: r.type, role: r.slug, org: "", period: "", prologue: false }]));
  const desktop = roomLabelSet(road.rooms, entries).labels;
  const phone = roomLabelSet(road.rooms, entries, true).labels;
  road.rooms.forEach((room, i) => {
    const reading = { at: room.at, heading: headingTo(room.at, room.center) };
    const label = phone[i];
    const tilt = label.tilt ?? 0;
    // The role is the first line of a bottom-anchored block of about two lines.
    const lift = label.fontSize * (label.lineHeight ?? 1) * 1.5;
    out.push({
      id: `room:${room.slug}`,
      text: room.slug,
      at: [label.position[0], label.position[1] + Math.cos(tilt) * lift, label.position[2] - Math.sin(tilt) * lift],
      fontSize: desktop[i].fontSize,
      ...phoneSize(desktop[i].fontSize, label.fontSize),
      yaw: 0,
      flips: true,
      tilt,
      reading,
    });
    if (room.type === "award") {
      const size = placingSize(room, false);
      const phoneFont = placingSize(room, true);
      out.push({
        id: `placing:${room.slug}`,
        text: "\u00D7N",
        at: [room.center.x, PLACING.y + (Math.cos(PLACING.tilt) * phoneFont) / 2, room.center.z + PLACING.ahead - (Math.sin(PLACING.tilt) * phoneFont) / 2],
        fontSize: size,
        ...phoneSize(size, phoneFont),
        yaw: 0,
        flips: true,
        tilt: PLACING.tilt,
        reading,
      });
    }
  });
  const posts = signpostSet(road.years, () => "");
  const phonePosts = signpostSet(road.years, () => "", true);
  road.years.forEach((y, i) => {
    const reading = { at: y.arch.center, heading: Math.PI / 2 };
    const top = CAREER_ROAD.archHeight + YEAR_DIGITS.bar + YEAR_DIGITS.lift;
    out.push({ id: `year:${y.year}`, text: String(y.year), at: [y.arch.center.x, top + YEAR_DIGITS.fontSize / 2, y.arch.center.z], fontSize: YEAR_DIGITS.fontSize, yaw: 0, flips: true, reading });
    const post = phonePosts.labels[i];
    const size = posts.labels[i].fontSize;
    out.push({ id: `signpost:${y.year}`, text: post.text, at: [post.position[0], post.position[1] - post.fontSize / 2, post.position[2]], fontSize: size, ...phoneSize(size, post.fontSize), yaw: 0, flips: true, reading });
  });
  const w = road.workshop;
  const names = { workshop: "workshop", console: "console", repos: "repos" };
  const signs = workshopSigns(w, names, "");
  const phoneSigns = workshopSigns(w, names, "", true);
  const middle = w.skyline.stops[Math.floor(w.skyline.stops.length / 2)];
  const stops = [w.gateway.stop, w.console.stop, middle];
  phoneSigns.forEach((sign, i) => {
    if (!stops[i]) return;
    const fontSize = signs[i].fontSize;
    out.push({ id: `sign:${sign.text.split(" ")[0].toLowerCase()}`, text: sign.text, at: [sign.x, sign.y, sign.z], fontSize, ...phoneSize(fontSize, sign.fontSize), tilt: sign.tilt, reading: { at: stops[i], heading: headingTo(stops[i], sign) } });
  });
  return out;
}
