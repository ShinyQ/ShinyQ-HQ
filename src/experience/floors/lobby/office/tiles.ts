import type { Vec2 } from "../../../types";
import type { OfficeWing } from "../officeLayout";

/** Merged-PR floor tiles (design 7.4): a 6 x 4 grid of 1.6 u tiles with 0.4 u gaps on the wing plaza, `z0` u past the slab edge S, on the wing's axis. */
export const TILES = { cols: 6, rows: 4, size: 1.6, gap: 0.4, z0: 3, y: 0.02, lit: 0.7, full: 1, dim: 0.08, fadeS: 0.6, gapS: 0.4 } as const;
export const TILE_COUNT = 24;
/** `STAGE_KIND.tile` (`hallStage.ts`), a literal so the office chunk does not import the hall modules. */
export const TILE_KIND = 5;

export function tileCenters(w: OfficeWing): Vec2[] {
  const pitch = TILES.size + TILES.gap;
  const x0 = w.lead.x - ((TILES.cols - 1) * pitch) / 2;
  const z0 = w.rect.minZ + TILES.z0 + TILES.size / 2;
  return Array.from({ length: TILE_COUNT }, (_, i) => ({ x: x0 + (i % TILES.cols) * pitch, z: z0 + Math.floor(i / TILES.cols) * pitch }));
}

const { dim: DIM, lit: LIT, full: FULL } = { dim: Math.fround(TILES.dim), lit: Math.fround(TILES.lit), full: 1 };

/**
 * One step of the fades toward the levels for `merged` PRs (writes `alpha`, a Float32Array, so the resting levels are
 * its rounded values): the first 24 settle at `lit` in merge order, the next 24 brighten to `full`, the rest `dim`. At
 * most one tile starts brightening per `gapS`, each over `fadeS`; dimming and reduced motion jump. Returns whether
 * anything changed and leaves the count of tiles at or over `lit` in `clock.lit`.
 */
export function stepTileAlpha(alpha: Float32Array, merged: number, clock: { next: number; lit: number }, t: number, dt: number, reduced: boolean): boolean {
  let changed = false;
  clock.lit = 0;
  for (let i = 0; i < TILE_COUNT; i++) {
    const a = alpha[i];
    const goal = merged > TILE_COUNT + i ? FULL : merged > i ? LIT : DIM;
    let next = goal;
    if (!reduced && goal > a) {
      // A tile off its resting levels is mid-fade and keeps going; one at rest waits for its turn.
      const moving = a !== DIM && a !== LIT;
      next = moving || t >= clock.next ? Math.min(goal, a + (dt * (FULL - DIM)) / TILES.fadeS) : a;
      if (!moving && next !== a) clock.next = t + TILES.gapS;
    }
    if (next !== a) {
      alpha[i] = next;
      changed = true;
    }
    if (alpha[i] >= LIT) clock.lit++;
  }
  return changed;
}
