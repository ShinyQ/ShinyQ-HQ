import type { CareerType } from "../types";

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
