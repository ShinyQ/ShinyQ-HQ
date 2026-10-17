import type { FloorId } from "@/content/schema";

/**
 * The five public floors, bottom up: what visitors tour, what counts toward unlocking B1 (PR 3), what the
 * picker thumbnails and the build dashboard cover, and what the tower draws while B1 is locked.
 */
export const PUBLIC_FLOORS = ["L1", "L2", "L3", "L4", "RF"] as const satisfies readonly FloorId[];
export type PublicFloor = (typeof PUBLIC_FLOORS)[number];

/** The secret basement floor: the B1 Engine Room (spec 2026-10-17). */
export const SECRET_FLOOR = "B1" as const satisfies FloorId;

export function isPublicFloor(id: FloorId): id is PublicFloor {
  return (PUBLIC_FLOORS as readonly FloorId[]).includes(id);
}
