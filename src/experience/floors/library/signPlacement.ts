/**
 * Screen-space placement of the L4 timeline signs (Round 7 declutter): which floating labels may show
 * this frame so none covers another. Pure: callers project each sign's plate to CSS pixels and read the
 * result every frame. Tier order: picked post titles, then section signs, then year marks, then the other
 * post titles; within a tier the nearest label goes first. Each kind has a cap, titles past `TITLE_RANGE`
 * never show unless picked, and `fixed` boxes (signs already on screen elsewhere) count as occupied space.
 */
import { boxesOverlap, LABEL_GAP, type ScreenBox } from "../../fx/labelPlacement";
import type { LibrarySignKind } from "./decor/signs";

export interface LibraryLabel {
  kind: LibrarySignKind;
  /** Projected plate in CSS pixels; null when the sign is behind the camera or off screen. */
  box: ScreenBox | null;
  /** Distance from the rover (world units). */
  distance: number;
  /** A title the visitor picked (topic or station): it places first and ignores `TITLE_RANGE`. */
  picked?: boolean;
}

/** Shown-label caps per kind (titles on phones get fewer). */
export const LIBRARY_LABEL_MAX = { title: { wide: 6, narrow: 4 }, section: 4, year: 3 } as const;
/** Titles farther than this (world units) stay hidden unless picked. */
export const TITLE_RANGE = 28;

function tier(label: LibraryLabel): number {
  if (label.kind === "title") return label.picked ? 0 : 3;
  return label.kind === "section" ? 1 : 2;
}

/** Shown flags in input order. Ties keep input order, so the result is stable frame to frame. */
export function placeLibraryLabels(
  labels: readonly LibraryLabel[],
  { narrow, fixed = [] }: { narrow: boolean; fixed?: readonly ScreenBox[] },
): boolean[] {
  const order = labels
    .map((_, i) => i)
    .sort((a, b) => tier(labels[a]) - tier(labels[b]) || labels[a].distance - labels[b].distance || a - b);
  const cap: Record<LibrarySignKind, number> = {
    title: narrow ? LIBRARY_LABEL_MAX.title.narrow : LIBRARY_LABEL_MAX.title.wide,
    section: LIBRARY_LABEL_MAX.section,
    year: LIBRARY_LABEL_MAX.year,
  };
  const used: Record<LibrarySignKind, number> = { title: 0, section: 0, year: 0 };
  const placed: ScreenBox[] = [...fixed];
  const shown = labels.map(() => false);
  for (const i of order) {
    const label = labels[i];
    const { box, kind } = label;
    if (!box || used[kind] >= cap[kind]) continue;
    if (kind === "title" && !label.picked && label.distance > TITLE_RANGE) continue;
    if (placed.some((p) => boxesOverlap(p, box, LABEL_GAP))) continue;
    shown[i] = true;
    placed.push(box);
    used[kind] += 1;
  }
  return shown;
}
