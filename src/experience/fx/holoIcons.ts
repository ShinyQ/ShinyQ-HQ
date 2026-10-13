import type { LibraryZone } from "../floors/library/model";
import type { CareerType, PadKind } from "../types";

/**
 * One source of truth for the career type icons: line art on a 24 x 24 grid (SVG coordinates,
 * y down), in the style of the HUD's stroke icons. The 3D `HoloIcon` turns the strokes into neon
 * ribbons (flat or extruded) and `TypeIcon` draws the same strokes as SVG for Page View chips and
 * legends, so both match (owner pick: the "Neon line" direction). Pure data and math: no React or three.
 */

export type Point = [number, number];
/** A polyline; `closed` joins its last point to the first. */
export interface Stroke {
  points: Point[];
  closed?: boolean;
}

const open = (...points: Point[]): Stroke => ({ points });
const shut = (...points: Point[]): Stroke => ({ points, closed: true });

/** Arc around (cx, cy) from a0 to a1 (radians, SVG orientation), as `steps` segments. */
export function arc(cx: number, cy: number, r: number, a0: number, a1: number, steps = 10): Point[] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / steps;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  });
}

export const CAREER_ICONS: Record<CareerType, Stroke[]> = {
  // Employment: briefcase with handle and clasp.
  job: [
    shut([3, 8], [21, 8], [21, 20], [3, 20]),
    open([9, 8], [9, 5], [15, 5], [15, 8]),
    open([3, 13], [10, 13]),
    open([14, 13], [21, 13]),
    shut([10, 11.5], [14, 11.5], [14, 14.5], [10, 14.5]),
  ],
  // Freelance: laptop with code brackets on the screen.
  freelance: [
    shut([5, 5], [19, 5], [19, 15], [5, 15]),
    open([5, 15], [2, 19], [22, 19], [19, 15]),
    open([10.5, 7.5], [8, 10], [10.5, 12.5]),
    open([13.5, 7.5], [16, 10], [13.5, 12.5]),
  ],
  // Education: graduation cap with tassel.
  education: [
    shut([12, 4], [23, 9], [12, 14], [1, 9]),
    open([6, 11.3], [6, 16], ...arc(12, 12.5, 7, Math.PI * 0.85, Math.PI * 0.15, 8).slice(1, -1), [18, 16], [18, 11.3]),
    open([21, 10], [21, 16]),
  ],
  // Awards: trophy cup with handles, stem and base.
  award: [
    shut([7, 4], [17, 4], [17, 9], [15.5, 12], [12, 13.5], [8.5, 12], [7, 9]),
    open([7, 6], [4, 6], [4, 8], [5.5, 10], [7.6, 10.7]),
    open([17, 6], [20, 6], [20, 8], [18.5, 10], [16.4, 10.7]),
    open([12, 13.5], [12, 17]),
    shut([9, 17], [15, 17], [16, 20.5], [8, 20.5]),
  ],
  // Milestone: pennant flag on a pole.
  milestone: [open([5, 21.5], [5, 2.5]), shut([5, 3.5], [19, 3.5], [15.5, 8], [19, 12.5], [5, 12.5]), open([2.5, 21.5], [7.5, 21.5])],
};

/** Roof station icons (RF revamp), same 24 x 24 line-art grid as the career icons. */
export type RoofIcon = "email" | "cv" | "about" | "signal";

