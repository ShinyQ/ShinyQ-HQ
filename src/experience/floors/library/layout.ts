import type { DoorTrigger, Rect, Vec2 } from "../../types";

/** L4 Library element positions (appendix 01 section 5). Floor-local, pure. */
export const LIBRARY = {
  /** Two blog shelf rows; row 0 (z = -2) is nearest the elevator lane. Spines face +z. */
  shelves: { x: 2, w: 24, d: 1.2, h: 3.2, rows: [-2, -10] as const },
  spine: { w: 0.42, h: 2.3, d: 0.9, spacing: 1.8 },
  lectern: { x: -18, z: -7, w: 1.6, d: 1.2 },
  /** Framed plates face +z. */
  publications: { x: -4, z: 8, w: 20, d: 1, h: 2.6 },
  /** Small stage with a screen at its back edge, facing +z. */
  stage: { x: 16, z: 10, w: 7, d: 5, h: 0.4 },
} as const;

/** How far in front of an element the rover stops. */
const STOP_GAP = 2.2;

export interface SpineSlot {
  index: number;
  row: 0 | 1;
  /** Spine center on the shelf front. */
  x: number;
  z: number;
}

const rect = (cx: number, cz: number, w: number, d: number): Rect => ({
  minX: cx - w / 2,
  maxX: cx + w / 2,
  minZ: cz - d / 2,
  maxZ: cz + d / 2,
});

/**
 * Spine slots for `count` posts in `getPosts()` order (newest first): post i goes to row i % 2,
 * slot floor(i / 2), centered on the shelf. Spacing shrinks when a row would overflow.
 */
export function spineSlots(count: number): SpineSlot[] {
  const { shelves, spine } = LIBRARY;
  const perRow = [Math.ceil(count / 2), Math.floor(count / 2)];
  return Array.from({ length: count }, (_, index) => {
    const row = (index % 2) as 0 | 1;
    const slot = Math.floor(index / 2);
    const n = perRow[row];
    const spacing = Math.min(spine.spacing, (shelves.w - 2) / Math.max(1, n));
    return {
      index,
      row,
      x: shelves.x + (slot - (n - 1) / 2) * spacing,
      z: shelves.rows[row] + shelves.d / 2,
    };
  });
}

/** Where the rover parks to read post `index` of `count`. */
export function postStop(index: number, count: number): Vec2 {
  const slot = spineSlots(count)[index];
  if (!slot) return { x: LIBRARY.shelves.x, z: LIBRARY.shelves.rows[0] + LIBRARY.shelves.d / 2 + STOP_GAP };
  return { x: slot.x, z: slot.z + STOP_GAP };
}

const { publications, stage } = LIBRARY;

/** Mission stops for the non-post rooms on L4. */
export const LIBRARY_STOPS: Record<"publications" | "talks", Vec2> = {
  publications: { x: publications.x, z: publications.z + publications.d / 2 + STOP_GAP },
  talks: { x: stage.x, z: stage.z + stage.d / 2 + STOP_GAP },
};

/** Navgrid obstacles (before rover inflation). */
export function libraryObstacles(): Rect[] {
  const { shelves, lectern } = LIBRARY;
  return [
    ...shelves.rows.map((z) => rect(shelves.x, z, shelves.w, shelves.d)),
    rect(lectern.x, lectern.z, lectern.w, lectern.d),
    rect(publications.x, publications.z, publications.w, publications.d),
    rect(stage.x, stage.z, stage.w, stage.d),
  ];
}

/**
 * Door triggers for the publications shelf and the talks stage. Book spines have no trigger: a 1.8 u
 * spine pitch along the lane would open a post every few steps, so posts open by click, the lectern,
 * the palette or a mission (their stops come from `postStop`).
 */
export const LIBRARY_DOORS: DoorTrigger[] = [
  { room: "L4:publications", at: LIBRARY_STOPS.publications },
  { room: "L4:talks", at: LIBRARY_STOPS.talks },
];
