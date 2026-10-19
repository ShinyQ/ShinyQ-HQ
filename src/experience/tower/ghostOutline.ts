import type { FloorId } from "@/content/schema";
import { ceilingOpacity, FIRST_PERSON } from "../camera/firstPerson";
import type { ViewZone } from "../camera/orbit";
import { floorY } from "../config";
import type { FloorLayout, Rect } from "../types";

/**
 * The ghost outline of the floors above the rover (owner decision 2026-10-20, option a). Above the rover a floor's
 * slab turns into a ghost (`FloorLevel`) whose accent outline stays faintly visible; from the L1 office wing the follow
 * camera looks south past the L1 slab edge, and the L2 outline above it crossed the office view. The outline (not the
 * ghost fill) hides only while the rover stands in an area its floor marks (`FloorLayout.hideGhostAbove`: the office
 * wing) or in a view zone flagged `hideGhostAbove` (the office stop); everywhere else, the spawn included, it stays.
 */

const within = (r: Rect, x: number, z: number) => x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ;

/**
 * True while `floor`'s ghost outline should hide: `floor` is above the rover (the `FloorLevel` ghost rule) and the
 * rover stands in one of its floor layout's `hideGhostAbove` rects or flagged view zones. No allocation (every frame).
 */
export function ghostOutlineHidden(
  floor: FloorId,
  rover: { x: number; y: number; z: number },
  layout: { hideGhostAbove?: FloorLayout["hideGhostAbove"]; viewZones?: readonly ViewZone[] } | undefined,
): boolean {
  if (!layout || floorY(floor) <= rover.y + 0.5) return false;
  const rects = layout.hideGhostAbove;
  if (rects) for (let i = 0; i < rects.length; i++) if (within(rects[i], rover.x, rover.z)) return true;
  const zones = layout.viewZones;
  if (zones) for (let i = 0; i < zones.length; i++) if (zones[i].hideGhostAbove && within(zones[i].area, rover.x, rover.z)) return true;
  return false;
}

/**
 * Advances the outline's hide amount (0 shown, 1 hidden) toward `hidden` at the ghost floors' own fade rate (they fade
 * with the first person glide, `FIRST_PERSON.glide`), linear in `dt`; a cut under reduced motion.
 */
export function stepGhostOutline(hide: number, hidden: boolean, dt: number, reduced: boolean): number {
  const goal = hidden ? 1 : 0;
  if (hide === goal) return hide;
  if (reduced) return goal;
  const step = dt / FIRST_PERSON.glide;
  return goal > hide ? Math.min(goal, hide + step) : Math.max(goal, hide - step);
}

/** The outline's opacity factor for a hide amount: the ghost floors' eased fade curve (`ceilingOpacity`). */
export function ghostOutlineOpacity(hide: number): number {
  return ceilingOpacity(hide);
}
