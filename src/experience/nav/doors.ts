import type { RoomId } from "@/content/schema";
import type { DoorTrigger, Vec2 } from "../types";

/** Trigger pad depth along the approach (the glowing pad in front of a door, not its whole glow). */
export const DOOR_SIZE = 1.6;
/** Trigger pad width across a door that has a `facing` (the door opening), so a straight drive lands on it. */
export const DOOR_WIDTH = 2.4;
/** A rover driving through a pad faster than this needs to stay DOOR_DWELL seconds before the room opens. */
export const DOOR_SLOW = 2;
export const DOOR_DWELL = 0.25;

/** Gap kept between a floor lane's end and a door pad, so lanes never run over a trigger. */
export const LANE_CLEAR = 0.5;

/** End point for a lane from `from` toward the door pad at `to`: it stops before the pad edge. */
export function towardPad(from: [number, number], to: { x: number; z: number }, gap = DOOR_WIDTH / 2 + LANE_CLEAR): [number, number] {
  const dx = to.x - from[0];
  const dz = to.z - from[1];
  const len = Math.hypot(dx, dz) || 1;
  const k = Math.max(0, len - gap) / len;
  return [from[0] + dx * k, from[1] + dz * k];
}

/** Half extents of a door's pad: DOOR_SIZE deep along `facing`, DOOR_WIDTH across (square without a facing). */
export function padHalf(door: DoorTrigger): { along: number; across: number } {
  const along = (door.size ?? DOOR_SIZE) / 2;
  return { along, across: door.facing ? Math.max(along, DOOR_WIDTH / 2) : along };
}

/** Whether `p` is on the door's trigger pad. */
export function onPad(door: DoorTrigger, p: Vec2): boolean {
  const dx = p.x - door.at.x;
  const dz = p.z - door.at.z;
  const { along, across } = padHalf(door);
  if (!door.facing) return Math.abs(dx) <= along && Math.abs(dz) <= along;
  const a = dx * door.facing.x + dz * door.facing.z;
  const c = dx * door.facing.z - dz * door.facing.x;
  return Math.abs(a) <= along && Math.abs(c) <= across;
}

/** The door whose trigger pad contains `p`, if any. */
export function doorAt(doors: readonly DoorTrigger[] | undefined, p: Vec2): DoorTrigger | null {
  if (!doors) return null;
  for (const door of doors) if (onPad(door, p)) return door;
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
  /** Zone the rover is in and when it entered it (for the dwell). */
  zone?: RoomId | null;
  since?: number;
}

export interface DoorStep {
  /** Phase is "explore" (no drawer, ride or overlay). */
  explore: boolean;
  /** The rover follows a path (click-to-move or mission autopilot). */
  following: boolean;
  /** Clock (s) and rover speed (u/s); a fast pass needs DOOR_DWELL in the zone. */
  now?: number;
  speed?: number;
  /** Rover heading (radians, forward is (sin, cos)) and the door's inward direction. */
  heading?: number;
  facing?: Vec2;
}

/** Driving within about 45 degrees of a door's inward direction counts as heading into it. */
export const DOOR_HEADING = Math.SQRT1_2;

/**
 * Advances the latch for the zone the rover is in and returns the room to open, if any.
 * Doors fire only on intent: the rover drives into the door (along `facing`), stops or slows down
 * on the pad, or stays on it for DOOR_DWELL. A path or a fast manual drive passing over a pad does not open it, and a mission
 * drive resolves before the drawer opens.
 */
export function stepDoorLatch(latch: DoorLatch, current: RoomId | null, { explore, following, now = 0, speed = 0, heading, facing }: DoorStep): RoomId | null {
  if (!current) {
    latch.room = null;
    latch.zone = null;
    return null;
  }
  if (current !== latch.zone) {
    latch.zone = current;
    latch.since = now;
  }
  if (!explore) {
    // A room is already open (or a ride runs): standing here must not reopen it after closing.
    latch.room = current;
    return null;
  }
  if (current === latch.room || following) return null;
  const into = heading !== undefined && facing !== undefined && Math.sin(heading) * facing.x + Math.cos(heading) * facing.z >= DOOR_HEADING;
  if (speed >= DOOR_SLOW && !into && now - (latch.since ?? now) < DOOR_DWELL) return null;
  latch.room = current;
  return current;
}
