import { kioskRect, LOBBY } from "../../config";
import { ROVER_MARK_3D, roverMarkExtent } from "./roverMark3d";

/**
 * Curved certification wall: badges on an arc around the plaza center, each facing it. Two rows of
 * up to six (12 per page), issuer tabs above, a pager below once a tab holds more than a page. The
 * panel sizes to its content, so a few certifications do not leave it half empty.
 */
export const CERT_WALL = {
  /** Badge plane radius from the hologram center; the panel sits `inset` behind it. */
  radius: 19.6,
  inset: 0.35,
  badge: { w: 1.9, h: 1.5 },
  gap: { x: 0.3, y: 0.28 },
  cols: 6,
  rows: 2,
  /** Center height of the top badge row, the tab row and the pager. */
  rowTop: 3.95,
  tabsY: 5.2,
  tab: { h: 0.5, gap: 0.2, font: 0.19, pad: 0.55 },
  pagerY: 1.05,
  /** Panel band heights and its angular margin past the outermost badge or tab. */
  panel: { y0: 0.55, y1: 5.7, margin: 0.06 },
  titleY: 6.05,
} as const;
export const CERT_PAGE_SIZE = CERT_WALL.cols * CERT_WALL.rows;
/** JetBrains Mono advance (0.6 em) plus the tab tracking (0.08 em). */
const TAB_ADVANCE = 0.68;

export type Vec3 = [number, number, number];

/** Point on a circle around the plaza center at angle `a` (0 points east, +a turns toward +z). */
export function arcPoint(radius: number, a: number, y: number): Vec3 {
  return [LOBBY.hologram.x + radius * Math.cos(a), y, LOBBY.hologram.z + radius * Math.sin(a)];
}

/** Y rotation that turns a plane's +z toward the plaza center from angle `a`; its +x then points along +a. */
export function faceYaw(a: number): number {
  return Math.atan2(-Math.cos(a), -Math.sin(a));
}

export interface CertSlot {
  index: number;
  row: number;
  col: number;
  a: number;
  y: number;
}

const COL_PITCH = (CERT_WALL.badge.w + CERT_WALL.gap.x) / CERT_WALL.radius;

/** Badge slots for `n` badges (at most a page): columns sized to content, filled row by row, left to right. */
export function certSlots(n: number): CertSlot[] {
  const count = Math.max(0, Math.min(n, CERT_PAGE_SIZE));
  const cols = Math.min(CERT_WALL.cols, Math.ceil(count / CERT_WALL.rows));
  return Array.from({ length: count }, (_, index) => {
    const row = Math.floor(index / cols);
    const col = index % cols;
    return { index, row, col, a: (col - (cols - 1) / 2) * COL_PITCH, y: CERT_WALL.rowTop - row * (CERT_WALL.badge.h + CERT_WALL.gap.y) };
  });
}

export interface CertPage {
  page: number;
  pages: number;
  start: number;
  end: number;
}

export function certPage(total: number, page: number): CertPage {
  const pages = Math.max(1, Math.ceil(total / CERT_PAGE_SIZE));
  const p = ((Math.trunc(page) % pages) + pages) % pages;
  return { page: p, pages, start: p * CERT_PAGE_SIZE, end: Math.min(total, (p + 1) * CERT_PAGE_SIZE) };
}

export const tabWidth = (label: string) => CERT_WALL.tab.pad * 2 + label.length * CERT_WALL.tab.font * TAB_ADVANCE;

/** Tab centers (angles) along the arc, centered on the wall axis. */
export function tabAngles(labels: readonly string[]): { a: number; w: number }[] {
  const widths = labels.map(tabWidth);
  const total = widths.reduce((sum, w) => sum + w, 0) + CERT_WALL.tab.gap * Math.max(0, widths.length - 1);
  let at = -total / 2;
  return widths.map((w) => {
    const center = at + w / 2;
    at += w + CERT_WALL.tab.gap;
    return { a: center / CERT_WALL.radius, w };
  });
}

/** Half angle of the panel: the widest of the badge columns and the tab row, plus a margin. */
export function certPanelHalf(slotCount: number, labels: readonly string[]): number {
  const slots = certSlots(slotCount);
  const badgeHalf = slots.length ? Math.max(...slots.map((s) => Math.abs(s.a))) + CERT_WALL.badge.w / 2 / CERT_WALL.radius : 0;
  const tabs = tabAngles(labels);
  const tabHalf = tabs.length ? Math.max(...tabs.map((t) => Math.abs(t.a) + t.w / 2 / CERT_WALL.radius)) : 0;
  return Math.max(badgeHalf, tabHalf, 3 * COL_PITCH / 2) + CERT_WALL.panel.margin;
}

