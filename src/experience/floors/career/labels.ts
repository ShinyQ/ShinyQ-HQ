import { COLORS } from "../../config";
import type { SignSpec } from "../../fx/signLayout";
import type { BatchedLabel } from "../../fx/labelProps";
import { FONTS } from "../../tower/primitives";
import type { CareerEntryView } from "../../types";
import { PAD_TONE } from "../../fx/holoIcons";
import { monoWidth } from "../../fx/readableFlip";
import { CAREER_ROAD, type CareerRoadLayout, type CareerRoom } from "./layout";
import { SKYLINE, skylineLanguages, topBars } from "./skyline";
import { WORKSHOP, type WorkshopLayout } from "./workshopLayout";

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

/** Workshop scenery heights (u), shared by the scene, the labels and the pick volumes (`interact/registry.ts`). */
export const WORKSHOP_SCENE = {
  /** Bench hologram card: center height, size (vertical, facing the rail camera). */
  card: { y: 1.7, w: 2, h: 1.1, d: 0.04 },
  /** Neon line icon over each card (full tier). */
  icon: { y: 2.75, size: 0.6 },
  /** Console screen: center height and depth (vertical, facing the rail camera). */
  screen: { y: 2.05, d: 0.05 },
  /** Text sits this far in front of its plate. */
  lift: 0.03,
  /** Years per row on the console screen. */
  yearsPerRow: 4,
  /** Skyline label: characters before an ellipsis, gap above the bar. */
  repoName: 22,
  repoGap: 0.5,
} as const;

/** Shortens a name to `max` characters with "..." (repo names run up to 80 characters). */
export function fitName(name: string, max: number): string {
  return name.length <= max ? name : `${name.slice(0, max - 3)}...`;
}

export interface WorkshopSignLabels {
  workshop: string;
  console: string;
  repos: string;
}

/** Floating signs over the gateway (the Workshop), the time console and the repo skyline; they fade with the rover's distance like the room labels. */
export function workshopSigns(w: WorkshopLayout, labels: WorkshopSignLabels, color: string): SignSpec[] {
  const gatewayTop = WORKSHOP.gateway.height + WORKSHOP.gateway.beam;
  const signs: SignSpec[] = [
    { text: labels.workshop.toUpperCase(), x: w.gateway.x, y: gatewayTop + 1.3, z: 0, color, fontSize: 0.9, letterSpacing: 0.08, font: FONTS.monoBold, tilt: 0.2, fadeX: w.gateway.x },
    { text: labels.console.toUpperCase(), x: w.console.center.x, y: WORKSHOP_SCENE.screen.y + WORKSHOP.console.screenH / 2 + 1, z: w.console.center.z, color: COLORS.cyan, fontSize: 0.5, letterSpacing: 0.08, font: FONTS.monoBold, fadeX: w.console.center.x },
  ];
  if (w.skyline.bars.length > 0) {
    const p = w.skyline.plinth;
    signs.push({
      text: `${labels.repos.toUpperCase()} \u00B7 ${w.skyline.bars.length}`,
      x: (p.minX + p.maxX) / 2,
      y: SKYLINE.plinth + w.skyline.top + 2.2,
      z: (p.minZ + p.maxZ) / 2,
      color: COLORS.cyan,
      fontSize: 0.6,
      letterSpacing: 0.06,
      font: FONTS.monoBold,
      tilt: 0.2,
      fadeX: (p.minX + p.maxX) / 2,
    });
  }
  return signs;
}

export interface WorkshopTextInput {
  benches: { id: string; title: string; year: number | null }[];
  years: readonly number[];
  back: string;
  stars: (count: number) => string;
  /** Language legend on the plinth's front face (full tier). */
  legend: boolean;
}

