import type { Wing } from "@/content/schema";
import type { BatchedLabel } from "../../fx/labelProps";
import type { LabPod } from "../../types";
import type { Box } from "../roof/solids";
import { directoryBoard, LABS, LABS_WINGS, tourOrder, WING_TINT, type DirectoryBoard } from "./layout";

/**
 * Pure content of the L3 wing directory wall (owner request 2026-10-13: noticeable on arrival) and of
 * the Data and ML panel past the data plaza (owner request 2026-10-14). All panels are one merged mesh, their rims and title underlines one line batch, every text one troika
 * BatchedText (3 draw calls). Each panel shows the same text on its west face (the arrival camera and
 * the board stop) and its east face (rovers coming back from the wings). Text is pre-wrapped here, so
 * the line count is known and the list never runs into the footer. Phones get the `compact` wall:
 * the top three projects in larger type instead of five. Vitest runs it in node.
 */

export interface DirectoryLabels {
  /** Wing display names (messages `common.wing`). */
  wings: Record<Wing, string>;
  /** "Directory", localized. */
  directory: string;
  /** Panel footer: the full list opens in the palette. */
  open: string;
  /** "{count} projects", localized. */
  count: (count: number) => string;
}

export interface DirectoryFonts {
  mono: string;
  monoBold: string;
  sansBold: string;
}

/** One line segment (floor-local x, y, z twice) in a wing tint. */
export interface WallLine {
  seg: [number, number, number, number, number, number];
  color: string;
}

/** Directory panels by wing: the layout's `boards` (the data panel stands past the data plaza); the hub pair by default. */
export type WallBoards = Partial<Record<Wing, DirectoryBoard>>;
const HUB_BOARDS: WallBoards = { software: directoryBoard("software"), ai: directoryBoard("ai") };
const panels = (boards: WallBoards) => LABS_WINGS.flatMap((wing) => (boards[wing] ? [{ wing, b: boards[wing]! }] : []));
export const TIER_MARK: Record<LabPod["tier"], string> = { hero: "\u25C6", featured: "\u25C7", listed: "\u00B7" };

/** Panel text layout in u: heights from the floor, sizes as font em. */
export const PANEL = {
  /** Text inset from each side edge of a face. */
  inset: 0.3,
  /** Text and underlines stand this far off the face (no z-fighting). */
  out: 0.03,
  title: { top: 0.35, size: 0.8, lineHeight: 1, lines: 2 },
  /** Gap between the title block and its underline. */
  underline: 0.2,
  sub: { gap: 0.2, size: 0.3 },
  list: { gap: 0.3, size: 0.46, lineHeight: 1.1, perEntry: 2 },
  footer: { y: 0.75, size: 0.32, gap: 0.25 },
} as const;

/** `full` on desktops and tablets; `compact` on phones (`device.viewport === "mobile"`). */
export type WallSize = "full" | "compact";

/** How a panel lists its top projects: type size and line height (em), lines per entry, entries shown. */
export interface ListStyle {
  size: number;
  lineHeight: number;
  perEntry: number;
  entries: number;
}

/**
 * Desktops and tablets list the top `LABS.boardEntries` (5). Phones list the top 3 in larger type, so
 * they read from the arrival view and the panel stop; the panel width (21 characters per line at
 * 0.56 u) fits most top-3 titles in two lines, the panel's seventh line lets one longer title take a
 * third (`boardList`), and the taller line height separates the entries.
 */
export const LIST_STYLE: Record<WallSize, ListStyle> = {
  full: { size: PANEL.list.size, lineHeight: PANEL.list.lineHeight, perEntry: PANEL.list.perEntry, entries: LABS.boardEntries },
  compact: { size: 0.56, lineHeight: 1.25, perEntry: 2, entries: 3 },
};

/** Average advance per character in em: JetBrains Mono is 0.6; Inter ExtraBold measures 0.51 to 0.57 on the project titles. */
const MONO_EM = 0.6;
const SANS_EM = 0.58;
const INK = { sub: "#d4d4d8", list: "#f4f4f5" } as const;
/** West face: toward the arrival camera and the board stop, reads along +z. East face: reads along -z. */
const FACES = [
  { side: -1, yaw: -Math.PI / 2, along: 1 },
  { side: 1, yaw: Math.PI / 2, along: -1 },
] as const;

/** Text width on a face. */
export const textWidth = (): number => LABS.board.d - 2 * PANEL.inset;

/** Characters per list line at the list size (conservative average advance). */
export const listChars = (style: ListStyle = LIST_STYLE.full): number => Math.floor(textWidth() / (SANS_EM * style.size));

/** Heights of the title top, underline, subtitle top and list block, and how many list lines fit. */
export function panelRows(style: ListStyle = LIST_STYLE.full) {
  const titleTop = LABS.board.h - PANEL.title.top;
  const underline = titleTop - PANEL.title.size * PANEL.title.lineHeight * PANEL.title.lines - PANEL.underline;
  const subTop = underline - PANEL.sub.gap;
  const listTop = subTop - PANEL.sub.size - PANEL.list.gap;
  const listBottom = PANEL.footer.y + PANEL.footer.size + PANEL.footer.gap;
  const listLines = Math.floor((listTop - listBottom) / (style.size * style.lineHeight) + 1e-9);
  return { titleTop, underline, subTop, listTop, listBottom, listLines };
}

/** Greedy word wrap: at most `first` characters on the first line, `rest` on the others; a longer word gets a line of its own. */
export function wrapWords(text: string, first: number, rest: number = first): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (!line || next.length <= (lines.length ? rest : first)) line = next;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * The wing name in capitals, split into two lines at the space nearest the middle whenever it has one,
 * so both wing titles share one layout (mirror images); the size shrinks only if the longest line would not fit.
 */
