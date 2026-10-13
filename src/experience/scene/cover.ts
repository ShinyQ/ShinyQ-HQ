/**
 * Whether opaque HUD panels hide the 3D canvas (round 5 P3, perf report D 8.3). Panels that can
 * cover the world carry `data-hq-cover`; rendering pauses while one of them hides more than
 * COVER_PAUSE of the viewport (the canvas is full-viewport). Pure: unit-tested in node.
 */
export const COVER_ATTR = "data-hq-cover";
/** Main spec 2.6: the world stays animated behind the side panel and the 55% sheet; the 92% sheet and full-screen panels pause it. */
export const COVER_PAUSE = 0.9;

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Largest share (0 to 1) of a `width` x `height` viewport that one box hides. */
export function coveredFraction(width: number, height: number, boxes: readonly Box[]): number {
  const area = width * height;
  if (area <= 0) return 0;
  let best = 0;
  for (const b of boxes) {
    const w = Math.max(0, Math.min(b.right, width) - Math.max(b.left, 0));
    const h = Math.max(0, Math.min(b.bottom, height) - Math.max(b.top, 0));
    best = Math.max(best, (w * h) / area);
  }
  return best;
}

export function isCovered(width: number, height: number, boxes: readonly Box[]): boolean {
  return coveredFraction(width, height, boxes) > COVER_PAUSE;
}