export const ROOF_ICONS: Record<RoofIcon, Stroke[]> = {
  // Email: envelope with its flap.
  email: [shut([3, 6], [21, 6], [21, 18], [3, 18]), open([3, 6], [12, 13], [21, 6])],
  // CV: page with a folded corner and three text lines.
  cv: [shut([6, 3], [15, 3], [19, 7], [19, 21], [6, 21]), open([15, 3], [15, 7], [19, 7]), open([9, 11], [16, 11]), open([9, 14], [16, 14]), open([9, 17], [13, 17])],
  // About: head and shoulders.
  about: [shut(...arc(12, 8, 4, 0, Math.PI * 2, 12).slice(0, -1)), open(...arc(12, 21, 7, Math.PI, Math.PI * 2, 10))],
  // Signal: a mast on a tripod with two waves.
  signal: [
    open([12, 22], [12, 10]),
    open([8, 22], [12, 15], [16, 22]),
    open(...arc(12, 9, 4, -Math.PI * 0.85, -Math.PI * 0.15, 6)),
    open(...arc(12, 9, 7.5, -Math.PI * 0.85, -Math.PI * 0.15, 8)),
  ],
};

/** SVG path data for strokes (`<path d>` with stroke, no fill). */
export function iconPath(strokes: readonly Stroke[]): string {
  const f = (v: number) => Number(v.toFixed(2));
  return strokes.map((s) => `M${s.points.map(([x, y]) => `${f(x)} ${f(y)}`).join(" L")}${s.closed ? " Z" : ""}`).join(" ");
}

/**
 * Career type colors (owner pick: "Neon line"): one hue per type from a balanced neon spectrum with
 * similar brightness, shared by the 3D icons, spur stubs and the 2D chips.
 */
export const CAREER_TONE: Record<CareerType, string> = {
  job: "#38bdf8",
  freelance: "#f472b6",
  education: "#a78bfa",
  award: "#fbbf24",
  milestone: "#34d399",
};

/** Mesh data for a stroke icon in its own plane (x right, y up, z toward the viewer), centered. */
export interface IconMesh {
  positions: number[];
  indices: number[];
}

/**
 * Turns strokes into flat ribbons of `width` (grid units) scaled to `size` world units across,
 * mitered at joins. `depth` > 0 extrudes them (front, back and side walls) for solid variants.
 */
export function iconMesh(strokes: readonly Stroke[], { size = 2, width = 1.6, depth = 0 }: { size?: number; width?: number; depth?: number } = {}): IconMesh {
  const k = size / 24;
  const out: IconMesh = { positions: [], indices: [] };
  const layers = depth > 0 ? [depth / 2, -depth / 2] : [0];
  for (const stroke of strokes) {
    const pts = stroke.points.map(([x, y]) => ({ x: (x - 12) * k, y: (12 - y) * k }));
    const n = pts.length;
    const ring = stroke.closed ? [...pts, pts[0]] : pts;
    const normals = ring.map((p, i) => {
      const prev = i > 0 ? ring[i - 1] : stroke.closed ? pts[n - 1] : null;
      const next = i < ring.length - 1 ? ring[i + 1] : stroke.closed ? pts[1] : null;
      const dir = (a: { x: number; y: number }, b: { x: number; y: number }) => {
        const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        return { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
      };
      const d0 = prev ? dir(prev, p) : null;
      const d1 = next ? dir(p, next) : null;
      const n0 = d0 ? { x: -d0.y, y: d0.x } : null;
      const n1 = d1 ? { x: -d1.y, y: d1.x } : null;
      if (!n0) return n1!;
      if (!n1) return n0;
      const m = { x: n0.x + n1.x, y: n0.y + n1.y };
      const len = Math.hypot(m.x, m.y);
      if (len < 1e-6) return n0;
      const cos = (m.x * n0.x + m.y * n0.y) / len;
      const scale = Math.min(2, 1 / Math.max(0.2, cos));
      return { x: (m.x / len) * scale, y: (m.y / len) * scale };
    });
    const half = (width * k) / 2;
    // Vertex layout per layer: for each ring point, left then right.
    const base = out.positions.length / 3;
    for (const z of layers) {
      ring.forEach((p, i) => {
        const nn = normals[i];
        out.positions.push(p.x + nn.x * half, p.y + nn.y * half, z, p.x - nn.x * half, p.y - nn.y * half, z);
      });
    }
    const per = ring.length * 2;
    const at = (layer: number, i: number, side: 0 | 1) => base + layer * per + i * 2 + side;
    for (let layer = 0; layer < layers.length; layer++) {
      for (let i = 0; i < ring.length - 1; i++) out.indices.push(at(layer, i, 0), at(layer, i, 1), at(layer, i + 1, 0), at(layer, i, 1), at(layer, i + 1, 1), at(layer, i + 1, 0));
    }
    if (layers.length === 2) {
      for (let i = 0; i < ring.length - 1; i++) {
        for (const side of [0, 1] as const) out.indices.push(at(0, i, side), at(1, i, side), at(0, i + 1, side), at(1, i, side), at(1, i + 1, side), at(0, i + 1, side));
      }
    }
  }
  return out;
}

/** Closed ellipse around (cx, cy), `steps` points (a pad ring seen at an angle). */
function ring(cx: number, cy: number, rx: number, ry: number, steps = 16): Point[] {
  return Array.from({ length: steps }, (_, i) => {
    const a = (i / steps) * Math.PI * 2;
    return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry] as Point;
  });
}

