import { boxBuffers, boxEdgeBuffers, latticeSegments, type Box } from "../roof/solids";
import { ABOUT, BEACON, contactBeacon, experienceArch, FOUNTAIN, monoliths, type Face } from "./hallGallery";
import { gatePillars, HALL } from "./hallLayout";

/**
 * Pure buffers for the gallery solids (no three): boxes (turned or not) plus round prisms (the About me
 * pedestal, the beacon head) in one indexed mesh, and every neon line (box edges, prism rims, the
 * portrait ring, the fountain floor rings, the beacon lattice) in one line-segment buffer.
 */

/** A round prism standing on `y`: `sides` flat faces and a top cap. */
export interface Prism {
  x: number;
  z: number;
  y: number;
  h: number;
  r: number;
  sides: number;
}

/** A circle of line segments: horizontal (`face` unset) or upright on a face (centered on `u = 0`). */
export interface Circle {
  x: number;
  y: number;
  z: number;
  r: number;
  segments: number;
  face?: Face;
}

export function prismBuffers(prisms: readonly Prism[]): { positions: Float32Array; normals: Float32Array; indices: Uint32Array } {
  const verts = prisms.reduce((n, p) => n + p.sides * 4 + p.sides + 1, 0);
  const tris = prisms.reduce((n, p) => n + p.sides * 3, 0);
  const positions = new Float32Array(verts * 3);
  const normals = new Float32Array(verts * 3);
  const indices = new Uint32Array(tris * 3);
  let v = 0;
  let i = 0;
  const vert = (x: number, y: number, z: number, nx: number, ny: number, nz: number) => {
    positions.set([x, y, z], v * 3);
    normals.set([nx, ny, nz], v * 3);
    return v++;
  };
  for (const p of prisms) {
    const at = (k: number) => {
      const a = (k / p.sides) * Math.PI * 2;
      return [p.x + Math.sin(a) * p.r, p.z + Math.cos(a) * p.r] as const;
    };
    for (let k = 0; k < p.sides; k++) {
      const [x0, z0] = at(k);
      const [x1, z1] = at(k + 1);
      const mid = ((k + 0.5) / p.sides) * Math.PI * 2;
      const [nx, nz] = [Math.sin(mid), Math.cos(mid)];
      // Counter-clockwise from outside: bottom k, bottom k+1, top k+1, top k.
      const a = vert(x0, p.y, z0, nx, 0, nz);
      const b = vert(x1, p.y, z1, nx, 0, nz);
      const c = vert(x1, p.y + p.h, z1, nx, 0, nz);
      const d = vert(x0, p.y + p.h, z0, nx, 0, nz);
      indices.set([a, b, c, a, c, d], i);
      i += 6;
    }
    const center = vert(p.x, p.y + p.h, p.z, 0, 1, 0);
    const rim: number[] = [];
    for (let k = 0; k < p.sides; k++) {
      const [x, z] = at(k);
      rim.push(vert(x, p.y + p.h, z, 0, 1, 0));
    }
    for (let k = 0; k < p.sides; k++) {
      indices.set([center, rim[k], rim[(k + 1) % p.sides]], i);
      i += 3;
    }
  }
  return { positions, normals, indices };
}

/** Boxes then prisms in one indexed buffer (one draw call). */
export function solidBuffers(boxes: readonly Box[], prisms: readonly Prism[]) {
  const a = boxBuffers(boxes);
  const b = prismBuffers(prisms);
  const offset = a.positions.length / 3;
  const indices = new Uint32Array(a.indices.length + b.indices.length);
  indices.set(a.indices, 0);
  indices.set(b.indices.map((k) => k + offset), a.indices.length);
  const join = (x: Float32Array, y: Float32Array) => {
    const out = new Float32Array(x.length + y.length);
    out.set(x, 0);
    out.set(y, x.length);
    return out;
  };
  return { positions: join(a.positions, b.positions), normals: join(a.normals, b.normals), indices };
}

export function circleSegments(c: Circle): number[] {
  const out: number[] = [];
  const point = (k: number) => {
    const a = (k / c.segments) * Math.PI * 2;
    const s = Math.sin(a) * c.r;
    const q = Math.cos(a) * c.r;
    if (!c.face) return [c.x + s, c.y, c.z + q];
    return [c.x + c.face.right.x * s, c.y + q, c.z + c.face.right.z * s];
  };
  for (let k = 0; k < c.segments; k++) out.push(...point(k), ...point(k + 1));
  return out;
}

export interface HallShapes {
  boxes: Box[];
  prisms: Prism[];
  circles: Circle[];
}

