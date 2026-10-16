import type { Architecture } from "@/content/schema";
import { interWidth } from "@/experience/fx/interWidth";

/**
 * Build-time architecture diagram layout (pure, no DOM): nodes on the authored `layer` x `row` grid, orthogonal
 * edges with their own channels, labels on each edge's last segment. Coordinates are computed on an abstract
 * main axis `u` (along layers) and cross axis `v` (along rows), then mapped to x/y for the direction.
 */

export type DiagramNode = Architecture["nodes"][number];
export type DiagramKind = DiagramNode["kind"];
export type Point = readonly [number, number];

export interface DiagramText {
  kind: string;
  label: string;
  sublabel?: string;
}

export interface DiagramPreset {
  /** `right`: layers left to right. `down`: layers top to bottom. */
  direction: "right" | "down";
  kindSize: number;
  labelSize: number;
  subSize: number;
  edgeSize: number;
  /** Node width: the cap for `right` (fit to content), the fixed cell width for `down`. */
  nodeWidth: number;
  /** Most nodes side by side in one band (`down` only); a fuller layer wraps into extra bands. */
  perBand: number;
  edgeLabelWidth: number;
  /** Widest drawing at scale 1 (`down` only): the node width shrinks until the layout fits. */
  maxWidth?: number;
}

export const DIAGRAM_PRESETS = {
  /** Desktop, left to right. */
  wide: { direction: "right", kindSize: 10.5, labelSize: 13, subSize: 11.5, edgeSize: 11, nodeWidth: 140, perBand: 99, edgeLabelWidth: 84 },
  /** Desktop column, top to bottom, up to three nodes per band. */
  column: { direction: "down", kindSize: 10.5, labelSize: 13.5, subSize: 12, edgeSize: 11.5, nodeWidth: 184, perBand: 3, edgeLabelWidth: 150 },
  /** Phones, top to bottom, two nodes per band, every text at least 12 px at scale 1. */
  phone: { direction: "down", kindSize: 12, labelSize: 14, subSize: 12, edgeSize: 12, nodeWidth: 147, perBand: 2, edgeLabelWidth: 80, maxWidth: 318 },
} as const satisfies Record<string, DiagramPreset>;

export interface LaidNode {
  id: string;
  kind: DiagramKind;
  x: number;
  y: number;
  w: number;
  h: number;
  kindLabel: string;
  label: string[];
  sublabel: string[];
}

export interface LaidEdge {
  points: Point[];
  async: boolean;
  /** Arrowhead direction at the last point (unit vector). */
  head: Point;
  label?: { x: number; y: number; w: number; h: number; lines: string[] };
}

export interface LaidGroup {
  label: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DiagramLayout {
  preset: DiagramPreset;
  width: number;
  height: number;
  nodes: LaidNode[];
  edges: LaidEdge[];
  groups: LaidGroup[];
}

export const PAD = 10;
export const LINE_GAP = 4;
const MARGIN = 8;
const CROSS_GAP = 18;
const CHANNEL = 10;
const LABEL_PAD = 6;
const MIN_GAP = 40;
export const GROUP_PAD = 6;
/** Inter at 600 runs about 4% wider than the 400 advances. */
const BOLD = 1.04;
/** JetBrains Mono advance (0.6 em) plus the label's 0.06 em tracking. */
const MONO = 0.66;

export const textWidth = (text: string, size: number, bold = false) => interWidth(text) * size * (bold ? BOLD : 1);
export const monoWidth = (text: string, size: number) => text.length * size * MONO;
export const lineHeight = (size: number) => size + LINE_GAP;

/** Greedy word wrap by measured width; a word longer than the line keeps its own line. */
export function wrapText(text: string, max: number, size: number, bold = false): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && textWidth(next, size, bold) > max) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

interface Box {
  id: string;
  kind: DiagramKind;
  kindLabel: string;
  label: string[];
  sublabel: string[];
  /** Content size before the grid stretches it. */
  w: number;
  h: number;
  band: number;
  slot: number;
  /** Abstract placement, filled in by the grid. */
  u0: number;
  u1: number;
  v0: number;
  v1: number;
}

