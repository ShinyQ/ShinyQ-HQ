import { Matrix4 } from "three";
import type { Rect, Vec2 } from "../../../types";
import { DOCK, LIBRARY_FLOOR, type LibraryBay } from "../model";
import { SHELF, shelfSize } from "../shelf";
import { baySlots, SHELF_PLINTH, type ShelfSlot } from "../slots";
import { framed, openCover, slabMatrix } from "./vault";

/**
 * The L4 track shelves' scene, pure (three.js math only, Vitest runs it in node). A spine stands on its row's board
 * with its spine face (local +z) toward the road (`-bay.facing`), its thickness along the bay; the lead stands as a
 * Study Vault book, its cover on its right as seen from the road, hinged on the spine edge (`openCover`). The matrices
 * scale the kit's unit box (base at y 0).
 */

/** A pulled spine slides out `pull` u toward the road; pulls move at `rate` of the full travel per second. */
export const SHELF_SCENE = { pull: 0.3, rate: 1.6 } as const;
/** A spine pulls for the rover within this distance (u) of it, inside its bay zone. */
const NEAR = 6;

const LOCAL = new Matrix4();
const road = (f: Vec2): Vec2 => ({ x: -f.x, z: -f.z });

/** Instance matrix of a spine (or the lead's body) `pull` (0 to 1) of the way out toward the road. */
export function spineMatrix(slot: ShelfSlot, pull: number, facing: Vec2, out: Matrix4): Matrix4 {
  const k = pull * SHELF_SCENE.pull;
  return framed({ x: slot.at.x - facing.x * k, z: slot.at.z - facing.z * k }, road(facing), slot.y + SHELF_PLINTH, out, LOCAL.makeScale(slot.w, slot.h, slot.d));
}

/** Instance matrix of the lead's cover at `open` (0 shut, 1 open), the Study Vault's cover conventions. */
export const leadMatrix = (slot: ShelfSlot, open: number, facing: Vec2, out: Matrix4): Matrix4 => openCover(slot.at, road(facing), slot.y + SHELF_PLINTH, slot, open, out);

/**
 * A bay's frame: one board under each row (row 0 under the lead and the spines, the rows above under the spines only,
 * clear of the tall lead), then one back panel behind them, `SHELF.lead.d` deep and as tall as the lead or the rows.
 */
export function frameMatrices(bay: LibraryBay): Matrix4[] {
  const f = bay.facing;
  const lead = baySlots(bay)[0];
  const { rows, cols } = shelfSize(bay.posts.length);
  const first = SHELF.pad * 2 + SHELF.lead.w;
  const end = first + cols * SHELF.spine.pitch;
  // Along the bay, `t` from its left end as seen from the road: the lead's center is at `pad + lead.w / 2`.
  const mid = (t0: number, back = 0) => {
    const t = (t0 + end) / 2 - SHELF.pad - SHELF.lead.w / 2;
    return { x: lead.at.x - f.z * t + f.x * back, z: lead.at.z + f.x * t + f.z * back };
  };
  const out = Array.from({ length: rows }, (_, r) => {
    const t0 = r ? first : SHELF.pad;
    return slabMatrix(mid(t0), road(f), r * SHELF.rowH + SHELF_PLINTH, end - t0, SHELF.lead.d, new Matrix4());
  });
  const h = Math.max(SHELF.lead.h, rows * SHELF.rowH) + SHELF_PLINTH;
  out.push(framed(mid(SHELF.pad, SHELF.lead.d / 2), road(f), 0, new Matrix4(), LOCAL.makeScale(end - SHELF.pad, h, 0.1)));
  return out;
}

/** A bay's zone for the live spine: the bay, its forecourt and the near half of the road. */
export function bayZone({ rect: r, facing: f }: Pick<LibraryBay, "rect" | "facing">): Rect {
  const k = LIBRARY_FLOOR.road / 2 + DOCK.forecourt;
  return { minX: r.minX - Math.max(0, f.x) * k, maxX: r.maxX + Math.max(0, -f.x) * k, minZ: r.minZ - Math.max(0, f.z) * k, maxZ: r.maxZ + Math.max(0, -f.z) * k };
}

/**
 * The spine to pull: the hovered one (`L4:shelf:<slug>`), else the one nearest the rover at (`x`, `z`) within `NEAR`
 * while the rover is inside its bay zone; -1 for none.
 */
export function pickSpine(spines: readonly { slot: ShelfSlot; zone: Rect }[], hover: string | undefined, x: number, z: number): number {
  const slug = hover?.startsWith("L4:shelf:") ? hover.slice(9) : null;
  let pick = slug ? spines.findIndex((s) => s.slot.slug === slug) : -1;
  if (pick >= 0) return pick;
  let best = NEAR;
  for (let i = 0; i < spines.length; i++) {
    const { slot, zone } = spines[i];
    const d = Math.hypot(x - slot.at.x, z - slot.at.z);
    if (d < best && x >= zone.minX && x <= zone.maxX && z >= zone.minZ && z <= zone.maxZ) {
      best = d;
      pick = i;
    }
  }
  return pick;
}
