import { boxBuffers, boxEdgeBuffers, latticeSegments, type Box } from "../roof/solids";
import { ABOUT, BEACON, contactBeacon, experienceArch, monoliths, nowArch, winsFace, type Face } from "./hallGallery";
import { gatePillars, HALL, hallPartitions } from "./hallLayout";

/**
 * Pure buffers for the gallery solids (no three): boxes (turned or not) plus round prisms (the About me
 * pedestal, the beacon head) in one indexed mesh, and every neon line (box edges, prism rims, the
 * portrait ring, the beacon lattice) in one line-segment buffer.
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

/** Boxes, prisms and quads in one indexed buffer (one draw call). */
export function solidBuffers(boxes: readonly Box[], prisms: readonly Prism[], quads: readonly Quad[] = []) {
  const parts = [boxBuffers(boxes), prismBuffers(prisms), quadBuffers(quads)];
  const total = (k: "positions" | "normals" | "indices") => parts.reduce((n, p) => n + p[k].length, 0);
  const positions = new Float32Array(total("positions"));
  const normals = new Float32Array(total("normals"));
  const indices = new Uint32Array(total("indices"));
  let v = 0;
  let i = 0;
  for (const p of parts) {
    positions.set(p.positions, v * 3);
    normals.set(p.normals, v * 3);
    indices.set(p.indices.map((k) => k + v), i);
    v += p.positions.length / 3;
    i += p.indices.length;
  }
  return { positions, normals, indices };
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

/** A one-sided quad (seen only from the side its normal, `right` x `up`, points to): the hall's inner walls, floor and ceiling. */
export interface Quad {
  x: number;
  y: number;
  z: number;
  right: [number, number, number];
  up: [number, number, number];
  w: number;
  h: number;
}

export interface HallShapes {
  boxes: Box[];
  prisms: Prism[];
  circles: Circle[];
  quads: Quad[];
}

/** The B4 enclosure (owner decision 2026-11-04): wall height, the ceiling's height (seen only from below) and the floor's lift. */
export const ENCLOSURE = { wall: 9.5, ceiling: 12.6, floor: 0.02 } as const;

/**
 * The hall's enclosure as one-sided quads facing in: dark indigo walls on the north, east and south slab edges, the floor
 * and a ceiling seen only from below, so a camera outside a wall (or above the ceiling) looks straight through. Split at
 * the hall's part lines (z S, the contact corner), so each part's view hides its own.
 */
export function enclosureQuads(): Quad[] {
  const { maxX, minZ, maxZ } = HALL.zone;
  const west = HALL.partition.line + HALL.partition.thickness;
  const north = hallPartitions()[0].maxX;
  const S = HALL.lead[0].z + 6;
  const cx = HALL.stations.contact.maxX + 1;
  const cz = HALL.stations.contact.minZ - 8;
  const E = ENCLOSURE;
  const X: [number, number, number] = [1, 0, 0];
  const Y: [number, number, number] = [0, 1, 0];
  const out: Quad[] = [];
  const wall = (x0: number, z0: number, x1: number, z1: number) => {
    const w = Math.hypot(x1 - x0, z1 - z0);
    out.push({ x: (x0 + x1) / 2, y: E.wall / 2, z: (z0 + z1) / 2, right: [(x1 - x0) / w, 0, (z1 - z0) / w], up: Y, w, h: E.wall });
  };
  const inset = 0.02;
  wall(north, minZ + inset, maxX, minZ + inset);
  wall(maxX - inset, minZ, maxX - inset, S);
  wall(maxX - inset, S, maxX - inset, maxZ);
  wall(maxX, maxZ - inset, cx, maxZ - inset);
  wall(cx, maxZ - inset, west, maxZ - inset);
  const flat = (x0: number, z0: number, x1: number, z1: number) => {
    const x = (x0 + x1) / 2;
    const z = (z0 + z1) / 2;
    out.push({ x, y: E.floor, z, right: X, up: [0, 0, -1], w: x1 - x0, h: z1 - z0 });
    out.push({ x, y: E.ceiling, z, right: X, up: [0, 0, 1], w: x1 - x0, h: z1 - z0 });
  };
  flat(north, minZ, maxX, S);
  flat(west, S, maxX, cz);
  flat(cx, cz, maxX, maxZ);
  flat(west, cz, cx, maxZ);
  return out;
}

/** Quad buffers: four corners and two triangles each, wound so the quad faces along `right` x `up`. */
export function quadBuffers(quads: readonly Quad[]): { positions: Float32Array; normals: Float32Array; indices: Uint32Array } {
  const positions = new Float32Array(quads.length * 12);
  const normals = new Float32Array(quads.length * 12);
  const indices = new Uint32Array(quads.length * 6);
  quads.forEach((q, i) => {
    const [rx, ry, rz] = q.right;
    const [ux, uy, uz] = q.up;
    const n = [ry * uz - rz * uy, rz * ux - rx * uz, rx * uy - ry * ux];
    const corner = (a: number, b: number) => [q.x + (rx * a * q.w + ux * b * q.h) / 2, q.y + (ry * a * q.w + uy * b * q.h) / 2, q.z + (rz * a * q.w + uz * b * q.h) / 2];
    [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)].forEach((p, k) => {
      positions.set(p, i * 12 + k * 3);
      normals.set(n, i * 12 + k * 3);
    });
    const v = i * 4;
    indices.set([v, v + 1, v + 2, v, v + 2, v + 3], i * 6);
  });
  return { positions, normals, indices };
}

const PEDESTAL_SIDES = 28;
/** Height of the partitions' dark plinths. */
const PLINTH = 0.25;

