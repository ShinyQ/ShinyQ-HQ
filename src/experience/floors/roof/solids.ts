import type { GpuTier, Rect, Vec2 } from "../../types";

/**
 * Pure geometry for the roof scenery (no three): merged boxes and their edges (one draw call each
 * for all the solids of a scenery), the antenna lattice and seeded scatter.
 * Vitest runs it in node.
 */

/** A box standing on `y` (its bottom), centered on (x, z), turned by `yaw` around the vertical axis. */
export interface Box {
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  yaw?: number;
}

type V3 = readonly [number, number, number];

/** Unit cube faces: outward normal and four corners (x, y, z in -1 or 1), counter-clockwise from outside. */
const FACES: readonly { n: V3; v: readonly V3[] }[] = [
  { n: [1, 0, 0], v: [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]] },
  { n: [-1, 0, 0], v: [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]] },
  { n: [0, 1, 0], v: [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]] },
  { n: [0, -1, 0], v: [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]] },
  { n: [0, 0, 1], v: [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]] },
  { n: [0, 0, -1], v: [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]] },
];

const CORNERS: readonly V3[] = [
  [-1, -1, -1],
  [1, -1, -1],
  [1, -1, 1],
  [-1, -1, 1],
  [-1, 1, -1],
  [1, 1, -1],
  [1, 1, 1],
  [-1, 1, 1],
];
const EDGES: readonly [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 0],
  [4, 5], [5, 6], [6, 7], [7, 4],
  [0, 4], [1, 5], [2, 6], [3, 7],
];

function place(b: Box, [sx, sy, sz]: V3): [number, number, number] {
  const lx = (sx * b.w) / 2;
  const ly = ((sy + 1) / 2) * b.h;
  const lz = (sz * b.d) / 2;
  const c = Math.cos(b.yaw ?? 0);
  const s = Math.sin(b.yaw ?? 0);
  return [b.x + lx * c + lz * s, b.y + ly, b.z - lx * s + lz * c];
}

/** Every box as 6 faces of 4 vertices (flat normals), merged into one indexed buffer. */
export function boxBuffers(boxes: readonly Box[]): { positions: Float32Array; normals: Float32Array; indices: Uint32Array } {
  const positions = new Float32Array(boxes.length * 24 * 3);
  const normals = new Float32Array(boxes.length * 24 * 3);
  const indices = new Uint32Array(boxes.length * 36);
  let v = 0;
  let i = 0;
  for (const b of boxes) {
    const c = Math.cos(b.yaw ?? 0);
    const s = Math.sin(b.yaw ?? 0);
    for (const face of FACES) {
      const base = v;
      const [nx, ny, nz] = face.n;
      for (const corner of face.v) {
        positions.set(place(b, corner), v * 3);
        normals.set([nx * c + nz * s, ny, -nx * s + nz * c], v * 3);
        v += 1;
      }
      indices.set([base, base + 1, base + 2, base, base + 2, base + 3], i);
      i += 6;
    }
  }
  return { positions, normals, indices };
}

/** The 12 edges of every box as line segment pairs (xyz, xyz). */
export function boxEdgeBuffers(boxes: readonly Box[]): Float32Array {
  const out = new Float32Array(boxes.length * EDGES.length * 6);
  let o = 0;
  for (const b of boxes)
    for (const [a, c] of EDGES) {
      out.set(place(b, CORNERS[a]), o);
      out.set(place(b, CORNERS[c]), o + 3);
      o += 6;
    }
  return out;
}

/**
 * A square lattice mast as line segment pairs: four corner legs tapering from `base` to `top` half
 * width, and at every level a ring and one diagonal brace per face.
 */
export function latticeSegments(height: number, base: number, top: number, levels: number): Float32Array {
  const out: number[] = [];
  const corner = (k: number, half: number, y: number): number[] => [(k === 0 || k === 3 ? -1 : 1) * half, y, (k < 2 ? -1 : 1) * half];
  for (let i = 0; i < levels; i++) {
    const y0 = (height * i) / levels;
    const y1 = (height * (i + 1)) / levels;
    const h0 = base + ((top - base) * i) / levels;
    const h1 = base + ((top - base) * (i + 1)) / levels;
    for (let k = 0; k < 4; k++) {
      const n = (k + 1) % 4;
      out.push(...corner(k, h0, y0), ...corner(k, h1, y1));
      out.push(...corner(k, h1, y1), ...corner(n, h1, y1));
      out.push(...corner(k, h0, y0), ...corner(n, h1, y1));
    }
  }
  return new Float32Array(out);
}

/** Deterministic PRNG so screenshots and tests see the same scenery. */
export function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Up to `count` seeded points in `area` that `reject` does not refuse (decor such as floor lights). */
export function scatter(count: number, area: Rect, reject: (p: Vec2) => boolean, seed = 5, tries = count * 20): Vec2[] {
  const rand = mulberry32(seed);
  const out: Vec2[] = [];
  for (let t = 0; t < tries && out.length < count; t++) {
    const p = { x: area.minX + rand() * (area.maxX - area.minX), z: area.minZ + rand() * (area.maxZ - area.minZ) };
    if (!reject(p)) out.push(p);
  }
  return out;
}

/** How much decor each tier draws (the lite tier also drops additive glow and icon halos in the components). */
export interface RoofDetail {
  flowers: number;
}

export function roofDetail(tier: GpuTier): RoofDetail {
  return tier === "full" ? { flowers: 90 } : { flowers: 40 };
}