export function fitTitle(name: string, width: number): { lines: string[]; size: number } {
  const upper = name.toUpperCase();
  const spaces = [...upper].flatMap((c, i) => (c === " " ? [i] : []));
  let lines = [upper];
  if (spaces.length > 0) {
    const mid = upper.length / 2;
    const cut = spaces.reduce((best, i) => (Math.abs(i - mid) < Math.abs(best - mid) ? i : best));
    lines = [upper.slice(0, cut), upper.slice(cut + 1)];
  }
  const longest = Math.max(...lines.map((l) => l.length));
  return { lines, size: Math.min(PANEL.title.size, width / (MONO_EM * longest)) };
}

/**
 * The top `style.entries` docked pods (docking order, gallery first), each a tier mark and at most `style.perEntry`
 * lines, within `maxLines`. Lines the panel has beyond `entries * perEntry` let a longer title wrap whole instead of
 * ending in "..." (the phone list: 7 lines for 3 entries).
 */
export function boardList(list: readonly LabPod[], maxLines: number, style: ListStyle = LIST_STYLE.full): { text: string; entries: number; lines: number } {
  const chars = listChars(style);
  const out: string[] = [];
  let lines = 0;
  let spare = Math.max(0, maxLines - style.entries * style.perEntry);
  for (const pod of tourOrder(list).slice(0, style.entries)) {
    let wrapped = wrapWords(pod.title, chars - 2, chars);
    const allowed = style.perEntry + spare;
    spare -= Math.max(0, Math.min(wrapped.length, allowed) - style.perEntry);
    if (wrapped.length > allowed) {
      wrapped = wrapped.slice(0, allowed);
      const last = wrapped.length - 1;
      wrapped[last] = `${wrapped[last].slice(0, chars - 3).trimEnd()}...`;
    }
    if (lines + wrapped.length > maxLines) break;
    lines += wrapped.length;
    out.push(`${TIER_MARK[pod.tier]} ${wrapped.join("\n")}`);
  }
  return { text: out.join("\n"), entries: out.length, lines };
}

/** Every panel as solids (one merged mesh). */
export function wallSolids(boards: WallBoards = HUB_BOARDS): Box[] {
  return panels(boards).map(({ b }) => {
    return { x: b.center.x, y: 0, z: b.center.z, w: LABS.board.w, h: LABS.board.h, d: LABS.board.d };
  });
}

/** Each panel's 12 rim edges and a title underline on both faces, in its wing tint (one line batch). */
export function wallLines(boards: WallBoards = HUB_BOARDS): WallLine[] {
  const out: WallLine[] = [];
  const { underline } = panelRows();
  const half = textWidth() / 2;
  for (const { wing, b } of panels(boards)) {
    const color = WING_TINT[wing];
    const y1 = LABS.board.h;
    const c: [number, number, number][] = [
      [b.minX, 0, b.minZ],
      [b.maxX, 0, b.minZ],
      [b.maxX, 0, b.maxZ],
      [b.minX, 0, b.maxZ],
      [b.minX, y1, b.minZ],
      [b.maxX, y1, b.minZ],
      [b.maxX, y1, b.maxZ],
      [b.minX, y1, b.maxZ],
    ];
    const edges = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]] as const;
    for (const [a, e] of edges) out.push({ seg: [...c[a], ...c[e]], color });
    for (const face of FACES) {
      const x = b.center.x + face.side * (LABS.board.w / 2 + PANEL.out);
      out.push({ seg: [x, underline, b.center.z - half, x, underline, b.center.z + half], color });
    }
  }
  return out;
}

/** Every text of the wall, both faces of both panels (one BatchedText). Wing names come from `labels.wings`, never literals. */
export function wallLabels(pods: readonly LabPod[], labels: DirectoryLabels, fonts: DirectoryFonts, size: WallSize = "full", boards: WallBoards = HUB_BOARDS): BatchedLabel[] {
  const style = LIST_STYLE[size];
  const rows = panelRows(style);
  const width = textWidth();
  const out: BatchedLabel[] = [];
  for (const { wing, b } of panels(boards)) {
    const inWing = pods.filter((p) => p.wing === wing);
    const title = fitTitle(labels.wings[wing], width);
    const list = boardList(inWing, rows.listLines, style);
    const sub = `${labels.directory.toUpperCase()} \u00B7 ${labels.count(inWing.length).toUpperCase()}`;
    const footer = `\u25B8 ${labels.open.toUpperCase()}`;
    const color = WING_TINT[wing];
    for (const face of FACES) {
      const x = b.center.x + face.side * (LABS.board.w / 2 + PANEL.out);
      const at = (u: number, y: number): [number, number, number] => [x, y, b.center.z + face.along * u];
      out.push(
        { text: title.lines.join("\n"), position: at(0, rows.titleTop), yaw: face.yaw, font: fonts.monoBold, fontSize: title.size, color, anchorX: "center", anchorY: "top", textAlign: "center", lineHeight: PANEL.title.lineHeight },
        { text: sub, position: at(0, rows.subTop), yaw: face.yaw, font: fonts.mono, fontSize: PANEL.sub.size, color: INK.sub, anchorX: "center", anchorY: "top", textAlign: "center" },
        { text: list.text, position: at(-width / 2, rows.listTop), yaw: face.yaw, font: fonts.sansBold, fontSize: style.size, color: INK.list, anchorX: "left", anchorY: "top", textAlign: "left", lineHeight: style.lineHeight },
        { text: footer, position: at(0, PANEL.footer.y), yaw: face.yaw, font: fonts.monoBold, fontSize: PANEL.footer.size, color, anchorX: "center", anchorY: "bottom", textAlign: "center" },
      );
    }
  }
  return out.filter((l) => l.text.trim().length > 0);
}
