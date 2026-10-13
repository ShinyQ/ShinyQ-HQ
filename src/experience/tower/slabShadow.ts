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

/** A plane with the inside where `normal . p + constant >= 0` (three's `Plane` convention). */
export interface PlaneLike {
  normal: Vec3;
  constant: number;
}

/**
 * A view frustum: its 6 inward planes and its 8 corners, indexed like `boxCorners` by NDC bits
 * (`x * 4 + y * 2 + z`, 0 for -1 and 1 for +1), so corners one bit apart share an edge.
 */
export interface FrustumLike {
  planes: readonly PlaneLike[];
  corners: readonly Vec3[];
}

/** Corner pairs one index bit apart: the 12 edges of a box or a frustum. */
const EDGES: [number, number][] = [];
for (let a = 0; a < 8; a++) for (const bit of [1, 2, 4]) if (!(a & bit)) EDGES.push([a, a | bit]);

const dot = (n: Vec3, p: Vec3) => n[0] * p[0] + n[1] * p[1] + n[2] * p[2];
const lerp = (p: Vec3, q: Vec3, t: number): Vec3 => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];

/**
 * Bounds of the part of `box` inside the frustum, or null when no part is. Exact for the vertex set:
 * a vertex of the intersection of two convex polyhedra is a vertex of one inside the other, or where an
 * edge of one crosses a face of the other. A small tolerance only makes the bounds larger.
 */
export function clipBoxToFrustum(box: Box3Like, frustum: FrustumLike, tolerance = 1e-3): Box3Like | null {
  if (!usable(box)) return null;
  const inFrustum = (p: Vec3) => frustum.planes.every((plane) => dot(plane.normal, p) + plane.constant >= -tolerance);
  const inBox = (p: Vec3) => p.every((v, i) => v >= box.min[i] - tolerance && v <= box.max[i] + tolerance);
  const points: Vec3[] = [];
  const corners = boxCorners(box);
  for (const c of corners) if (inFrustum(c)) points.push(c);
  for (const c of frustum.corners) if (inBox(c)) points.push(c);
  for (const [a, b] of EDGES) {
    const p = corners[a];
    const q = corners[b];
    for (const plane of frustum.planes) {
      const dp = dot(plane.normal, p) + plane.constant;
      const dq = dot(plane.normal, q) + plane.constant;
      if ((dp < 0) === (dq < 0) || dp === dq) continue;
      const r = lerp(p, q, dp / (dp - dq));
      if (inFrustum(r)) points.push(r);
    }
  }
  for (const [a, b] of EDGES) {
    const p = frustum.corners[a];
    const q = frustum.corners[b];
    for (let axis = 0; axis < 3; axis++) {
      for (const value of [box.min[axis], box.max[axis]]) {
        const dp = p[axis] - value;
        const dq = q[axis] - value;
        if ((dp < 0) === (dq < 0) || dp === dq) continue;
        const r = lerp(p, q, dp / (dp - dq));
        if (inBox(r) && inFrustum(r)) points.push(r);
      }
    }
  }
  if (!points.length) return null;
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const p of points) {
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], p[i]);
      max[i] = Math.max(max[i], p[i]);
    }
  }
  // Never grow past the box itself (the tolerance can push a crossing slightly out).
  for (let i = 0; i < 3; i++) {
    min[i] = Math.max(min[i], box.min[i]);
    max[i] = Math.min(max[i], box.max[i]);
  }
  return { min, max };
}
