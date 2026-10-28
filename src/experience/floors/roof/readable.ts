import { interWidth } from "../../fx/interWidth";
import { headingTo, type Readable } from "../../readable";
import type { Vec2 } from "../../types";
import { ROOF_DECK, type RoofLayout } from "./layout";

/** The availability sign on the mast (`SignalGarden`): out from the mast along `ROOF_DECK.signYaw`, plate bottom, size, headline type. */
export const ROOF_SIGN = { offset: 2.3, bottom: 4.2, w: 8, h: 3.4, fontSize: 0.5 } as const;
/** The comms station's name over it (`SignalGarden`): height and type size. */
export const COMMS_LABEL = { y: 5.6, fontSize: 0.44 } as const;
/** Channel names over their antennas: gap over the ring, offset toward the plaza, type size and on a portrait phone (camera class `mobile`). */
export const CHANNEL_LABEL = { lift: 0.6, ahead: 0.2, fontSize: 0.38, phone: 0.41 } as const;
/** The CV station's title on its screen, facing west: x from the station's west edge, height and type size. */
export const CV_TITLE = { dx: 3.28, y: 3.0, fontSize: 0.3 } as const;

/** Antenna height of channel `i`: odd channels stand taller, so their labels sit on a second row and never overlap. */
export const antennaHeight = (i: number): number => (i % 2 ? 3.4 : 2.6);
/** Height of channel `i`'s pulse ring (just over its antenna). */
export const channelRingY = (i: number): number => 0.3 + antennaHeight(i) + 0.15;
/** The availability sign's center on the floor plan: `ROOF_SIGN.offset` out from the mast along the sign's facing. */
export function roofSignCenter(mast: Vec2): Vec2 {
  return { x: mast.x + Math.sin(ROOF_DECK.signYaw) * ROOF_SIGN.offset, z: mast.z + Math.cos(ROOF_DECK.signYaw) * ROOF_SIGN.offset };
}

const mid = (a: number, b: number) => (a + b) / 2;
/** Width of an upper-case monospace line (0.6 em advances plus the letter spacing, in em). */
const monoWidth = (text: string, size: number, spacing: number) => text.length * (0.6 + spacing) * size;

/**
 * Every RF title and name with the pose a visitor reads it from (the phone reading rule, `src/experience/readable.ts`):
 * the availability headline from the availability stop, the comms name and the channel names from the comms door pad,
 * the CV title from the CV door pad. The availability header line, the email address and the CV hint are fine print.
 */
export function readableLabels(layout: RoofLayout, text: { comms: string; channels: readonly string[]; cvTitle: string }): Readable[] {
  const { centerpiece: cp, comms, cv, stops } = layout;
  const toward = (from: Vec2, to: Vec2) => ({ at: from, heading: headingTo(from, to) });
  const sign = roofSignCenter(cp.center);
  const n = { x: Math.sin(ROOF_DECK.signYaw), z: Math.cos(ROOF_DECK.signYaw) };
  const commsAt = { x: mid(comms.minX, comms.maxX), z: mid(comms.minZ, comms.maxZ) };
  const cvAt = { x: cv.minX + CV_TITLE.dx, z: mid(cv.minZ, cv.maxZ) };
  return [
    {
      id: "availability",
      text: "availability",
      at: [sign.x + n.x * 0.08, ROOF_SIGN.bottom + (ROOF_SIGN.h - 0.7) / 2, sign.z + n.z * 0.08],
      fontSize: ROOF_SIGN.fontSize,
      yaw: ROOF_DECK.signYaw,
      reading: toward(stops.availability, cp.center),
    },
    { id: "comms", text: text.comms, at: [commsAt.x, COMMS_LABEL.y, commsAt.z], fontSize: COMMS_LABEL.fontSize, width: monoWidth(text.comms, COMMS_LABEL.fontSize, 0.14), yaw: 0, reading: toward(stops.contact, commsAt) },
    ...layout.channelSlots.map((s, i): Readable => ({
      id: `channel:${i}`,
      text: text.channels[i] ?? "",
      at: [s.x, channelRingY(i) + CHANNEL_LABEL.lift, s.z + CHANNEL_LABEL.ahead],
      fontSize: CHANNEL_LABEL.fontSize,
      phoneFontSize: CHANNEL_LABEL.phone,
      // The bold cut runs about 5 percent wider than Inter 400.
      width: interWidth(text.channels[i] ?? "") * CHANNEL_LABEL.fontSize * 1.05,
      yaw: 0,
      reading: toward(stops.contact, commsAt),
    })),
    { id: "cv", text: text.cvTitle, at: [cvAt.x, CV_TITLE.y, cvAt.z], fontSize: CV_TITLE.fontSize, width: monoWidth(text.cvTitle, CV_TITLE.fontSize, 0.1), yaw: -Math.PI / 2, reading: toward(stops.cv, cvAt) },
  ];
}
