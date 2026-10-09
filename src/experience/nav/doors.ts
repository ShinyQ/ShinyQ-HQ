import type { RoomId } from "@/content/schema";
import type { DoorTrigger, Vec2 } from "../types";

export const DOOR_SIZE = 2;

/** The door whose square trigger zone contains `p`, if any. */
export function doorAt(doors: readonly DoorTrigger[] | undefined, p: Vec2): DoorTrigger | null {
  if (!doors) return null;
  for (const door of doors) {
    const half = (door.size ?? DOOR_SIZE) / 2;
    if (Math.abs(p.x - door.at.x) <= half && Math.abs(p.z - door.at.z) <= half) return door;
  }
  return null;
}

const SWEEP_STEP = 0.25;

/**
 * First door zone other than `skip` touched on the way from `a` to `b`. Slow frames (up to 0.25 s,
 * about 2 u at full speed) can carry the rover across a 2 u zone between two checks.
 */
export function doorAlong(doors: readonly DoorTrigger[] | undefined, a: Vec2, b: Vec2, skip: RoomId | null): DoorTrigger | null {
  const steps = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / SWEEP_STEP);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const door = doorAt(doors, { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t });
    if (door && door.room !== skip) return door;
  }
  return null;
}

/** Room whose zone the rover already used; it must leave the zone before that door fires again. */
export interface DoorLatch {
  room: RoomId | null;
}

export interface DoorStep {
  /** Phase is "explore" (no drawer, ride or overlay). */
  explore: boolean;
  /** The rover follows a path (click-to-move or mission autopilot). */
  following: boolean;
}

/**
 * Advances the latch for the zone the rover is in and returns the room to open, if any.
 * Doors fire only once the rover stands still in their zone or is driven manually, so a path
 * passing through a zone does not open it and a mission drive resolves before the drawer opens.
 */
export function stepDoorLatch(latch: DoorLatch, current: RoomId | null, { explore, following }: DoorStep): RoomId | null {
  if (!current) {
    latch.room = null;
    return null;
  }
  if (!explore) {
    // A room is already open (or a ride runs): standing here must not reopen it after closing.
    latch.room = current;
    return null;
  }
  if (current === latch.room || following) return null;
  latch.room = current;
  return current;
}
