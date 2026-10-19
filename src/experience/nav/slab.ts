import type { Rect, Vec2 } from "../types";

/**
 * Multi-rect floor slabs: a floor's walkable shape is its main `bounds` rect plus optional `wings`
 * (`FloorLayout.wings`), axis-aligned rects that touch the slab (or each other) along part of an
 * edge and never overlap it. A shared joint is open floor, not an edge. Pure and allocation-free on
 * the per-frame paths (`clampToSlab`, `inSlabXZ`); a floor without wings takes the plain rect path.
 */
export interface SlabShape {
  bounds: Rect;
  wings?: readonly Rect[];
}

const EPS = 1e-9;

const hasWings = (s: SlabShape): s is SlabShape & { wings: readonly Rect[] } => !!s.wings && s.wings.length > 0;

/** The main rect, then every wing. */
export function slabRects(s: SlabShape): readonly Rect[] {
  return hasWings(s) ? [s.bounds, ...s.wings] : [s.bounds];
}

/** Bounding box of every rect of the slab. */
export function slabBox(s: SlabShape): Rect {
  const b = s.bounds;
  if (!hasWings(s)) return { minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ };
  let { minX, maxX, minZ, maxZ } = b;
  for (const w of s.wings) {
    minX = Math.min(minX, w.minX);
    maxX = Math.max(maxX, w.maxX);
    minZ = Math.min(minZ, w.minZ);
    maxZ = Math.max(maxZ, w.maxZ);
  }
  return { minX, maxX, minZ, maxZ };
}

const near = (a: number, b: number) => Math.abs(a - b) <= 1e-6;

function insetOf(r: Rect, inset: number): Rect {
  return { minX: r.minX + inset, maxX: r.maxX - inset, minZ: r.minZ + inset, maxZ: r.maxZ - inset };
}

const valid = (r: Rect) => r.minX <= r.maxX && r.minZ <= r.maxZ;

/** The bridge across the joint where `a`'s far side touches `b`'s near side (on x or z), inset `inset`; null when they do not touch. */
function bridge(a: Rect, b: Rect, inset: number): Rect | null {
  if (near(a.maxZ, b.minZ)) {
    const c = a.maxZ;
    const r = { minX: Math.max(a.minX, b.minX) + inset, maxX: Math.min(a.maxX, b.maxX) - inset, minZ: Math.max(c - inset, a.minZ + inset), maxZ: Math.min(c + inset, b.maxZ - inset) };
    return valid(r) ? r : null;
  }
  if (near(a.maxX, b.minX)) {
    const c = a.maxX;
    const r = { minX: Math.max(c - inset, a.minX + inset), maxX: Math.min(c + inset, b.maxX - inset), minZ: Math.max(a.minZ, b.minZ) + inset, maxZ: Math.min(a.maxZ, b.maxZ) - inset };
    return valid(r) ? r : null;
  }
  return null;
}

// Keyed by the wings array; one entry per inset, so insets must come from a small fixed set (radii, not per-frame values).
const insetCache = new WeakMap<readonly Rect[], { bounds: Rect; inset: number; rects: readonly Rect[] }[]>();

/**
 * The floor a circle of radius `inset` may stand on, as rects: every slab rect shrunk by `inset`, then
 * one bridge across each joint (a concave corner keeps the square inset corner, a little stricter than
 * the exact rounded one). Without wings: the inset bounds. Cached per wings array.
 */
export function slabInsetRects(s: SlabShape, inset: number): readonly Rect[] {
  if (!hasWings(s)) return [insetOf(s.bounds, inset)];
  let entries = insetCache.get(s.wings);
  // A plain loop: this runs every frame through `clampToSlab` and `inSlabXZ`, so no closure.
  if (entries) for (const e of entries) if (e.bounds === s.bounds && e.inset === inset) return e.rects;
  const all = slabRects(s);
  const rects = all.map((r) => insetOf(r, inset)).filter(valid);
  for (let i = 0; i < all.length; i++)
    for (let j = 0; j < all.length; j++) {
      if (i === j) continue;
      const b = bridge(all[i], all[j], inset);
      if (b) rects.push(b);
    }
  if (!entries) insetCache.set(s.wings, (entries = []));
  entries.push({ bounds: s.bounds, inset, rects });
  return rects;
}

const contains = (r: Rect, x: number, z: number) => x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ;

/** `inSlab` on plain numbers (camera loops). */
export function inSlabXZ(x: number, z: number, s: SlabShape, inset = 0): boolean {
  const b = s.bounds;
  if (!hasWings(s)) return x >= b.minX + inset && x <= b.maxX - inset && z >= b.minZ + inset && z <= b.maxZ - inset;
  if (inset === 0) {
    if (contains(b, x, z)) return true;
    for (const w of s.wings) if (contains(w, x, z)) return true;
    return false;
  }
  for (const r of slabInsetRects(s, inset)) if (contains(r, x, z)) return true;
  return false;
}