/** Every solid of the gallery: gateway arch, the pedestals, the monoliths, the two lit arches, the beacon and its card, the partition plinths. */
export function hallShapes(projectCount: number, resultCount: number = 3): HallShapes {
  const g = HALL.gate;
  const boxes: Box[] = [];
  const prisms: Prism[] = [];
  const circles: Circle[] = [];
  const quads = enclosureQuads();
  // Gateway arch: pillars and the lintel the rover drives under.
  for (const p of gatePillars()) boxes.push({ x: (p.minX + p.maxX) / 2, z: (p.minZ + p.maxZ) / 2, y: 0, w: p.maxX - p.minX, d: p.maxZ - p.minZ, h: g.h });
  boxes.push({ x: g.x, z: (g.north.minZ + g.south.maxZ) / 2, y: g.h - g.lintel, w: g.depth, d: g.south.maxZ - g.north.minZ, h: g.lintel });
  // About me and wins: two-step round pedestals; rims glow, the portrait and the placings count get a neon ring.
  const top = ABOUT.base.h + ABOUT.column.h;
  for (const a of [ABOUT.center, winsFace().origin]) {
    prisms.push({ x: a.x, z: a.z, y: 0, h: ABOUT.base.h, r: ABOUT.base.r, sides: PEDESTAL_SIDES });
    prisms.push({ x: a.x, z: a.z, y: ABOUT.base.h, h: ABOUT.column.h, r: ABOUT.column.r, sides: PEDESTAL_SIDES });
    circles.push({ x: a.x, y: ABOUT.base.h + 0.005, z: a.z, r: ABOUT.base.r, segments: PEDESTAL_SIDES });
    circles.push({ x: a.x, y: top + 0.005, z: a.z, r: ABOUT.column.r, segments: PEDESTAL_SIDES });
  }
  // Top projects and results: the monoliths.
  for (const m of monoliths(projectCount)) boxes.push(m.box);
  for (const m of monoliths(resultCount, "results")) boxes.push(m.box);
  // Work experience and now: the lit arches.
  for (const arch of [experienceArch(), nowArch()]) boxes.push(...arch.pillars, arch.lintel);
  // Contact: beacon base, a thin core, crossbars, the head, and the floating card.
  const b = contactBeacon();
  const B = BEACON;
  boxes.push({ x: b.mast.x, z: b.mast.z, y: 0, w: B.base.w, d: B.base.w, h: B.base.h });
  boxes.push({ x: b.mast.x, z: b.mast.z, y: B.base.h, w: 0.16, d: 0.16, h: B.mast.top - B.base.h });
  for (const bar of B.bars) boxes.push({ x: b.mast.x, z: b.mast.z, y: bar.y, w: bar.w, d: 0.1, h: 0.1 }, { x: b.mast.x, z: b.mast.z, y: bar.y + 0.12, w: 0.1, d: bar.w, h: 0.1 });
  prisms.push({ x: b.mast.x, z: b.mast.z, y: B.mast.top, h: B.head.h, r: B.head.r, sides: 12 });
  circles.push({ x: b.mast.x, y: B.mast.top + B.head.h + 0.005, z: b.mast.z, r: B.head.r, segments: 12 });
  boxes.push(b.card.box);
  // The west partitions' low plinths (their glass and violet rail are shell instances, `hallShellInstances`).
  for (const p of hallPartitions()) boxes.push({ x: (p.minX + p.maxX) / 2, z: (p.minZ + p.maxZ) / 2, y: 0, w: p.maxX - p.minX, d: p.maxZ - p.minZ, h: PLINTH });
  return { boxes, prisms, circles, quads };
}

/** The portrait hologram's neon ring (upright, on the About me face). */
export function portraitRing(face: Face): Circle {
  return { x: face.origin.x + face.out.x * 0.02, y: ABOUT.disc.y, z: face.origin.z + face.out.z * 0.02, r: ABOUT.disc.r + 0.08, segments: 40, face };
}

/**
 * The shapes of one hall part (by their centre, `partOf`): the hall draws its parts as separate groups, each culled on its
 * own (`HallView`), so a view that only reaches one part never draws the others' meshes.
 */
export function partShapes<K extends string>(shapes: HallShapes, partOf: (x: number, z: number) => K, part: K): HallShapes {
  const mine = (p: { x: number; z: number }) => partOf(p.x, p.z) === part;
  return { boxes: shapes.boxes.filter(mine), prisms: shapes.prisms.filter(mine), circles: shapes.circles.filter(mine), quads: shapes.quads.filter(mine) };
}

/** Every neon line of the gallery as segment pairs: box edges, prism rims, circles and (with `lattice`) the beacon lattice. */
export function hallLineBuffer(shapes: HallShapes, extra: readonly Circle[] = [], lattice: boolean = true): Float32Array {
  const edges = boxEdgeBuffers(shapes.boxes);
  if (!lattice) {
    const round = [...shapes.circles, ...extra].flatMap(circleSegments);
    const out = new Float32Array(edges.length + round.length);
    out.set(edges, 0);
    out.set(round, edges.length);
    return out;
  }
  return withLattice(edges, [...shapes.circles, ...extra]);
}

function withLattice(edges: Float32Array, circles: readonly Circle[]): Float32Array {
  const b = contactBeacon();
  const lattice = latticeSegments(BEACON.mast.top - BEACON.base.h, 0.45, 0.14, 8);
  for (let k = 0; k < lattice.length; k += 3) {
    lattice[k] += b.mast.x;
    lattice[k + 1] += BEACON.base.h;
    lattice[k + 2] += b.mast.z;
  }
  const round = circles.flatMap(circleSegments);
  const out = new Float32Array(edges.length + lattice.length + round.length);
  out.set(edges, 0);
  out.set(lattice, edges.length);
  out.set(round, edges.length + lattice.length);
  return out;
}
