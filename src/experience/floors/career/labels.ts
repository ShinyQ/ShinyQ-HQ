import { COLORS } from "../../config";
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
