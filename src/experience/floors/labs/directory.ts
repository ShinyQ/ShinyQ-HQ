import type { Wing } from "@/content/schema";
import type { BatchedLabel } from "../../fx/labelProps";
import type { LabPod } from "../../types";
import type { Vec2 } from "../../types";
import type { Box } from "../roof/solids";
import { directoryBoard, LABS, LABS_WINGS, tourOrder, wallPosts, WING_TINT, type DirectoryBoard } from "./layout";

/**
 * Pure content of the L3 directory boards where the three roads fork (owner request 2026-10-13: noticeable
 * on arrival; plan 2026-10-16: three free-standing boards, the Data and ML board a gate over the spine on
 * two posts, each side board on one pylon, turned toward the axis). Boards and posts are one merged mesh,
 * their rims, post edges and title underlines one line batch, every text one troika BatchedText (3 draw
 * calls). Each board shows the same text on its front face (the arrival camera and the board stop) and
 * its back face (rovers coming back from the roads). Text is pre-wrapped here, so the line count is known
 * and the list never runs into the footer. Phones get the `compact` boards: the top three projects in
 * larger type instead of five. Vitest runs it in node.
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

/** Directory boards by wing: the layout's `boards`; all three fixed boards by default. */
export type WallBoards = Partial<Record<Wing, DirectoryBoard>>;
const WALL_BOARDS: WallBoards = Object.fromEntries(LABS_WINGS.map((w) => [w, directoryBoard(w)]));
const panels = (boards: WallBoards) => LABS_WINGS.flatMap((wing) => (boards[wing] ? [{ wing, b: boards[wing]! }] : []));
export const TIER_MARK: Record<LabPod["tier"], string> = { hero: "\u25C6", featured: "\u25C7", listed: "\u00B7" };

/** Board text layout in u: heights from the floor (the footer from the board's bottom edge), sizes as font em. Owner request Round 7: titles about 25 percent and lists about 20 percent smaller. */
export const PANEL = {
  /** Text inset from each side edge of a face. */
  inset: 0.3,
  /** Text and underlines stand this far off the face (no z-fighting). */
  out: 0.03,
  title: { top: 0.35, size: 0.6, lineHeight: 1, lines: 2 },
  /** Gap between the title block and its underline. */
  underline: 0.2,
  sub: { gap: 0.2, size: 0.3 },
  list: { gap: 0.3, size: 0.37, lineHeight: 1.1, perEntry: 2 },
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
 * they read from the arrival view and the board stop; the text width (22 characters per line at
 * 0.45 u) still fits every top-3 title in two lines, and the taller line height separates the entries.
 * Both sizes are about 20 percent below the earlier 0.46 and 0.56 (owner request Round 7).
 */
export const LIST_STYLE: Record<WallSize, ListStyle> = {
  full: { size: PANEL.list.size, lineHeight: PANEL.list.lineHeight, perEntry: PANEL.list.perEntry, entries: LABS.boardEntries },
  compact: { size: 0.45, lineHeight: 1.25, perEntry: 2, entries: 3 },
};

/** Average advance per character in em: JetBrains Mono is 0.6; Inter ExtraBold measures 0.51 to 0.57 on the project titles. */
const MONO_EM = 0.6;
const SANS_EM = 0.58;
const INK = { sub: "#d4d4d8", list: "#f4f4f5" } as const;

/** One face of a board: where its text plane stands (`PANEL.out` off the face), its troika yaw and reading direction. */
interface Face {
  origin: Vec2;
  yaw: number;
  along: Vec2;
}

/** The front face (toward the arrival camera and the board stop, reading along `b.along`), then the back face (reading the other way). */
function faces(b: DirectoryBoard): Face[] {
  const out = LABS.board.w / 2 + PANEL.out;
  return [1, -1].map((s) => ({
    origin: { x: b.center.x + s * b.normal.x * out, z: b.center.z + s * b.normal.z * out },
    yaw: s > 0 ? b.yaw : b.yaw + Math.PI,
    along: { x: s * b.along.x, z: s * b.along.z },
  }));
}

/** Text width on a face: the same on every board. */
export const textWidth = (): number => LABS.board.width - 2 * PANEL.inset;

/** Characters per list line at the list size (conservative average advance). */
export const listChars = (style: ListStyle = LIST_STYLE.full): number => Math.floor(textWidth() / (SANS_EM * style.size));

/** Heights of the title top, underline, subtitle top and list block, and how many list lines fit. */
export function panelRows(style: ListStyle = LIST_STYLE.full) {
  const titleTop = LABS.board.h - PANEL.title.top;
  const underline = titleTop - PANEL.title.size * PANEL.title.lineHeight * PANEL.title.lines - PANEL.underline;
  const subTop = underline - PANEL.sub.gap;
  const listTop = subTop - PANEL.sub.size - PANEL.list.gap;
  const listBottom = LABS.board.base + PANEL.footer.y + PANEL.footer.size + PANEL.footer.gap;
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

/** The top `style.entries` docked pods (docking order, gallery first), each a tier mark and at most `style.perEntry` lines, within `maxLines`. */
export function boardList(list: readonly LabPod[], maxLines: number, style: ListStyle = LIST_STYLE.full): { text: string; entries: number; lines: number } {
  const chars = listChars(style);
  const out: string[] = [];
  let lines = 0;
  for (const pod of tourOrder(list).slice(0, style.entries)) {
    let wrapped = wrapWords(pod.title, chars - 2, chars);
    if (wrapped.length > style.perEntry) {
      wrapped = wrapped.slice(0, style.perEntry);
      const last = wrapped.length - 1;
      wrapped[last] = `${wrapped[last].slice(0, chars - 3).trimEnd()}...`;
    }
    if (lines + wrapped.length > maxLines) break;
    lines += wrapped.length;
    out.push(`${TIER_MARK[pod.tier]} ${wrapped.join("\n")}`);
  }
  return { text: out.join("\n"), entries: out.length, lines };
}

/** Every board, then the posts under them, as turned solids (one merged mesh; `y` is the bottom). A box's local x runs along the board's normal, its local z along the face. */
export function wallSolids(boards: WallBoards = WALL_BOARDS): Box[] {
  const { base, h, w, width } = LABS.board;
  const raised = panels(boards).map(({ b }) => ({ x: b.center.x, y: base, z: b.center.z, w, h: h - base, d: width, yaw: b.yaw + Math.PI / 2 }));
  const posts = wallPosts().map((p) => ({ x: p.center.x, y: 0, z: p.center.z, w: p.across, h: base, d: p.along, yaw: p.yaw + Math.PI / 2 }));
  return [...raised, ...posts];
}

/** Corner of a box (roof/solids.ts convention: local x turns to (cos yaw, -sin yaw), local z to (sin yaw, cos yaw)); `sy` -1 is the bottom. */
function corner(b: Box, sx: number, sy: number, sz: number): [number, number, number] {
  const lx = (sx * b.w) / 2;
  const lz = (sz * b.d) / 2;
  const c = Math.cos(b.yaw ?? 0);
  const s = Math.sin(b.yaw ?? 0);
  return [b.x + lx * c + lz * s, b.y + ((sy + 1) / 2) * b.h, b.z - lx * s + lz * c];
}

const BOX_CORNERS = [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1], [-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1]] as const;
const BOX_EDGES = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]] as const;