/** Widest possible panel (a full page and five long tabs); the floor footprint must contain it. */
export const CERT_PANEL_MAX_HALF = certPanelHalf(CERT_PAGE_SIZE, ["ALL 99", "MICROSOFT 99", "GITHUB 99", "AWS 99", "OTHER 99"]);
/** Skills wall text block (wall-local units): item font size, line height factor, logo size, heading size and line height. */
export const SKILLS_TEXT = { itemSize: 0.4, itemLine: 1.15, icon: 0.4, iconGap: 0.55, labelSize: 0.46, labelLine: 1.15, labelTracking: 0.08 } as const;
/**
 * Padding inside each cell (0.6 u lets Azure and Data science split in a 10 u cell), gap above the headings, below them,
 * between the two rows, and under the last row (the plinth lip hides about 1.5 u from the stop camera).
 */
export const SKILLS_PAD = { column: 0.6, top: 0.35, belowLabel: 0.4, rowGap: 0.35, bottom: 1.9 } as const;
/** Every skill group, 4 across by 2 down in `SKILLS_WALL_ORDER` (owner, 2026-10-17: all groups, under one storey). */
export const SKILLS_GRID = { columns: 4, rows: 2 } as const;
/** Wall title above the wall: gap, font size and troika's normal line height. */
export const SKILLS_TITLE = { gap: 0.3, size: 0.42, line: 1.2 } as const;
/**
 * A group with more items than `over` splits into two sub-columns (first half left), `gap` u apart. Split cells in one
 * grid column share the second sub-column's edge: the cell middle, or the nearest edge where all their items fit.
 */
export const SKILLS_SPLIT = { over: 6, gap: 0.2 } as const;
/** Inter averages about 0.5 em per glyph: a fit estimate for item lines. */
const SANS_ADVANCE = 0.5;
/** JetBrains Mono advances 0.6 em per glyph; tracking adds to it. */
const MONO_ADVANCE = 0.6;

/** Line count of `text` word-wrapped at `maxChars` characters per line. */
export function wrapCount(text: string, maxChars: number): number {
  let lines = 1;
  let used = 0;
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const need = used === 0 ? word.length : used + 1 + word.length;
    if (need <= maxChars || used === 0) used = need;
    else {
      lines += 1;
      used = word.length;
    }
  }
  return lines;
}

/** Floor-local top of the wall's title for a wall `h` tall (on its plinth): it must stay under the next storey. */
export function skillsWallTop(h: number): number {
  return LOBBY.skillsWall.plinth + h + SKILLS_TITLE.gap + SKILLS_TITLE.size * SKILLS_TITLE.line;
}

/** Estimated width of one item line: the logo slot plus the text. */
export function skillItemWidth(item: string): number {
  return SKILLS_TEXT.iconGap + item.length * SKILLS_TEXT.itemSize * SANS_ADVANCE;
}

export interface SkillsColumn {
  /** Left edge of the sub-column (its logo column), wall-local x. */
  x: number;
  /** Width of the sub-column's slot. */
  width: number;
  /** Index of the first item (and logo) in the group. */
  start: number;
  items: string[];
}

export interface SkillsCell {
  /** Left edge of the cell's text, wall-local x. */
  left: number;
  /** Distance from the wall top to the cell's heading. */
  top: number;
  /** Item lines in the tallest sub-column. */
  lines: number;
  /** One sub-column, or two for a long group whose items fit half a cell. */
  columns: SkillsColumn[];
}

export interface SkillsWallLayout {
  /** Wall height: the grid rows plus the gaps and the bottom padding. */
  h: number;
  /** Cell width (wall width / columns). */
  column: number;
  textWidth: number;
  /** Heading lines reserved in every cell (the longest heading wraps, all items start level). */
  labelLines: number;
  /** Distance from a cell's top to its first item line. */
  itemTop: number;
  /** Height of each grid row: the heading plus its tallest cell's lines. */
  rowHeights: number[];
  cells: SkillsCell[];
}

