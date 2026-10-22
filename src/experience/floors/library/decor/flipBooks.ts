/**
 * Geometry data for open-book holograms (the newsroom featured stage): every book is three pages around a vertical
 * spine, a left and a right page held open and one page that turns. All books share one geometry, so
 * the whole floor's books cost one draw call. Pure (plain arrays): Vitest runs it in node.
 */

export interface BookInstance {
  x: number;
  y: number;
  z: number;
  /** Yaw the open book faces (forward is (sin, cos)). */
  face: number;
  /** Page height in world units (a page is 0.75 of it wide). */
  size: number;
  /** 0..1 offset of the page-turn cycle, so neighbouring books do not turn together. */
  phase: number;
}

/** Page angles held open (radians from the right side around the spine); -1 marks the turning page. */
export const PAGE_ANGLES = [0.18, Math.PI - 0.18, -1] as const;
export const PAGE_SEGMENTS = 6;

export interface BookBuffers {
  /** Page-local position: x 0..1 away from the spine, y -0.5..0.5. */
  positions: number[];
  centers: number[];
  faces: number[];
  sizes: number[];
  phases: number[];
  /** Fixed page angle, or -1 for the turning page. */
  angles: number[];
  indices: number[];
}

export function bookBuffers(books: readonly BookInstance[]): BookBuffers {
  const out: BookBuffers = { positions: [], centers: [], faces: [], sizes: [], phases: [], angles: [], indices: [] };
  for (const book of books) {
    for (const angle of PAGE_ANGLES) {
      const base = out.positions.length / 3;
      for (let i = 0; i <= PAGE_SEGMENTS; i++) {
        const u = i / PAGE_SEGMENTS;
        for (const v of [-0.5, 0.5]) {
          out.positions.push(u, v, 0);
          out.centers.push(book.x, book.y, book.z);
          out.faces.push(book.face);
          out.sizes.push(book.size);
          out.phases.push(book.phase);
          out.angles.push(angle);
        }
      }
      for (let i = 0; i < PAGE_SEGMENTS; i++) {
        const a = base + i * 2;
        out.indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
  }
  return out;
}

/**
 * Turning-page angle at time `t` (s) for a book with `phase`: rests on the right, turns over in the
 * middle of each 8 s cycle, rests on the left. Reduced motion holds it half open.
 */
export function turnAngle(t: number, phase: number, reducedMotion: boolean): number {
  if (reducedMotion) return Math.PI / 2;
  const cycle = (((t / 8 + phase) % 1) + 1) % 1;
  const k = Math.min(1, Math.max(0, (cycle - 0.3) / 0.4));
  return k * k * (3 - 2 * k) * Math.PI;
}

/** Open book over a stage (Newsroom featured post): `lift` above the plinth top, `size` page height. */
export const STAGE_BOOK = { lift: 2, size: 2.2 } as const;

/**
 * The turning book over a station: centered on it, `STAGE_BOOK.lift` above its top (`top`, the
 * plinth height), open toward the road (the station's `facing` points from the road into it).
 */
export function stageBook(station: { center: { x: number; z: number }; facing: { x: number; z: number } }, top: number, phase = 0): BookInstance {
  return {
    x: station.center.x,
    y: top + STAGE_BOOK.lift,
    z: station.center.z,
    face: Math.atan2(-station.facing.x, -station.facing.z),
    size: STAGE_BOOK.size,
    phase,
  };
}
