import type { Interactable } from "../../interact/registry";
import type { LibraryData, Rect, Vec2 } from "../../types";
import { roomOfPost, type LibraryBay } from "./model";
import { SHELF, shelfSize } from "./shelf";

/**
 * The post slots on an L4 reader track bay's shelf (`shelf.ts` has the sizes). Only the lazy L4 chunk reads them (the
 * shelves, their signs and icons, and the spine targets), so they stay off the main 3D path. Pure: no React or three.
 */

/** Board thickness under each row (the vault's plinth): every slot's base stands this high above its row. */
export const SHELF_PLINTH = 0.24;

/** One post's slot on a shelf; the first slot of a bay is the lead's. */
export interface ShelfSlot {
  slug: string;
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

/** A bay's slots, one per post in `bay.posts` order (lead first); `facing` points from the road into the bay. */
export function baySlots(bay: Pick<LibraryBay, "center" | "facing" | "rect" | "posts">): ShelfSlot[] {
  const { center, facing: f, rect, posts } = bay;
  // Left of a viewer on the road looking along `facing`.
  const left = { x: f.z, z: -f.x };
  const along = Math.abs(left.x) * (rect.maxX - rect.minX) + Math.abs(left.z) * (rect.maxZ - rect.minZ);
  const { cols } = shelfSize(posts.length);
  const slot = (slug: string, t: number, y: number, w: number, d: number, h: number): ShelfSlot => {
    const at = { x: center.x + left.x * (along / 2 - t) + 0, z: center.z + left.z * (along / 2 - t) + 0 };
    const hx = (Math.abs(left.x) * w + Math.abs(f.x) * d) / 2;
    const hz = (Math.abs(left.z) * w + Math.abs(f.z) * d) / 2;
    return { slug, at, y, w, d, h, rect: { minX: at.x - hx, maxX: at.x + hx, minZ: at.z - hz, maxZ: at.z + hz } };
  };
  const S = SHELF.spine;
  const first = SHELF.pad + SHELF.lead.w + SHELF.pad;
  return posts.map((slug, i) => {
    if (i === 0) return slot(slug, SHELF.pad + SHELF.lead.w / 2, 0, SHELF.lead.w, SHELF.lead.d, SHELF.lead.h);
    const r = Math.floor((i - 1) / cols);
    const c = (i - 1) % cols;
    return slot(slug, first + (c + 0.5) * S.pitch, r * SHELF.rowH, S.w, S.d, S.h - S.dh * hash01(slug));
  });
}

/**
 * The reader track bays' point-and-go targets, registered by `Library` while L4 is mounted: one per post on its shelf
 * (the spine, the lead's cover), each driving to the bay door and then opening the post drawer there. They join the hint
 * group the bay door leads (`baseInteractables` in interact/registry.ts), under the track's name.
 */
export function shelfTargets(bays: readonly LibraryBay[], library: Pick<LibraryData, "posts" | "tracks">, readPost: (title: string) => string): Interactable[] {
  return bays.flatMap((bay) => {
    const group = { id: bay.room, label: library.tracks.find((t) => t.slug === bay.track)?.label ?? bay.room.slice(3) };
    return baySlots(bay).map(
      (slot): Interactable => ({
        id: `L4:shelf:${slot.slug}`,
        floor: "L4",
        kind: "station",
        label: readPost(library.posts.find((p) => p.slug === slot.slug)?.title ?? slot.slug),
        at: bay.stop,
        bounds: slot.rect,
        base: slot.y,
        height: slot.y + SHELF_PLINTH + slot.h,
        action: { type: "command", command: `open:${roomOfPost(slot.slug)}` },
        group,
      }),
    );
  });
}
