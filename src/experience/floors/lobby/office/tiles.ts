import type { Vec2 } from "../../../types";
import type { OfficeWing } from "../officeLayout";

/** Merged-PR floor tiles (design 7.4): a 6 x 4 grid of 1.6 u tiles with 0.4 u gaps on the wing plaza, `z0` u past the slab edge S, on the wing's axis. */
export const TILES = { cols: 6, rows: 4, size: 1.6, gap: 0.4, z0: 3, y: 0.02, lit: 0.7, full: 1, dim: 0.08, fadeS: 0.6, gapS: 0.4 } as const;
export const TILE_COUNT = 24;

export function tileCenters(w: OfficeWing): Vec2[] {
  const pitch = TILES.size + TILES.gap;
  const x0 = w.lead.x - ((TILES.cols - 1) * pitch) / 2;
  const z0 = w.rect.minZ + TILES.z0 + TILES.size / 2;
  return Array.from({ length: TILE_COUNT }, (_, i) => ({ x: x0 + (i % TILES.cols) * pitch, z: z0 + Math.floor(i / TILES.cols) * pitch }));
}

/** Target alpha per tile for `merged` PRs (writes `out`): the first 24 at `lit` in merge order, the next 24 brighten to `full`, the rest `dim`. */
export function tileLevels(merged: number, out: Float32Array): Float32Array {
  for (let i = 0; i < TILE_COUNT; i++) out[i] = merged > TILE_COUNT + i ? TILES.full : merged > i ? TILES.lit : TILES.dim;
  return out;
}

/** One step of the fades toward `target` (writes `alpha`): at most one tile starts brightening per `gapS`, each over `fadeS`; reduced motion jumps. Returns whether anything changed. */
export function stepTileAlpha(alpha: Float32Array, target: Float32Array, clock: { next: number }, t: number, dt: number, reduced: boolean): boolean {
  let changed = false;
  for (let i = 0; i < TILE_COUNT; i++) {
    const a = alpha[i];
    const goal = target[i];
    if (a === goal) continue;
    let next = goal;
    if (!reduced && goal > a) {
      // A tile not yet moving waits for its turn; one that is moving keeps going.
      const moving = a > TILES.dim && a < TILES.full && a !== TILES.lit;
      if (!moving && t < clock.next) continue;
      if (!moving) clock.next = t + TILES.gapS;
      next = Math.min(goal, a + (dt * (TILES.full - TILES.dim)) / TILES.fadeS);
    }
    alpha[i] = next;
    changed = true;
  }
  return changed;
}