function measure(node: DiagramNode, text: DiagramText, p: DiagramPreset): Omit<Box, "band" | "slot" | "u0" | "u1" | "v0" | "v1"> {
  const inner = p.nodeWidth - 2 * PAD;
  const label = wrapText(text.label, inner, p.labelSize, true);
  const sublabel = text.sublabel ? wrapText(text.sublabel, inner, p.subSize) : [];
  const widest = Math.max(
    monoWidth(text.kind, p.kindSize),
    ...label.map((l) => textWidth(l, p.labelSize, true)),
    ...sublabel.map((l) => textWidth(l, p.subSize)),
  );
  const w = p.direction === "down" ? p.nodeWidth : Math.min(p.nodeWidth, Math.ceil(widest + 2 * PAD));
  const h = Math.ceil(
    2 * PAD +
      p.kindSize +
      6 +
      label.length * lineHeight(p.labelSize) -
      LINE_GAP +
      (sublabel.length ? 4 + sublabel.length * lineHeight(p.subSize) - LINE_GAP : 0),
  );
  return { id: node.id, kind: node.kind, kindLabel: text.kind, label, sublabel, w, h };
}

/** Bands (main axis) and slots (cross axis) for every node. `right` keeps the authored grid; `down` packs each layer. */
export function assignGrid(arch: Architecture, p: DiagramPreset): Map<string, { band: number; slot: number }> {
  const out = new Map<string, { band: number; slot: number }>();
  const layers = [...new Set(arch.nodes.map((n) => n.layer))].sort((a, b) => a - b);
  if (p.direction === "right") {
    layers.forEach((layer, band) => {
      for (const n of arch.nodes.filter((x) => x.layer === layer)) out.set(n.id, { band, slot: n.row });
    });
    return out;
  }
  let band = 0;
  for (const layer of layers) {
    const nodes = arch.nodes.filter((n) => n.layer === layer).sort((a, b) => a.row - b.row);
    for (let i = 0; i < nodes.length; i += p.perBand) {
      const chunk = nodes.slice(i, i + p.perBand);
      const offset = (p.perBand - chunk.length) / 2;
      chunk.forEach((n, j) => out.set(n.id, { band, slot: offset + j }));
      band++;
    }
  }
  return out;
}

interface Route {
  edge: number;
  from: Box;
  to: Box;
  async: boolean;
  label: string[];
  /** Label extent along u and v. */
  lu: number;
  lv: number;
  vs: number;
  vt: number;
  kind: "straight" | "elbow" | "lane" | "back" | "side";
  lane?: number;
  /** True when the edge runs against the layer order (to an earlier band). */
  up: boolean;
  /** Gap indexes of the channels, source side first (`elbow`: one, `lane`: two). */
  gaps: number[];
  channels: Map<number, number>;
}

/**
 * Lays out one direction. `texts` resolves each node's localized kind, label and sublabel; edge labels stay
 * as written (they are technical terms, like the case-study data flow).
 */
export function layoutArchitecture(arch: Architecture, texts: (node: DiagramNode) => DiagramText, preset: DiagramPreset): DiagramLayout {
  let layout = layoutOnce(arch, texts, preset);
  for (let i = 0; i < 4 && preset.maxWidth && layout.width > preset.maxWidth; i++) {
    const nodeWidth = layout.preset.nodeWidth - Math.ceil((layout.width - preset.maxWidth) / preset.perBand);
    layout = layoutOnce(arch, texts, { ...preset, nodeWidth });
  }
  return layout;
}