/** Whether `p` stands on the slab with at least `inset` u of floor around it (0: anywhere on it, edges included). */
export function inSlab(p: Vec2, s: SlabShape, inset = 0): boolean {
  return inSlabXZ(p.x, p.z, s, inset);
}

/**
 * Nearest point to `p` of the slab inset by `inset` (`slabInsetRects`), written into `out` (which may be
 * `p`) and returned. Without wings it is the plain clamp to the inset bounds.
 */
export function clampToSlab(p: Vec2, s: SlabShape, inset: number, out: Vec2 = { x: 0, z: 0 }): Vec2 {
  const px = p.x;
  const pz = p.z;
  if (!hasWings(s)) {
    const b = s.bounds;
    out.x = Math.max(b.minX + inset, Math.min(b.maxX - inset, px));
    out.z = Math.max(b.minZ + inset, Math.min(b.maxZ - inset, pz));
    return out;
  }
  let bx = px;
  let bz = pz;
  let best = Infinity;
  for (const r of slabInsetRects(s, inset)) {
    const x = Math.max(r.minX, Math.min(r.maxX, px));
    const z = Math.max(r.minZ, Math.min(r.maxZ, pz));
    const d = (x - px) * (x - px) + (z - pz) * (z - pz);
    if (d < best - EPS) {
      best = d;
      bx = x;
      bz = z;
      if (d === 0) break;
    }
  }
  out.x = bx;
  out.z = bz;
  return out;
}

/** Parts of [lo, hi] not covered by any of `cover` (sorted, merged). */
function subtract(lo: number, hi: number, cover: [number, number][]): [number, number][] {
  cover.sort((a, b) => a[0] - b[0]);
  const out: [number, number][] = [];
  let at = lo;
  for (const [a, b] of cover) {
    if (b <= at + 1e-6) continue;
    if (a > at + 1e-6) out.push([at, Math.min(a, hi)]);
    at = Math.max(at, b);
    if (at >= hi - 1e-6) break;
  }
  if (at < hi - 1e-6) out.push([at, hi]);
  return out.filter(([a, b]) => b - a > 1e-6);
}

/**
 * The slab's outline: the outer edges of the union as degenerate rects (segments: `minX === maxX` runs
 * along z, `minZ === maxZ` along x), per rect in the order west, east, north, south. A stretch of an
 * edge where another rect continues the floor (a joint) is left out.
 */
export function slabEdges(s: SlabShape): Rect[] {
  const all = slabRects(s);
  const out: Rect[] = [];
  all.forEach((r, i) => {
    const others = all.filter((_, j) => j !== i);
    // Rects holding floor just past the side at `c` (outward sign `dir`), as intervals along the side.
    const alongZ = (c: number, dir: 1 | -1) =>
      subtract(
        r.minZ,
        r.maxZ,
        others.filter((o) => (dir < 0 ? o.minX < c - 1e-6 && o.maxX > c - 1e-6 : o.maxX > c + 1e-6 && o.minX < c + 1e-6)).map((o) => [Math.max(r.minZ, o.minZ), Math.min(r.maxZ, o.maxZ)] as [number, number]).filter(([a, b]) => b > a),
      );
    const alongX = (c: number, dir: 1 | -1) =>
      subtract(
        r.minX,
        r.maxX,
        others.filter((o) => (dir < 0 ? o.minZ < c - 1e-6 && o.maxZ > c - 1e-6 : o.maxZ > c + 1e-6 && o.minZ < c + 1e-6)).map((o) => [Math.max(r.minX, o.minX), Math.min(r.maxX, o.maxX)] as [number, number]).filter(([a, b]) => b > a),
      );
    for (const [a, b] of alongZ(r.minX, -1)) out.push({ minX: r.minX, maxX: r.minX, minZ: a, maxZ: b });
    for (const [a, b] of alongZ(r.maxX, 1)) out.push({ minX: r.maxX, maxX: r.maxX, minZ: a, maxZ: b });
    for (const [a, b] of alongX(r.minZ, -1)) out.push({ minX: a, maxX: b, minZ: r.minZ, maxZ: r.minZ });
    for (const [a, b] of alongX(r.maxZ, 1)) out.push({ minX: a, maxX: b, minZ: r.maxZ, maxZ: r.maxZ });
  });
  return out;
}

/** Points where the outline turns (an edge along x meets one along z): where the slab mesh draws its vertical edges. */
export function slabCorners(s: SlabShape): Vec2[] {
  const ends = new Map<string, { p: Vec2; x: boolean; z: boolean }>();
  const mark = (x: number, z: number, alongX: boolean) => {
    const key = `${Math.round(x * 1e4)},${Math.round(z * 1e4)}`;
    const e = ends.get(key) ?? { p: { x, z }, x: false, z: false };
    if (alongX) e.x = true;
    else e.z = true;
    ends.set(key, e);
  };
  for (const e of slabEdges(s)) {
    const alongX = e.minZ === e.maxZ;
    mark(e.minX, e.minZ, alongX);
    mark(e.maxX, e.maxZ, alongX);
  }
  return [...ends.values()].filter((e) => e.x && e.z).map((e) => e.p);
}