/** The console's year list: rows of `yearsPerRow` years (pink like the year teleporters). */
export function consoleYearsText(years: readonly number[]): string {
  const rows: string[] = [];
  for (let i = 0; i < years.length; i += WORKSHOP_SCENE.yearsPerRow) rows.push(years.slice(i, i + WORKSHOP_SCENE.yearsPerRow).join("  "));
  return rows.join("\n");
}

/**
 * Every Workshop text in one batch: bench card titles, the names and stars of the top repos over their
 * bars, the console's year list, and (full tier) the language legend on the plinth. Each turns around its
 * pivot when the camera is behind it and fades with distance along x (`useMemberFade`).
 */
export function workshopLabelSet(w: WorkshopLayout, input: WorkshopTextInput): LabelSet {
  const S = WORKSHOP_SCENE;
  const set: LabelSet = { labels: [], xs: [], pivots: [] };
  const add = (label: BatchedLabel, pivot: [number, number]) => {
    set.labels.push(label);
    set.xs.push(pivot[0]);
    set.pivots.push(pivot);
  };
  const titles = new Map(input.benches.map((b) => [b.id, b]));
  for (const bench of w.benches) {
    const p = titles.get(bench.id);
    if (!p) continue;
    add(
      {
        text: p.year ? `${p.title}\n${p.year}` : p.title,
        position: [bench.center.x, S.card.y, bench.center.z + S.card.d / 2 + S.lift],
        font: FONTS.sansBold,
        fontSize: 0.2,
        lineHeight: 1.25,
        maxWidth: S.card.w - 0.2,
        textAlign: "center",
        anchorX: "center",
        anchorY: "middle",
        color: "#f4f4f5",
      },
      [bench.center.x, bench.center.z],
    );
  }
  for (const bar of topBars(w.skyline.bars)) {
    add(
      {
        text: `${fitName(bar.name, S.repoName)}\n${input.stars(bar.stars)}`,
        position: [bar.x, SKYLINE.plinth + bar.h + S.repoGap, bar.z],
        font: FONTS.mono,
        fontSize: 0.3,
        lineHeight: 1.3,
        textAlign: "center",
        anchorX: "center",
        anchorY: "bottom",
        color: bar.color,
      },
      [bar.x, bar.z],
    );
  }
  // The console screen: the years in the teleporters' pink, then "Back to elevator" in the Return pad's green.
  const c = w.console;
  const z = c.center.z + S.screen.d / 2 + S.lift;
  const lineH = 0.24 * 1.45;
  const rows = Math.ceil(input.years.length / S.yearsPerRow);
  const top = S.screen.y + ((rows + 1) * lineH) / 2;
  add(
    { text: consoleYearsText(input.years), position: [c.center.x, top, z], font: FONTS.mono, fontSize: 0.24, lineHeight: 1.45, textAlign: "center", anchorX: "center", anchorY: "top", color: PAD_TONE.teleport },
    [c.center.x, c.center.z],
  );
  add(
    { text: `\u2192 ${input.back}`, position: [c.center.x, top - rows * lineH, z], font: FONTS.mono, fontSize: 0.24, anchorX: "center", anchorY: "top", color: PAD_TONE.return },
    [c.center.x, c.center.z],
  );
  if (input.legend && w.skyline.bars.length > 0) {
    const p = w.skyline.plinth;
    const size = 0.26;
    const items = skylineLanguages(w.skyline.bars);
    const widths = items.map((l) => monoWidth(l.language, size));
    const gap = 0.9;
    let x = (p.minX + p.maxX) / 2 - (widths.reduce((a, b) => a + b, 0) + gap * (items.length - 1)) / 2;
    items.forEach((l, i) => {
      add(
        { text: l.language, position: [x, SKYLINE.plinth / 2, p.maxZ + S.lift], font: FONTS.mono, fontSize: size, anchorX: "left", anchorY: "middle", color: l.color },
        [(p.minX + p.maxX) / 2, p.maxZ],
      );
      x += widths[i] + gap;
    });
  }
  return set;
}