/** The 12 edges of a box; the last four are the vertical ones. */
function boxEdges(b: Box): WallLine["seg"][] {
  const c = BOX_CORNERS.map(([x, y, z]) => corner(b, x, y, z));
  return BOX_EDGES.map(([a, e]) => [...c[a], ...c[e]]);
}

/** Each board's 12 rim edges and a title underline on both faces in its wing tint, and each post's four vertical edges in the tint of the board above it (one line batch). */
export function wallLines(boards: WallBoards = WALL_BOARDS): WallLine[] {
  const out: WallLine[] = [];
  const { underline } = panelRows();
  const half = textWidth() / 2;
  const solids = wallSolids(boards);
  panels(boards).forEach(({ wing, b }, i) => {
    const color = WING_TINT[wing];
    for (const seg of boxEdges(solids[i])) out.push({ seg, color });
    for (const { origin: o, along: a } of faces(b)) out.push({ seg: [o.x - a.x * half, underline, o.z - a.z * half, o.x + a.x * half, underline, o.z + a.z * half], color });
  });
  const posts = wallPosts();
  posts.forEach((post, i) => {
    const color = WING_TINT[post.wing];
    for (const seg of boxEdges(solids[solids.length - posts.length + i]).slice(8)) out.push({ seg, color });
  });
  return out;
}

/** Every text of the boards, both faces of every board (one BatchedText). Wing names come from `labels.wings`, never literals. */
export function wallLabels(pods: readonly LabPod[], labels: DirectoryLabels, fonts: DirectoryFonts, size: WallSize = "full", boards: WallBoards = WALL_BOARDS): BatchedLabel[] {
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
    for (const face of faces(b)) {
      const at = (u: number, y: number): [number, number, number] => [face.origin.x + face.along.x * u, y, face.origin.z + face.along.z * u];
      out.push(
        { text: title.lines.join("\n"), position: at(0, rows.titleTop), yaw: face.yaw, font: fonts.monoBold, fontSize: title.size, color, anchorX: "center", anchorY: "top", textAlign: "center", lineHeight: PANEL.title.lineHeight },
        { text: sub, position: at(0, rows.subTop), yaw: face.yaw, font: fonts.mono, fontSize: PANEL.sub.size, color: INK.sub, anchorX: "center", anchorY: "top", textAlign: "center" },
        { text: list.text, position: at(-width / 2, rows.listTop), yaw: face.yaw, font: fonts.sansBold, fontSize: style.size, color: INK.list, anchorX: "left", anchorY: "top", textAlign: "left", lineHeight: style.lineHeight },
        { text: footer, position: at(0, LABS.board.base + PANEL.footer.y), yaw: face.yaw, font: fonts.monoBold, fontSize: PANEL.footer.size, color, anchorX: "center", anchorY: "bottom", textAlign: "center" },
      );
    }
  }
  return out.filter((l) => l.text.trim().length > 0);
}
