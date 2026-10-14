import type { Rect, Vec2 } from "../../types";

/**
 * L3 Ops Control Room (owner approved 2026-10-14): "How I run AI in production" as a small control
 * room in the AI wing's inner pocket beside the Tech Reactor. Pure numbers; the scene is `OpsRoom.tsx`.
 */
export const OPS = {
  /** Footprint along x (the wing road) and z (toward the data spine). */
  w: 6,
  d: 6,
  /** Top of the screen wall: a tall camera column (`FloorLayout.tall`). */
  h: 5.6,
  /** Clear floor to the last inner pod of the AI wing (the space rules' 6 u). */
  gap: 6,
} as const;

/** Where `buildLabsLayout` puts the room. `facing` is the door's direction into the room along z. */
export interface OpsPlacement {
  rect: Rect;
  center: Vec2;
  door: Vec2;
  facing: -1 | 1;
}
