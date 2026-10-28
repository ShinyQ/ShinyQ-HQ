import { headingTo, type Readable } from "../../readable";
import { CAREER_ROAD, type CareerRoadLayout } from "./layout";
import { PLACING, placingSize, ROOM_LABEL, ROOM_LABEL_Y, SIGNPOST, signpostSet, workshopSigns, YEAR_DIGITS } from "./labels";

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
  for (const room of road.rooms) {
    const reading = { at: room.at, heading: headingTo(room.at, room.center) };
    const size = ROOM_LABEL.phone[room.side < 0 ? "far" : "near"];
    // The role is the first line of a bottom-anchored block of about two lines.
    const lift = size * ROOM_LABEL.lineHeight * 1.5;
    out.push({
      id: `room:${room.slug}`,
      text: room.slug,
      at: [room.center.x, ROOM_LABEL_Y + Math.cos(ROOM_LABEL.tilt) * lift, room.center.z - Math.sin(ROOM_LABEL.tilt) * lift],
      fontSize: ROOM_LABEL.fontSize,
      ...phoneSize(ROOM_LABEL.fontSize, size),
      yaw: 0,
      flips: true,
      tilt: ROOM_LABEL.tilt,
      reading,
    });
    if (room.type === "award") {
      const placing = placingSize(room, true);
      out.push({
        id: `placing:${room.slug}`,
        text: "\u00D7N",
        at: [room.center.x, PLACING.y + (Math.cos(PLACING.tilt) * placing) / 2, room.center.z + PLACING.ahead - (Math.sin(PLACING.tilt) * placing) / 2],
        fontSize: PLACING.fontSize,
        ...phoneSize(PLACING.fontSize, placing),
        yaw: 0,
        flips: true,
        tilt: PLACING.tilt,
        reading,
      });
    }
  }
  const posts = signpostSet(road.years, () => "", true);
  road.years.forEach((y, i) => {
    const reading = { at: y.arch.center, heading: Math.PI / 2 };
    const top = CAREER_ROAD.archHeight + YEAR_DIGITS.bar + YEAR_DIGITS.lift;
    out.push({ id: `year:${y.year}`, text: String(y.year), at: [y.arch.center.x, top + YEAR_DIGITS.fontSize / 2, y.arch.center.z], fontSize: YEAR_DIGITS.fontSize, yaw: 0, flips: true, reading });
    const post = posts.labels[i];
    out.push({ id: `signpost:${y.year}`, text: post.text, at: [post.position[0], post.position[1] - post.fontSize / 2, post.position[2]], fontSize: SIGNPOST.fontSize, ...phoneSize(SIGNPOST.fontSize, post.fontSize), yaw: 0, flips: true, reading });
  });
  const w = road.workshop;
  const desktop = workshopSigns(w, { workshop: "workshop", console: "console", repos: "repos" }, "");
  const phone = workshopSigns(w, { workshop: "workshop", console: "console", repos: "repos" }, "", true);
  const middle = w.skyline.stops[Math.floor(w.skyline.stops.length / 2)];
  const stops = [w.gateway.stop, w.console.stop, middle];
  phone.forEach((sign, i) => {
    if (!stops[i]) return;
    const fontSize = desktop[i].fontSize;
    out.push({ id: `sign:${sign.text.split(" ")[0].toLowerCase()}`, text: sign.text, at: [sign.x, sign.y, sign.z], fontSize, ...phoneSize(fontSize, sign.fontSize), tilt: sign.tilt, reading: { at: stops[i], heading: headingTo(stops[i], sign) } });
  });
  return out;
}
