/**
 * Pure layout for the L1 skills and certification wall logos: one prebuilt texture atlas
 * (scripts/logo-atlas.ts) and one merged quad geometry per wall, so each wall's logos cost a single
 * draw call. No React or three side effects.
 */

/** Atlas cell size in pixels; each logo fits inside the cell less `atlasPad` on every side. */
export const ATLAS_CELL = 128;

export const atlasPad = (cell: number) => Math.round(cell * 0.06);

export interface AtlasLayout {
  /** Distinct logo paths in atlas cell order. */
  srcs: string[];
  cols: number;
  rows: number;
  cell: number;
}

export function atlasLayout(srcs: readonly (string | null)[], cell = ATLAS_CELL): AtlasLayout {
  const unique = [...new Set(srcs.filter((s): s is string => Boolean(s)))];
  const cols = Math.max(1, Math.ceil(Math.sqrt(unique.length)));
  const rows = Math.max(1, Math.ceil(unique.length / cols));
  return { srcs: unique, cols, rows, cell };
}

/**
 * Whether `createImageBitmap` can decode the atlas with the options it needs (straight alpha, no color
 * conversion, rows flipped). Same gate as three's GLTFLoader (r186): Safari before 17 and Firefox before 98
 * ignore or mishandle those options, so they take the <img> path.
 */
export function canDecodeAtlasBitmap(userAgent: string | undefined, hasCreateImageBitmap: boolean): boolean {
  if (!hasCreateImageBitmap) return false;
  if (!userAgent) return true;
  // Major version, 0 when the agent does not say.
  const major = (re: RegExp) => +(userAgent.match(re)?.[1] ?? 0);
  return !(/^((?!chrome|android).)*safari/i.test(userAgent) && major(/Version\/(\d+)/) < 17) && !(userAgent.includes("Firefox") && major(/Firefox\/(\d+)\./) < 98);
}

/**
 * `texture.flipY` for each decode path. The bitmap is decoded with its rows flipped already (WebGL ignores
 * UNPACK_FLIP_Y for an ImageBitmap); the <img> is flipped on upload.
 */
export const atlasFlipY = (bitmap: boolean) => !bitmap;

/** Every logo the L1 walls draw, in atlas order: the skills wall items first, then the certification issuers. */
export function wallLogoSrcs(data: { skills: readonly { logos: readonly (string | null)[] }[]; certifications: readonly { logo: string | null }[] }): (string | null)[] {
  return [...data.skills.flatMap((g) => g.logos), ...data.certifications.map((c) => c.logo)];
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

export interface OrientedQuad {
  src: string;
  /** World-space center. */
  center: [number, number, number];
  /** Y rotation; the quad faces its local +z like a plane rotated by `yaw`. */
  yaw: number;
  size: number;
}

/** Like `quadBuffers`, for quads that each turn by their own yaw (badges on the curved certification wall). */
export function orientedQuadBuffers(layout: AtlasLayout, quads: readonly OrientedQuad[]) {
  const placed = quads.filter((q) => layout.srcs.includes(q.src));
  const positions = new Float32Array(placed.length * 12);
  const uvs = new Float32Array(placed.length * 8);
  const indices = new Uint16Array(placed.length * 6);
  placed.forEach((q, i) => {
    const h = q.size / 2;
    // Local +x after a rotation of `yaw` about +y.
    const rx = Math.cos(q.yaw) * h;
    const rz = -Math.sin(q.yaw) * h;
    const [x, y, z] = q.center;
    const [u0, v0, u1, v1] = cellUv(layout, layout.srcs.indexOf(q.src));
    positions.set([x - rx, y - h, z - rz, x + rx, y - h, z + rz, x + rx, y + h, z + rz, x - rx, y + h, z - rz], i * 12);
    uvs.set([u0, v0, u1, v0, u1, v1, u0, v1], i * 8);
    const b = i * 4;
    indices.set([b, b + 1, b + 2, b, b + 2, b + 3], i * 6);
  });
  return { positions, uvs, indices, count: placed.length };
}
