/**
 * Screen-space placement of the L4 timeline signs: which floating labels may show this frame so none covers
 * another. Pure: callers project each sign's plate to CSS pixels and read the result every frame. Tier order:
 * picked lead and spine titles (the picked topic's posts), the live spine (the pulled one), the track names, the
 * lead titles, then the desk sections; within a tier the nearest label goes first. Each kind has a cap, titles past
 * `TITLE_RANGE` never show unless picked, a spine shows only live or picked, and `fixed` boxes (signs already on
 * screen elsewhere, the rover) count as occupied space.
 */
import { boxesOverlap, LABEL_GAP, type ScreenBox } from "../../fx/labelPlacement";
import type { LibrarySignKind } from "./decor/signs";

export interface LibraryLabel {
  kind: LibrarySignKind;
  /** Projected plate in CSS pixels; null when the sign is behind the camera or off screen. */
  box: ScreenBox | null;
  /** Distance from the rover (world units). */
  distance: number;
  /** A lead or spine title of the picked topic: it places first and ignores `TITLE_RANGE`. */
  picked?: boolean;
  /** The pulled spine's title: a spine label is a candidate only when live or picked. */
  live?: boolean;
}

/** Shown-label caps per kind (lead titles on phones get fewer). */
export const LIBRARY_LABEL_MAX = { section: 4, track: 4, lead: { wide: 4, narrow: 2 }, spine: 1 } as const;
/** Titles farther than this (world units) stay hidden unless picked. */
export const TITLE_RANGE = 28;

const TIER: Record<LibrarySignKind, number> = { spine: 1, track: 2, lead: 3, section: 4 };
const tier = (label: LibraryLabel) => (label.picked ? 0 : TIER[label.kind]);

/** Shown flags in input order. Ties keep input order, so the result is stable frame to frame. */
export function placeLibraryLabels(
  labels: readonly LibraryLabel[],
  { narrow, fixed = [] }: { narrow: boolean; fixed?: readonly ScreenBox[] },
): boolean[] {
  const order = labels
    .map((_, i) => i)
    .sort((a, b) => tier(labels[a]) - tier(labels[b]) || labels[a].distance - labels[b].distance || a - b);
  const cap: Record<LibrarySignKind, number> = { ...LIBRARY_LABEL_MAX, lead: narrow ? LIBRARY_LABEL_MAX.lead.narrow : LIBRARY_LABEL_MAX.lead.wide };
  const used: Record<LibrarySignKind, number> = { section: 0, track: 0, lead: 0, spine: 0 };
  const placed: ScreenBox[] = [...fixed];
  const shown = labels.map(() => false);
  for (const i of order) {
    const label = labels[i];
    const { box, kind } = label;
    if (!box || used[kind] >= cap[kind]) continue;
    if (kind === "spine" && !label.live && !label.picked) continue;
    if ((kind === "lead" || kind === "spine") && !label.picked && label.distance > TITLE_RANGE) continue;
    if (placed.some((p) => boxesOverlap(p, box, LABEL_GAP))) continue;
    shown[i] = true;
    placed.push(box);
    used[kind] += 1;
  }
  return shown;
}
