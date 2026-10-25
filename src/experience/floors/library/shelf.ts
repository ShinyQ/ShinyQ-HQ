import type { Rect, Vec2 } from "../../types";
import type { LibraryBay } from "./model";

/**
 * Bookshelf geometry of an L4 reader track bay (floor-local, pure: no React or three). A bay holds one track:
 * the lead post as a tall cover at the bay end on the left as seen from the road, then the other posts as spines
 * to its right, row 0 at the bottom filled first, up to `maxRows` rows, then more columns (a longer bay).
 */
export const SHELF = {
  /** Bay depth across the road. */
  across: 6,
  /** Spine thickness along the bay, slot pitch, depth, tallest height and the height range taken off by the hash. */
  spine: { w: 0.5, pitch: 0.65, d: 1.4, h: 1.6, dh: 0.3 },
  perRow: 13,
  maxRows: 3,
  /** Height of one shelf row (row `r` stands at `r * rowH`). */
  rowH: 1.9,
  /** The lead post's cover. */
  lead: { w: 1.6, d: 2.4, h: 3.6 },
  /** Clear gap at the bay ends and between the lead and the first spine. */
  pad: 1,
  minAlong: 8,
} as const;

/** Bay length along the road and its grid for `count` posts (the lead included). */
export function shelfSize(count: number): { along: number; rows: number; cols: number } {
  const spines = Math.max(0, count - 1);
  const rows = Math.min(SHELF.maxRows, Math.max(1, Math.ceil(spines / SHELF.perRow)));
  const cols = Math.max(1, Math.ceil(spines / rows));
  const along = Math.max(SHELF.minAlong, SHELF.pad * 2 + SHELF.lead.w + SHELF.pad + cols * SHELF.spine.pitch);
  return { along, rows, cols };
}

/** Board thickness under each row (the vault's plinth): every slot's base stands this high above its row. */
export const SHELF_PLINTH = 0.24;

export interface ShelfSlot {
  slug: string;
  lead: boolean;
  /** Footprint center. */
  at: Vec2;
  /** Base height (the row's shelf; the slot itself stands `SHELF_PLINTH` higher). */
  y: number;
  /** Size along the bay, across it and up. */
  w: number;
  d: number;
  h: number;
  /** Axis-aligned footprint. */
  rect: Rect;
}

/** A small deterministic string hash in [0, 1) (FNV-1a). */
function hash01(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return (h >>> 0) / 0x100000000;
}

/** Slots for `posts` (lead first) in `bay`; `facing` points from the road into the bay. */
export function shelfSlots(bay: Pick<LibraryBay, "center" | "facing" | "rect">, posts: readonly string[]): ShelfSlot[] {
  const { center, facing: f, rect } = bay;
  // Left of a viewer on the road looking along `facing`.
  const left = { x: f.z, z: -f.x };
  const along = Math.abs(left.x) * (rect.maxX - rect.minX) + Math.abs(left.z) * (rect.maxZ - rect.minZ);
  const { cols } = shelfSize(posts.length);
  const slot = (slug: string, lead: boolean, t: number, y: number, w: number, d: number, h: number): ShelfSlot => {
    const at = { x: center.x + left.x * (along / 2 - t) + 0, z: center.z + left.z * (along / 2 - t) + 0 };
    const hx = (Math.abs(left.x) * w + Math.abs(f.x) * d) / 2;
    const hz = (Math.abs(left.z) * w + Math.abs(f.z) * d) / 2;
    return { slug, lead, at, y, w, d, h, rect: { minX: at.x - hx, maxX: at.x + hx, minZ: at.z - hz, maxZ: at.z + hz } };
  };
  const S = SHELF.spine;
  const first = SHELF.pad + SHELF.lead.w + SHELF.pad;
  return posts.map((slug, i) => {
    if (i === 0) return slot(slug, true, SHELF.pad + SHELF.lead.w / 2, 0, SHELF.lead.w, SHELF.lead.d, SHELF.lead.h);
    const r = Math.floor((i - 1) / cols);
    const c = (i - 1) % cols;
    return slot(slug, false, first + (c + 0.5) * S.pitch, r * SHELF.rowH, S.w, S.d, S.h - S.dh * hash01(slug));
  });
}