const PEDESTAL_SIDES = 28;

/** Every solid of the gallery: gateway arch, pedestal, monoliths, experience arch, beacon and card. */
export function hallShapes(projectCount: number): HallShapes {
  const g = HALL.gate;
  const boxes: Box[] = [];
  const prisms: Prism[] = [];
  const circles: Circle[] = [];
  // Gateway arch: pillars and the lintel the rover drives under.
  for (const p of gatePillars()) boxes.push({ x: (p.minX + p.maxX) / 2, z: (p.minZ + p.maxZ) / 2, y: 0, w: p.maxX - p.minX, d: p.maxZ - p.minZ, h: g.h });
  boxes.push({ x: g.x, z: (g.north.minZ + g.south.maxZ) / 2, y: g.h - g.lintel, w: g.depth, d: g.south.maxZ - g.north.minZ, h: g.lintel });
  // About me: two-step round pedestal; rims glow, the portrait gets a neon ring.
  const a = ABOUT.center;
  prisms.push({ x: a.x, z: a.z, y: 0, h: ABOUT.base.h, r: ABOUT.base.r, sides: PEDESTAL_SIDES });
  prisms.push({ x: a.x, z: a.z, y: ABOUT.base.h, h: ABOUT.column.h, r: ABOUT.column.r, sides: PEDESTAL_SIDES });
  const top = ABOUT.base.h + ABOUT.column.h;
  circles.push({ x: a.x, y: ABOUT.base.h + 0.005, z: a.z, r: ABOUT.base.r, segments: PEDESTAL_SIDES });
  circles.push({ x: a.x, y: top + 0.005, z: a.z, r: ABOUT.column.r, segments: PEDESTAL_SIDES });
  // Top projects: the monoliths.
  for (const m of monoliths(projectCount)) boxes.push(m.box);
  // Work experience: the lit arch.
  const arch = experienceArch();
  boxes.push(...arch.pillars, arch.lintel);
  // Contact: beacon base, a thin core, crossbars, the head, and the floating card.
  const b = contactBeacon();
  const B = BEACON;
  boxes.push({ x: b.mast.x, z: b.mast.z, y: 0, w: B.base.w, d: B.base.w, h: B.base.h });
  boxes.push({ x: b.mast.x, z: b.mast.z, y: B.base.h, w: 0.16, d: 0.16, h: B.mast.top - B.base.h });
  for (const bar of B.bars) boxes.push({ x: b.mast.x, z: b.mast.z, y: bar.y, w: bar.w, d: 0.1, h: 0.1 }, { x: b.mast.x, z: b.mast.z, y: bar.y + 0.12, w: 0.1, d: bar.w, h: 0.1 });
  prisms.push({ x: b.mast.x, z: b.mast.z, y: B.mast.top, h: B.head.h, r: B.head.r, sides: 12 });
  circles.push({ x: b.mast.x, y: B.mast.top + B.head.h + 0.005, z: b.mast.z, r: B.head.r, segments: 12 });
  boxes.push(b.card.box);
  // Light fountain: two floor rings (lines only, the rover drives through it).
  for (const r of FOUNTAIN.rings) circles.push({ x: FOUNTAIN.x, y: 0.03, z: FOUNTAIN.z, r, segments: 48 });
  return { boxes, prisms, circles };
}

/** The portrait hologram's neon ring (upright, on the About me face). */
export function portraitRing(face: Face): Circle {
  return { x: face.origin.x + face.out.x * 0.02, y: ABOUT.disc.y, z: face.origin.z + face.out.z * 0.02, r: ABOUT.disc.r + 0.08, segments: 40, face };
}

/** Every neon line of the gallery as segment pairs: box edges, prism rims, circles and the beacon lattice. */
export function hallLineBuffer(shapes: HallShapes, extra: readonly Circle[] = []): Float32Array {
  const edges = boxEdgeBuffers(shapes.boxes);
  const b = contactBeacon();
  const lattice = latticeSegments(BEACON.mast.top - BEACON.base.h, 0.45, 0.14, 8);
  for (let k = 0; k < lattice.length; k += 3) {
    lattice[k] += b.mast.x;
    lattice[k + 1] += BEACON.base.h;
    lattice[k + 2] += b.mast.z;
  }
  const round = [...shapes.circles, ...extra].flatMap(circleSegments);
  const out = new Float32Array(edges.length + lattice.length + round.length);
  out.set(edges, 0);
  out.set(lattice, edges.length);
  out.set(round, edges.length + lattice.length);
  return out;
}