/** Floor pad icons on the same 24 x 24 grid: the elevator call pad and the L2 year teleporter. */
export const PAD_ICONS: Record<PadKind, Stroke[]> = {
  // Elevator: closed lift doors with an up and a down arrow.
  elevator: [shut([4, 3], [20, 3], [20, 21], [4, 21]), open([12, 3], [12, 21]), open([6, 10], [8, 7], [10, 10]), open([14, 14], [16, 17], [18, 14])],
  // Teleporter: three beams rising from a pad ring.
  teleport: [shut(...ring(12, 19, 8, 3)), open([8, 18], [8, 5]), open([12, 16], [12, 2]), open([16, 18], [16, 5])],
  // Express Return: an arrow running into closed lift doors.
  return: [shut([12, 4], [21, 4], [21, 20], [12, 20]), open([16.5, 4], [16.5, 20]), open([2, 12], [10, 12]), open([6.5, 8.5], [10, 12], [6.5, 15.5])],
};

/** Pad neon tones: the values of COLORS.cyan, COLORS.pink and COLORS.green (fast return), kept as literals because config.ts imports the career layout, which imports this module. */
export const PAD_TONE: Record<PadKind, string> = { elevator: "#22d3ee", teleport: "#f472b6", return: "#34d399" };

/** L4 zone icons in the same "Neon line" style: open book, paper, model cube, presentation screen. */
export const LIBRARY_ICONS: Record<LibraryZone, Stroke[]> = {
  // Blog: an open book with a spine and two text lines per page.
  blog: [
    shut([12, 6], [12, 20], [3, 18], [3, 4]),
    shut([12, 6], [21, 4], [21, 18], [12, 20]),
    open([5.5, 8.5], [9.5, 9.5]),
    open([5.5, 12], [9.5, 13]),
    open([14.5, 9.5], [18.5, 8.5]),
    open([14.5, 13], [18.5, 12]),
  ],
  // Research: a paper with a folded corner and text lines.
  research: [shut([5, 2.5], [15, 2.5], [19, 6.5], [19, 21.5], [5, 21.5]), open([15, 2.5], [15, 6.5], [19, 6.5]), open([8, 10], [16, 10]), open([8, 13.5], [16, 13.5]), open([8, 17], [13, 17])],
  // Models and datasets: an isometric cube.
  models: [shut([12, 2.5], [20.5, 7], [20.5, 17], [12, 21.5], [3.5, 17], [3.5, 7]), open([3.5, 7], [12, 11.5], [20.5, 7]), open([12, 11.5], [12, 21.5])],
  // Talks and workshops: a presentation screen on a stand with a rising chart.
  talks: [shut([3, 3.5], [21, 3.5], [21, 15.5], [3, 15.5]), open([12, 15.5], [12, 19]), open([8, 21.5], [12, 19], [16, 21.5]), open([6.5, 12.5], [10, 9], [13, 11], [17.5, 6.5])],
};