function layoutOnce(arch: Architecture, texts: (node: DiagramNode) => DiagramText, preset: DiagramPreset): DiagramLayout {
  const p = preset;
  const right = p.direction === "right";
  const grid = assignGrid(arch, p);
  const boxes = new Map<string, Box>();
  for (const n of arch.nodes) {
    const m = measure(n, texts(n), p);
    const g = grid.get(n.id)!;
    boxes.set(n.id, { ...m, ...g, u0: 0, u1: 0, v0: 0, v1: 0 });
  }
  const all = [...boxes.values()];
  const su = (b: Box) => (right ? b.w : b.h);
  const sv = (b: Box) => (right ? b.h : b.w);
  const bands = Math.max(...all.map((b) => b.band)) + 1;

  // Band thickness along u, cell size along v.
  const thick = Array.from({ length: bands }, (_, i) => Math.max(...all.filter((b) => b.band === i).map(su)));
  const slots = right ? Math.max(...all.map((b) => b.slot)) + 1 : p.perBand;
  const cell = right
    ? Array.from({ length: slots }, (_, s) => Math.max(0, ...all.filter((b) => b.slot === s).map(sv)))
    : Array.from({ length: slots }, () => p.nodeWidth);
  // A labeled edge between neighbours in one band needs a wider cross gap for its label.
  const labelExtent = (text?: string) => {
    const lines = text ? wrapText(text, p.edgeLabelWidth, p.edgeSize) : [];
    if (!lines.length) return 0;
    return right ? lines.length * lineHeight(p.edgeSize) + 2 : Math.ceil(Math.max(...lines.map((l) => textWidth(l, p.edgeSize))) + 8);
  };
  const extraGap = new Map<string, number>();
  for (const e of arch.edges) {
    const a = boxes.get(e.from)!;
    const b = boxes.get(e.to)!;
    if (a.band !== b.band || !e.label) continue;
    const [lo, hi] = a.slot < b.slot ? [a.slot, b.slot] : [b.slot, a.slot];
    if (all.some((x) => x.band === a.band && x.slot > lo && x.slot < hi)) continue;
    const key = right ? `*:${lo}` : `${a.band}:${lo}`;
    extraGap.set(key, Math.max(extraGap.get(key) ?? 0, labelExtent(e.label) + 2 * LABEL_PAD - CROSS_GAP));
  }
  const cellStart: number[] = [];
  {
    let v = MARGIN;
    for (let s = 0; s < slots; s++) {
      cellStart.push(v);
      v += cell[s] + (cell[s] > 0 ? CROSS_GAP + Math.max(0, extraGap.get(`*:${s}`) ?? 0) : 0);
    }
  }
  const vOf = (slot: number, band: number) => {
    if (right) return cellStart[slot];
    let extra = 0;
    for (const [key, gap] of extraGap) {
      const [kb, ks] = key.split(":");
      if (Number(kb) === band && Number(ks) < slot) extra += Math.max(0, gap);
    }
    return MARGIN + slot * (p.nodeWidth + CROSS_GAP) + extra;
  };
  const cellOf = (slot: number) => (right ? cell[slot] : p.nodeWidth);
  for (const b of all) {
    b.v0 = vOf(b.slot, b.band);
    b.v1 = b.v0 + cellOf(b.slot);
  }
  const crossEnd = Math.max(...all.map((b) => b.v1));

  // Edge routes on the cross axis first; channels and labels decide the gaps.
  const labelLines = (text?: string) => (text ? wrapText(text, p.edgeLabelWidth, p.edgeSize) : []);
  const routes: Route[] = arch.edges.map((e, i) => {
    const label = labelLines(e.label);
    const lw = label.length ? Math.ceil(Math.max(...label.map((l) => textWidth(l, p.edgeSize))) + 2 * 4) : 0;
    const lh = label.length ? label.length * lineHeight(p.edgeSize) + 2 : 0;
    const from = boxes.get(e.from)!;
    const to = boxes.get(e.to)!;
    return {
      edge: i,
      from,
      to,
      async: Boolean(e.async),
      label,
      lu: right ? lw : lh,
      lv: right ? lh : lw,
      vs: 0,
      vt: 0,
      kind: to.band !== from.band ? "elbow" : "back",
      up: to.band < from.band,
      gaps: [],
      channels: new Map(),
    };
  });

  // Ports: every edge end on a box side is spread along it, ordered by the other end. Forward edges leave the
  // far side and enter the near side; edges against the layer order leave the near side and enter the far side.
  const center = (b: Box) => (b.v0 + b.v1) / 2;
  type End = { r: Route; out: boolean };
  for (const b of all) {
    for (const far of [true, false]) {
      const ends: End[] = [
        ...routes.filter((r) => r.kind !== "back" && r.from === b && r.up !== far).map((r) => ({ r, out: true })),
        ...routes.filter((r) => r.kind !== "back" && r.to === b && r.up === far).map((r) => ({ r, out: false })),
      ];
      ends
        .sort((x, y) => center(x.out ? x.r.to : x.r.from) - center(y.out ? y.r.to : y.r.from))
        .forEach((e, k) => {
          const v = b.v0 + ((b.v1 - b.v0) * (k + 1)) / (ends.length + 1);
          if (e.out) e.r.vs = v;
          else e.r.vt = v;
        });
    }
  }
  const adjacent = (r: Route) => Math.abs(r.to.band - r.from.band) === 1;
  // A port pair that lines up becomes one straight line; so does a pair whose boxes overlap across.
  for (const r of routes) {
    if (r.kind === "back" || !adjacent(r)) continue;
    if (Math.abs(r.vs - r.vt) < 1) r.kind = "straight";
    else if (r.vt > r.from.v0 + 4 && r.vt < r.from.v1 - 4 && r.vs > r.to.v0 + 4 && r.vs < r.to.v1 - 4) {
      const v = (Math.max(r.from.v0, r.to.v0) + Math.min(r.from.v1, r.to.v1)) / 2;
      r.vs = v;
      r.vt = v;
      r.kind = "straight";
    }
  }
  const blocked = (v: number, a: number, b: number) =>
    all.some((x) => x.band > Math.min(a, b) && x.band < Math.max(a, b) && v > x.v0 - 4 && v < x.v1 + 4);
  // Lanes run between cells or past the far cross side; a lane is used only where no node blocks it.
  const outer = crossEnd + CROSS_GAP / 2;
  const laneVs: number[] = [outer];
  for (let s = 0; s < slots - 1; s++) if (cellOf(s) > 0) laneVs.push(vOf(s, -1) + cellOf(s) + CROSS_GAP / 2);
  const laneUse = new Map<number, number>();
  const nearSource = (r: Route) => (r.up ? r.from.band - 1 : r.from.band);
  const nearTarget = (r: Route) => (r.up ? r.to.band : r.to.band - 1);
  for (const r of routes) {
    if (r.kind === "straight") r.gaps = [];
    if (r.kind !== "elbow") continue;
    if (adjacent(r)) r.gaps = [Math.min(r.from.band, r.to.band)];
    else if (!blocked(r.vs, r.from.band, r.to.band)) r.gaps = [nearTarget(r)];
    else if (!blocked(r.vt, r.from.band, r.to.band)) r.gaps = [nearSource(r)];
    else {
      r.kind = "lane";
      const base = laneVs
        .filter((v) => !blocked(v, r.from.band, r.to.band))
        .sort((a, b) => Math.abs(a - r.vt) - Math.abs(b - r.vt))[0];
      // A lane taken again moves one channel over: outward past the far side, alternating inside a cross gap.
      const k = laneUse.get(base) ?? 0;
      laneUse.set(base, k + 1);
      r.lane = base === outer ? base + k * CHANNEL : base + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (CHANNEL / 2);
      r.gaps = [nearSource(r), nearTarget(r)];
    }
  }
  // Neighbours in one band connect side to side when no node sits between them.
  for (const r of routes) {
    if (r.kind !== "back" || r.from.band !== r.to.band) continue;
    const [lo, hi] = r.from.v0 < r.to.v0 ? [r.from.v1, r.to.v0] : [r.to.v1, r.from.v0];
    if (!all.some((b) => b.band === r.from.band && b !== r.from && b !== r.to && b.v0 < hi && b.v1 > lo)) r.kind = "side";
  }
  // Backward edges run on outer lanes past the far cross side.
  const back = routes.filter((r) => r.kind === "back");
  const outerUse = laneUse.get(outer) ?? 0;
  const outerEnd = outer + Math.max(0, outerUse - 1) * CHANNEL;
  const backStart = outerUse ? outerEnd + CHANNEL : crossEnd + CROSS_GAP;
  back.forEach((r, k) => (r.lane = backStart + k * (CHANNEL + Math.max(0, ...back.map((x) => x.lv)) / 2)));
  const crossTotal = Math.max(crossEnd, outerUse ? outerEnd + 2 : 0, ...back.map((r) => r.lane! + r.lv / 2)) + MARGIN;

  // Gap sizes: channels near the source band, then room for the labels that end in the gap.
  const gapChannels = Array.from({ length: Math.max(0, bands - 1) }, () => [] as Route[]);
  for (const r of routes) for (const g of r.gaps) gapChannels[g].push(r);
  const gapSize = gapChannels.map((list, g) => {
    const channels = list.length * CHANNEL;
    const labels = routes.filter(
      (r) =>
        r.label.length &&
        r.kind !== "back" &&
        r.kind !== "side" &&
        (r.kind === "straight" ? Math.min(r.from.band, r.to.band) === g : r.gaps[r.gaps.length - 1] === g),
    );
    const need = Math.max(0, ...labels.map((r) => r.lu));
    return Math.max(MIN_GAP, channels + (need ? need + 3 * LABEL_PAD : 2 * LABEL_PAD) + CHANNEL);
  });
  const bandStart: number[] = [];
  {
    let u = MARGIN;
    for (let i = 0; i < bands; i++) {
      bandStart.push(u);
      u += thick[i] + (i < bands - 1 ? gapSize[i] : 0);
    }
  }
  const mainTotal = bandStart[bands - 1] + thick[bands - 1] + MARGIN;
  for (const b of all) {
    b.u0 = bandStart[b.band];
    b.u1 = b.u0 + thick[b.band];
  }
  // Channels: ordered so edges heading further along v take the outer channels (fewer crossings).
  gapChannels.forEach((list, g) => {
    const start = bandStart[g] + thick[g] + LABEL_PAD;
    [...list]
      .sort((a, b) => Math.abs(b.vt - b.vs) - Math.abs(a.vt - a.vs))
      .forEach((r, k) => r.channels.set(g, start + CHANNEL / 2 + k * CHANNEL));
  });

  const toXY = (u: number, v: number): Point => (right ? [u, v] : [v, u]);
  const placed: { u0: number; u1: number; v0: number; v1: number }[] = [];
  const fromXY = (x: number, y: number): [number, number] => (right ? [x, y] : [y, x]);
  // Group frames hug their members; each frame's name sits above its top-left corner and blocks edge labels.
  const groups: LaidGroup[] = [];
  for (const name of [...new Set(arch.nodes.flatMap((n) => (n.group ? [n.group] : [])))]) {
    const members = arch.nodes.filter((n) => n.group === name).map((n) => boxes.get(n.id)!);
    const corners = members.flatMap((m) => [toXY(m.u0, m.v0), toXY(m.u1, m.v1)]);
    const x = Math.min(...corners.map((c) => c[0])) - GROUP_PAD;
    const y = Math.min(...corners.map((c) => c[1])) - GROUP_PAD;
    const w = Math.max(...corners.map((c) => c[0])) + GROUP_PAD - x;
    const h = Math.max(...corners.map((c) => c[1])) + GROUP_PAD - y;
    groups.push({ label: name, x, y, w, h });
    const [u0, v0] = fromXY(x + 6, y - p.kindSize - 8);
    const [u1, v1] = fromXY(x + 14 + monoWidth(name, p.kindSize), y - 2);
    placed.push({ u0: Math.min(u0, u1), u1: Math.max(u0, u1), v0: Math.min(v0, v1), v1: Math.max(v0, v1) });
  }
  let routeLines: [number, number][][] = [];
  /** True when a label box would sit on another edge's line (it would read as that edge's label). */
  const crossesLine = (b: { u0: number; u1: number; v0: number; v1: number }, own: number) =>
    routeLines.some(
      (line, i) =>
        i !== own &&
        line.slice(1).some(([ub, vb], k) => {
          const [ua, va] = line[k];
          return Math.min(ua, ub) < b.u1 + 2 && Math.max(ua, ub) > b.u0 - 2 && Math.min(va, vb) < b.v1 + 2 && Math.max(va, vb) > b.v0 - 2;
        }),
    );
  const hits = (b: { u0: number; u1: number; v0: number; v1: number }) =>
    b.v0 < 1 ||
    b.v1 > crossTotal - 1 ||
    b.u0 < 1 ||
    b.u1 > mainTotal - 1 ||
    all.some((n) => b.u0 < n.u1 + 2 && b.u1 > n.u0 - 2 && b.v0 < n.v1 + 2 && b.v1 > n.v0 - 2) ||
    placed.some((o) => b.u0 < o.u1 + 2 && b.u1 > o.u0 - 2 && b.v0 < o.v1 + 2 && b.v1 > o.v0 - 2);
  /**
   * Puts a label on the edge's longest segment along the main axis (else across it), centered on the line and
   * sliding in 2 px steps; then beside the line. It never covers a node, another label or another edge's line.
   */
  const placeLabel = (r: Route, pts: [number, number][], own: number) => {
    type Seg = { along: boolean; s0: number; s1: number; at: number };
    const segs: Seg[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [ua, va] = pts[i];
      const [ub, vb] = pts[i + 1];
      if (Math.abs(va - vb) < 0.5 && Math.abs(ub - ua) > 1) segs.push({ along: true, s0: Math.min(ua, ub), s1: Math.max(ua, ub), at: va });
      else if (Math.abs(ua - ub) < 0.5 && Math.abs(vb - va) > 1) segs.push({ along: false, s0: Math.min(va, vb), s1: Math.max(va, vb), at: ua });
    }
    segs.sort((a, b) => Number(b.along) - Number(a.along) || b.s1 - b.s0 - (a.s1 - a.s0));
    const boxAt = (seg: Seg, c: number, side: number) => {
      if (seg.along) {
        const v = seg.at + side * (r.lv / 2 + 4);
        return { u0: c - r.lu / 2, u1: c + r.lu / 2, v0: v - r.lv / 2, v1: v + r.lv / 2 };
      }
      const u = seg.at + side * (r.lu / 2 + 4);
      return { u0: u - r.lu / 2, u1: u + r.lu / 2, v0: c - r.lv / 2, v1: c + r.lv / 2 };
    };
    for (const strict of [true, false]) for (const side of [0, -1, 1]) {
      for (const seg of segs) {
        const half = seg.along ? r.lu / 2 : r.lv / 2;
        const lo = seg.s0 + LABEL_PAD + half;
        const hi = seg.s1 - LABEL_PAD - half;
        const mid = (lo + hi) / 2;
        const tries = hi < lo ? [(seg.s0 + seg.s1) / 2] : [];
        for (let step = 0; hi >= lo && step <= (hi - lo) / 2 + 1; step += 2) tries.push(mid + step, mid - step);
        for (const c of tries) {
          if (hi >= lo && (c < lo - 0.01 || c > hi + 0.01)) continue;
          const box = boxAt(seg, c, side);
          if (!hits(box) && (!strict || !crossesLine(box, own))) {
            placed.push(box);
            return box;
          }
        }
      }
    }
    const seg = segs[0];
    const box = boxAt(seg, (seg.s0 + seg.s1) / 2, 0);
    placed.push(box);
    return box;
  };

  const polylines: [number, number][][] = routes.map((r) => {
    let pts: [number, number][];
    const su = r.up ? r.from.u0 : r.from.u1;
    const tu = r.up ? r.to.u1 : r.to.u0;
    if (r.kind === "straight") {
      pts = [
        [su, r.vs],
        [tu, r.vt],
      ];
    } else if (r.kind === "elbow") {
      const c = r.channels.get(r.gaps[0])!;
      pts = [
        [su, r.vs],
        [c, r.vs],
        [c, r.vt],
        [tu, r.vt],
      ];
    } else if (r.kind === "lane") {
      const c1 = r.channels.get(r.gaps[0])!;
      const c2 = r.channels.get(r.gaps[1])!;
      pts = [
        [su, r.vs],
        [c1, r.vs],
        [c1, r.lane!],
        [c2, r.lane!],
        [c2, r.vt],
        [tu, r.vt],
      ];
    } else if (r.kind === "side") {
      const uc = (Math.max(r.from.u0, r.to.u0) + Math.min(r.from.u1, r.to.u1)) / 2;
      pts = r.from.v0 < r.to.v0
        ? [
            [uc, r.from.v1],
            [uc, r.to.v0],
          ]
        : [
            [uc, r.from.v0],
            [uc, r.to.v1],
          ];
    } else {
      const sameBand = r.from.band === r.to.band;
      const su0 = sameBand ? r.from.u0 + (r.from.u1 - r.from.u0) * 0.35 : (r.from.u0 + r.from.u1) / 2;
      const tu0 = sameBand ? r.to.u0 + (r.to.u1 - r.to.u0) * 0.65 : (r.to.u0 + r.to.u1) / 2;
      pts = [
        [su0, r.from.v1],
        [su0, r.lane!],
        [tu0, r.lane!],
        [tu0, r.to.v1],
      ];
    }
    return pts;
  });
  routeLines = polylines;
  const edges: LaidEdge[] = routes.map((r, ri) => {
    const pts = polylines[ri];
    const points = pts.map(([u, v]) => toXY(u, v));
    const [a, b] = [points[points.length - 2], points[points.length - 1]];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const head: Point = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    let label: LaidEdge["label"];
    if (r.label.length) {
      const box = placeLabel(r, pts, ri);
      const [x0, y0] = toXY(box.u0, box.v0);
      const [x1, y1] = toXY(box.u1, box.v1);
      label = { x: x0, y: y0, w: x1 - x0, h: y1 - y0, lines: r.label };
    }
    return { points, async: r.async, head, label };
  });

  const nodes: LaidNode[] = all.map((b) => {
    const [x, y] = toXY(b.u0, b.v0);
    const [x1, y1] = toXY(b.u1, b.v1);
    return { id: b.id, kind: b.kind, kindLabel: b.kindLabel, label: b.label, sublabel: b.sublabel, x, y, w: x1 - x, h: y1 - y };
  });

  const [width, height] = right ? [mainTotal, crossTotal] : [crossTotal, mainTotal];
  return { preset: p, width: Math.ceil(width), height: Math.ceil(height), nodes, edges, groups };
}