/** Where a long group's second sub-column may start (offset from the cell's text left) so both halves fit, or null. */
function splitRange(items: readonly string[], textWidth: number): { lo: number; hi: number } | null {
  if (items.length <= SKILLS_SPLIT.over) return null;
  const half = Math.ceil(items.length / 2);
  const lo = Math.max(...items.slice(0, half).map(skillItemWidth)) + SKILLS_SPLIT.gap;
  const hi = textWidth - Math.max(...items.slice(half).map(skillItemWidth));
  return lo <= hi ? { lo, hi } : null;
}

/** Second sub-column offset for each grid column: the middle, clamped so every splittable cell in it fits. */
function splitOffsets(groups: readonly { items: readonly string[] }[], columns: number, textWidth: number): number[] {
  const middle = textWidth / 2 + SKILLS_SPLIT.gap / 2;
  return Array.from({ length: columns }, (_, c) => {
    const ranges = groups.flatMap((g, i) => (i % columns === c ? [splitRange(g.items, textWidth)] : [])).filter((r) => r !== null);
    if (!ranges.length) return middle;
    const lo = Math.max(...ranges.map((r) => r.lo));
    const hi = Math.min(...ranges.map((r) => r.hi));
    return lo <= hi ? Math.min(Math.max(middle, lo), hi) : middle;
  });
}

function skillColumns(items: readonly string[], left: number, textWidth: number, offset: number): SkillsColumn[] {
  const range = splitRange(items, textWidth);
  if (!range || offset < range.lo || offset > range.hi) return [{ x: left, width: textWidth, start: 0, items: [...items] }];
  const half = Math.ceil(items.length / 2);
  return [
    { x: left, width: offset - SKILLS_SPLIT.gap, start: 0, items: items.slice(0, half) },
    { x: left + offset, width: textWidth - offset, start: half, items: items.slice(half) },
  ];
}

/** Measured skills wall: a grid of cells with level headings; every item shows, long groups in two sub-columns. */
export function skillsWallLayout(groups: readonly { label: string; items: readonly string[] }[]): SkillsWallLayout {
  const T = SKILLS_TEXT;
  const { columns } = SKILLS_GRID;
  const line = T.itemSize * T.itemLine;
  const column = LOBBY.skillsWall.w / columns;
  const textWidth = column - 2 * SKILLS_PAD.column;
  const maxChars = Math.floor(textWidth / (T.labelSize * (MONO_ADVANCE + T.labelTracking)));
  const labelLines = Math.max(1, ...groups.map((g) => wrapCount(g.label.toUpperCase(), maxChars)));
  const itemTop = SKILLS_PAD.top + labelLines * T.labelSize * T.labelLine + SKILLS_PAD.belowLabel;
  const offsets = splitOffsets(groups, columns, textWidth);
  const cells = groups.map((g, i): SkillsCell => {
    const cols = skillColumns(g.items, -LOBBY.skillsWall.w / 2 + (i % columns) * column + SKILLS_PAD.column, textWidth, offsets[i % columns]);
    return { left: cols[0].x, top: 0, lines: Math.max(...cols.map((c) => c.items.length)), columns: cols };
  });
  const rowHeights: number[] = [];
  for (let r = 0; r * columns < cells.length; r++) {
    rowHeights.push(itemTop + Math.max(...cells.slice(r * columns, (r + 1) * columns).map((c) => c.lines)) * line);
  }
  let top = 0;
  for (const [r, rh] of rowHeights.entries()) {
    for (const c of cells.slice(r * columns, (r + 1) * columns)) c.top = top;
    top += rh + SKILLS_PAD.rowGap;
  }
  const h = rowHeights.reduce((sum, rh) => sum + rh, 0) + Math.max(0, rowHeights.length - 1) * SKILLS_PAD.rowGap + SKILLS_PAD.bottom;
  return { h: Math.round(h * 100) / 100, column, textWidth, labelLines, itemTop, rowHeights, cells };
}

