/**
 * Bookshelf geometry of an L4 reader track bay (floor-local, pure: no React or three). A bay holds one track:
 * the lead post as a tall cover at the bay end on the left as seen from the road, then the other posts as spines
 * to its right, row 0 at the bottom filled first, up to `maxRows` rows, then more columns (a longer bay). The slots
 * themselves (`slots.ts`) are built in the lazy L4 chunk only.
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

/** A bay door's camera zone: half size around the door and its zooms (phones: `classView.mobile`), the whole shelf in view. */
export const SHELF_VIEW = { zone: 2.5, zoom: 1.15, zoomPhone: 1.15 } as const;

/** Bay length along the road and its grid for `count` posts (the lead included). */
export function shelfSize(count: number): { along: number; rows: number; cols: number } {
  const spines = Math.max(0, count - 1);
  const rows = Math.min(SHELF.maxRows, Math.max(1, Math.ceil(spines / SHELF.perRow)));
  const cols = Math.max(1, Math.ceil(spines / rows));
  const along = Math.max(SHELF.minAlong, SHELF.pad * 2 + SHELF.lead.w + SHELF.pad + cols * SHELF.spine.pitch);
  return { along, rows, cols };
}
