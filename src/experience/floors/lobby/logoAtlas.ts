/**
 * Pure layout for the L1 skills-wall logos: one texture atlas and one merged quad geometry,
 * so every logo on the wall costs a single draw call. No React or three side effects.
 */

export interface AtlasLayout {
  /** Distinct logo paths in atlas cell order. */
  srcs: string[];
  cols: number;
  rows: number;
  cell: number;
}

export function atlasLayout(srcs: readonly (string | null)[], cell = 64): AtlasLayout {
  const unique = [...new Set(srcs.filter((s): s is string => Boolean(s)))];
  const cols = Math.max(1, Math.ceil(Math.sqrt(unique.length)));
  const rows = Math.max(1, Math.ceil(unique.length / cols));
  return { srcs: unique, cols, rows, cell };
}

/** UV rectangle [u0, v0, u1, v1] of a cell (v grows upward, row 0 is the top of the canvas). */
export function cellUv(layout: AtlasLayout, index: number): [number, number, number, number] {
  const col = index % layout.cols;
  const row = Math.floor(index / layout.cols);
  const u0 = col / layout.cols;
  const u1 = (col + 1) / layout.cols;
  const v1 = 1 - row / layout.rows;
  const v0 = 1 - (row + 1) / layout.rows;
  return [u0, v0, u1, v1];
}

export interface LogoQuad {
  src: string;
  /** Center in the wall's local space. */
  x: number;
  y: number;
  size: number;
}

/**
 * Builds positions, uvs and indices for camera-facing (+z) quads.
 * Quads whose src is not in the atlas are skipped.
 */
export function quadBuffers(layout: AtlasLayout, quads: readonly LogoQuad[], z = 0) {
  const placed = quads.filter((q) => layout.srcs.includes(q.src));
  const positions = new Float32Array(placed.length * 12);
  const uvs = new Float32Array(placed.length * 8);
  const indices = new Uint16Array(placed.length * 6);
  placed.forEach((q, i) => {
    const h = q.size / 2;
    const [u0, v0, u1, v1] = cellUv(layout, layout.srcs.indexOf(q.src));
    positions.set([q.x - h, q.y - h, z, q.x + h, q.y - h, z, q.x + h, q.y + h, z, q.x - h, q.y + h, z], i * 12);
    uvs.set([u0, v0, u1, v0, u1, v1, u0, v1], i * 8);
    const b = i * 4;
    indices.set([b, b + 1, b + 2, b, b + 2, b + 3], i * 6);
  });
  return { positions, uvs, indices, count: placed.length };
}
