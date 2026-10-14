/**
 * Screen-space label placement (L4 Topic Constellation, owner review 2026-10-14): which floating signs
 * may show this frame so none covers another. Pure: callers project each sign's plate to CSS pixels.
 * Fixed signs (the count headline, the monument) are placed first and always show; the rest go in
 * priority order and show only when they overlap nothing placed so far, up to `max` of them.
 */

export interface ScreenBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface LabelCandidate {
  box: ScreenBox | null;
  /** Higher places first. */
  priority: number;
  /** Always shown (still occupies its box), never counted against `max`. */
  fixed?: boolean;
}

/** Gap kept between two shown boxes (px). */
export const LABEL_GAP = 4;

export function boxesOverlap(a: ScreenBox, b: ScreenBox, gap = 0): boolean {
  return a.x0 < b.x1 + gap && b.x0 < a.x1 + gap && a.y0 < b.y1 + gap && b.y0 < a.y1 + gap;
}

/** Overlap area of two boxes (px squared). */
export function overlapArea(a: ScreenBox, b: ScreenBox): number {
  const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  return w > 0 && h > 0 ? w * h : 0;
}

/**
 * Shown flags in input order. A candidate without a box (behind the camera, off screen, too close) never
 * shows. Ties keep input order, so the result is stable frame to frame.
 */
export function placeLabels(items: readonly LabelCandidate[], max: number, gap = LABEL_GAP): boolean[] {
  const order = items.map((_, i) => i).sort((a, b) => Number(Boolean(items[b].fixed)) - Number(Boolean(items[a].fixed)) || items[b].priority - items[a].priority || a - b);
  const shown = items.map(() => false);
  const placed: ScreenBox[] = [];
  let free = 0;
  for (const i of order) {
    const { box, fixed } = items[i];
    if (!box) continue;
    if (fixed) {
      shown[i] = true;
      placed.push(box);
      continue;
    }
    if (free >= max || placed.some((p) => boxesOverlap(p, box, gap))) continue;
    shown[i] = true;
    placed.push(box);
    free += 1;
  }
  return shown;
}

export type Quad = readonly (readonly [number, number])[];

/** Signed area of a polygon (px squared), positive counterclockwise in screen coordinates. */
function signedArea(p: Quad): number {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const [x0, y0] = p[i];
    const [x1, y1] = p[(i + 1) % p.length];
    a += x0 * y1 - x1 * y0;
  }
  return a / 2;
}

/**
 * Overlap area of two convex polygons (the projected sign plates), by clipping one against the other
 * (Sutherland-Hodgman). Exact for convex quads, whatever their winding.
 */
export function polygonOverlap(a: Quad, b: Quad): number {
  const clip = signedArea(b) >= 0 ? [...b] : [...b].reverse();
  let out: [number, number][] = a.map(([x, y]) => [x, y]);
  for (let i = 0; i < clip.length && out.length; i++) {
    const [cx0, cy0] = clip[i];
    const [cx1, cy1] = clip[(i + 1) % clip.length];
    const inside = ([x, y]: readonly [number, number]) => (cx1 - cx0) * (y - cy0) - (cy1 - cy0) * (x - cx0) >= 0;
    const cross = (p: readonly [number, number], q: readonly [number, number]): [number, number] => {
      const a1 = cy1 - cy0;
      const b1 = cx0 - cx1;
      const c1 = a1 * cx0 + b1 * cy0;
      const a2 = q[1] - p[1];
      const b2 = p[0] - q[0];
      const c2 = a2 * p[0] + b2 * p[1];
      const det = a1 * b2 - a2 * b1 || 1e-12;
      return [(b2 * c1 - b1 * c2) / det, (a1 * c2 - a2 * c1) / det];
    };
    const input = out;
    out = [];
    for (let j = 0; j < input.length; j++) {
      const cur = input[j];
      const prev = input[(j + input.length - 1) % input.length];
      if (inside(cur)) {
        if (!inside(prev)) out.push(cross(prev, cur));
        out.push(cur);
      } else if (inside(prev)) out.push(cross(prev, cur));
    }
  }
  return out.length < 3 ? 0 : Math.abs(signedArea(out));
}

/** Area of a polygon (px squared). */
export function polygonArea(p: Quad): number {
  return Math.abs(signedArea(p));
}
