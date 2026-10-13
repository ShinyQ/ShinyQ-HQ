/**
 * Whether a box is hidden from the eye by a floor slab (ride cull, see `rideCull.ts`). Pure: no three
 * import, so Vitest runs it in node.
 *
 * The eye sits above the slab and the box below it. Every ray from the eye to a point of the box crosses
 * the plane of the slab's top face; the box is hidden when all those crossings land on the top face.
 * Projecting from a point onto a plane maps segments to segments, so the box's image is the hull of its
 * 8 corners' images, and the face is a convex rectangle: checking the corners checks the whole box.
 */
export type Vec3 = [number, number, number];

export interface Box3Like {
  min: Vec3;
  max: Vec3;
}

/** A slab's footprint and height range in world space. */
export interface SlabRect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  top: number;
  bottom: number;
}

/** Distance the projected corners must stay inside the slab's edges (antialiasing, MSAA, rounding). */
export const SHADOW_MARGIN = 0.5;
const EYE_CLEARANCE = 1e-3;

export function boxCorners({ min, max }: Box3Like): Vec3[] {
  const corners: Vec3[] = [];
  for (const x of [min[0], max[0]]) for (const y of [min[1], max[1]]) for (const z of [min[2], max[2]]) corners.push([x, y, z]);
  return corners;
}

function usable({ min, max }: Box3Like): boolean {
  for (let i = 0; i < 3; i++) {
    if (!Number.isFinite(min[i]) || !Number.isFinite(max[i]) || min[i] > max[i]) return false;
  }
  return true;
}

export function inSlabShadow(eye: Vec3, slab: SlabRect, box: Box3Like, margin = SHADOW_MARGIN): boolean {
  const [ex, ey, ez] = eye;
  if (!(ey > slab.top + EYE_CLEARANCE)) return false;
  if (!usable(box) || !(box.max[1] < slab.bottom)) return false;
  const minX = slab.minX + margin;
  const maxX = slab.maxX - margin;
  const minZ = slab.minZ + margin;
  const maxZ = slab.maxZ - margin;
  if (minX > maxX || minZ > maxZ) return false;
  for (const [px, py, pz] of boxCorners(box)) {
    const t = (ey - slab.top) / (ey - py);
    const qx = ex + (px - ex) * t;
    const qz = ez + (pz - ez) * t;
    if (qx < minX || qx > maxX || qz < minZ || qz > maxZ) return false;
  }
  return true;
}
