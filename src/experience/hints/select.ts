import { labelAnchor } from "../interact/pick";
import type { Interactable } from "../interact/registry";
import type { Vec2 } from "../types";

/** Hint bubble tuning (u, seconds). */
export const HINT = {
  /** A bubble shows for the nearest target whose approach point (`at`) is this close. */
  radius: 5,
  /** The shown bubble stays until the rover is this far from it (no flicker at the edge). */
  keep: 6,
  /** Another target must be this much nearer to take the bubble over. */
  margin: 0.5,
  /** Height above point-and-go's hover label (`labelAnchor`), so the bubble and the label never overlap. */
  lift: 1.1,
  /** Selection runs 10 times a second; the bubble position every frame. */
  everyS: 0.1,
} as const;

const distance = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);

/**
 * Go of a group's bubble: a command no feature handles (`parseCommand` gives null), so point-and-go only drives to the
 * group's shared approach point (and its camera view) without opening any one of the targets.
 */
export const GROUP_HINT_COMMAND = "settle";

/**
 * The hint candidates: grouped targets (`Interactable.group`, the L4 Study Vault's books, which share one approach
 * point) become one target under the group's id and label, at the first member's approach point, whose Go only drives
 * there. Without groups the list comes back as it is.
 */
export function hintTargets(items: readonly Interactable[]): readonly Interactable[] {
  if (!items.some((item) => item.group)) return items;
  const seen = new Set<string>();
  return items.flatMap((item) => {
    const group = item.group;
    if (!group) return [item];
    if (seen.has(group.id)) return [];
    seen.add(group.id);
    return [{ ...item, id: group.id, label: group.label, action: { type: "command", command: GROUP_HINT_COMMAND }, group: undefined }];
  });
}

/** The one target to show a bubble for: nearest within `HINT.radius`, sticky within `HINT.keep`. */
export function nearestHint<T extends { id: string; at: Vec2 }>(items: readonly T[], rover: Vec2, current: T | null = null): T | null {
  let best: T | null = null;
  let bestD = Infinity;
  for (const item of items) {
    const d = distance(item.at, rover);
    if (d <= HINT.radius && d < bestD) {
      best = item;
      bestD = d;
    }
  }
  if (current) {
    const kept = items.find((item) => item.id === current.id);
    if (kept) {
      const d = distance(kept.at, rover);
      if (d <= HINT.keep && (!best || d <= bestD + HINT.margin)) return kept;
    }
  }
  return best;
}

/** World point the bubble's tail points at: straight above point-and-go's hover label for the target. */
export function hintAnchor(item: Pick<Interactable, "at" | "kind">, floorY: number): { x: number; y: number; z: number } {
  const [x, y, z] = labelAnchor(item);
  return { x, y: floorY + y + HINT.lift, z };
}
