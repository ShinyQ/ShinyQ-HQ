import { COLORS } from "../../config";
import { signPlate, type SignSpec } from "../../fx/signLayout";
import type { BatchedLabel } from "../../fx/labelProps";
import { FONTS } from "../../tower/primitives";
import type { CareerEntryView } from "../../types";
import { CAREER_ROAD, type CareerRoadLayout, type CareerRoom } from "./layout";

/** Labels for one `BatchedLabels` plus the road x of each, for the distance fade. */
export interface LabelSet {
  labels: BatchedLabel[];
  xs: number[];
  /** Floor x, z each label turns half a turn around when the camera is behind it (like `Readable`). */
  pivots: [number, number][];
  /** Text shown while turned around (the signpost's arrow keeps pointing into the plaza). */
  flippedText?: string[];
}

export const ROOM_LABEL_Y = 4.7;

/** One label per career room with an entry: role, then org and period; leans back 0.55 rad toward the rail camera. */
export function roomLabelSet(rooms: readonly CareerRoom[], entries: ReadonlyMap<string, CareerEntryView>): LabelSet {
  const labels: BatchedLabel[] = [];
  const xs: number[] = [];
  const pivots: [number, number][] = [];
  for (const room of rooms) {
    const entry = entries.get(room.slug);
    if (!entry) continue;
    xs.push(room.center.x);
    pivots.push([room.center.x, room.center.z]);
    labels.push({
      text: `${entry.role}\n${entry.org} \u00B7 ${entry.period}`,
      position: [room.center.x, ROOM_LABEL_Y, room.center.z],
      tilt: 0.55,
      font: FONTS.sansBold,
      fontSize: 0.4,
      lineHeight: 1.25,
      maxWidth: room.w + 0.6,
      outlineWidth: 0.03,
      outlineColor: COLORS.void,
      textAlign: "center",
      color: "#f4f4f5",
      anchorX: "center",
      anchorY: "bottom",
    });
  }
  return { labels, xs, pivots };
}

/** The signpost under each year arch ("2021 · 8 rooms →"). */
export function signpostSet(years: CareerRoadLayout["years"], roomsLabel: (count: number) => string): LabelSet {
  return {
    xs: years.map((y) => y.arch.center.x),
    pivots: years.map((y) => [y.arch.center.x, y.arch.center.z]),
    // Seen from behind, the plaza (+x) is on the viewer's left, so the arrow moves to the front.
    flippedText: years.map((y) => `\u2190 ${y.year} \u00B7 ${roomsLabel(y.rooms.length)}`),
    labels: years.map((y) => ({
      text: `${y.year} \u00B7 ${roomsLabel(y.rooms.length)} \u2192`,
      position: [y.arch.center.x, CAREER_ROAD.archHeight - 0.2, y.arch.center.z + CAREER_ROAD.width / 2 + 1.4],
      font: FONTS.mono,
      fontSize: 0.42,
      letterSpacing: 0.06,
      color: COLORS.white,
      outlineWidth: 0.03,
      outlineColor: COLORS.void,
      anchorX: "center",
      anchorY: "top",
    })),
  };
}

/**
 * The floating year marker over each plaza (it used to be painted on the plaza floor): bottom edge
 * height, type size, lean, and how far behind the back of the north room row it stands.
 */
export const YEAR_MARKER = { bottom: 2.6, fontSize: 2.2, tilt: 0.3, letterSpacing: 0.06, behind: 1.5 } as const;

/**
 * One floating year per plaza, standing behind its north room row like a backdrop (the far side from
 * the rail camera, which looks north from 30 u south and 22 u up): big and bright in the floor accent,
 * it never stands between that camera and the road, the rover or a room. Leans back a little toward
 * the camera; fades with distance along the road like the room labels.
 */
export function yearMarkerSigns(years: CareerRoadLayout["years"], color: string): SignSpec[] {
  return years.map((y) => {
    const text = String(y.year);
    const { h } = signPlate({ text, fontSize: YEAR_MARKER.fontSize, letterSpacing: YEAR_MARKER.letterSpacing });
    return {
      text,
      x: y.plaza.center.x,
      y: YEAR_MARKER.bottom + h / 2,
      z: y.plaza.center.z - y.plaza.d / 2 - CAREER_ROAD.apron - CAREER_ROAD.roomDepth - YEAR_MARKER.behind,
      color,
      fontSize: YEAR_MARKER.fontSize,
      letterSpacing: YEAR_MARKER.letterSpacing,
      font: FONTS.monoBold,
      tilt: YEAR_MARKER.tilt,
      fadeX: y.plaza.center.x,
    };
  });
}