/** The rover mark on the hologram pedestal (floors/lobby/roverMark3d.ts): head center height, swept radius and top at rest. */
const MARK_EXTENT = roverMarkExtent();
export const HOLOGRAM = { y: ROVER_MARK_3D.y, radius: MARK_EXTENT.radius, top: MARK_EXTENT.top } as const;
/** Half of the name/headline text block width (Text maxWidth 14). */
const TITLE_HALF_WIDTH = 7;
/** Troika's "normal" line height is about 1.2 em. */
const TITLE_LINE = 1.2;
/** Height of the name's top (the headline hangs below `LOBBY.titleY`). */
export const TITLE_TOP = LOBBY.titleY + LOBBY.titleFont.name * TITLE_LINE;
const TITLE_BOTTOM = LOBBY.titleY - LOBBY.titleFont.gap - LOBBY.titleFont.headline * TITLE_LINE;
const BOB = 0.15;

export interface Box {
  name: string;
  min: [number, number, number];
  max: [number, number, number];
}

const box = (name: string, cx: number, cz: number, hw: number, hd: number, y0: number, y1: number): Box => ({
  name,
  min: [cx - hw, y0, cz - hd],
  max: [cx + hw, y1, cz + hd],
});

/**
 * World-space bounds of every Lobby element (floor-local), for the layout test and future
 * placement checks. Billboarded tiles and the title use their full width in x and z because they
 * can face any direction while the camera orbits. `ringTurn` rotates the stats ring.
 */
export function lobbyElements(statCount: number, ringTurn = 0): Box[] {
  const { hologram: h, statsTile: t, skillsWall: sw, certWall: cw, kiosk: k, observatory: o } = LOBBY;
  const kb = kioskRect();
  const out: Box[] = [
    box("pedestal", h.x, h.z, h.radius + 0.2, h.radius + 0.2, 0, 0.62),
    box("rover-mark", h.x, h.z, HOLOGRAM.radius, HOLOGRAM.radius, 0.62, HOLOGRAM.top + BOB),
    box("title", h.x, h.z, TITLE_HALF_WIDTH, TITLE_HALF_WIDTH, TITLE_BOTTOM, TITLE_TOP),
    // The skills wall title floats 0.3 u above the wall.
    box("skills-wall", sw.x, sw.z, sw.w / 2, sw.d / 2 + 0.05, 0, sw.h + 0.8),
    // The curved wall's footprint (config) holds the widest panel: see the cert wall layout test.
    box("cert-wall", cw.x, cw.z, cw.w / 2, cw.d / 2, 0, cw.h + 0.8),
    // Body, stand and the screen centered above them, turned to face the hologram (floors/lobby/kiosk.ts): the
    // axis-aligned bounds of the turned footprint, grown by the 0.3 u the tilt leans the screen.
    box("kiosk", k.x, k.z, (kb.maxX - kb.minX) / 2 + 0.3, (kb.maxZ - kb.minZ) / 2 + 0.3, 0, 3.4),
    // Visitor Observatory (L1:visits): the plinth, the globe and the floating panel inside its footprint.
    box("observatory", (o.minX + o.maxX) / 2, (o.minZ + o.maxZ) / 2, (o.maxX - o.minX) / 2, (o.maxZ - o.minZ) / 2, 0, o.h),
    box("elevator-door", -24, 0, 1, 1.6, 0, 3.2),
  ];
  for (let i = 0; i < statCount; i++) {
    const a = (i / statCount) * Math.PI * 2 + Math.PI / 4 + ringTurn;
    const y = t.y + (i % 2) * t.stagger;
    out.push(
      box(
        `tile-${i}`,
        h.x + Math.sin(a) * LOBBY.statsRadius,
        h.z + Math.cos(a) * LOBBY.statsRadius,
        t.w / 2,
        t.w / 2,
        y - t.h / 2 - BOB,
        y + t.h / 2 + BOB,
      ),
    );
  }
  return out;
}

export function boxesOverlap(a: Box, b: Box): boolean {
  return [0, 1, 2].every((i) => a.min[i] < b.max[i] && b.min[i] < a.max[i]);
}

/** Closest and farthest horizontal distance from the plaza center to a box. */
export function radialSpan(b: Box): { near: number; far: number } {
  const { x, z } = LOBBY.hologram;
  const dx = Math.max(b.min[0] - x, 0, x - b.max[0]);
  const dz = Math.max(b.min[2] - z, 0, z - b.max[2]);
  const fx = Math.max(Math.abs(b.min[0] - x), Math.abs(b.max[0] - x));
  const fz = Math.max(Math.abs(b.min[2] - z), Math.abs(b.max[2] - z));
  return { near: Math.hypot(dx, dz), far: Math.hypot(fx, fz) };
}
