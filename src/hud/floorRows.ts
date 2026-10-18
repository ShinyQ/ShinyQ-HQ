import type { FloorId } from "@/content/schema";
import { PUBLIC_FLOORS, SECRET_FLOOR } from "@/lib/floors";

export interface FloorRow {
  id: FloorId;
  /** B1 before the visitor has seen all five floors (padlock, "Visit all 5 floors (n/5)"). */
  locked: boolean;
}

/** The elevator's rows top-down (RF first, like the panel), with B1 below L1: locked until the visitor has reached all five floors. */
export function floorRows(b1Unlocked: boolean): FloorRow[] {
  return [...[...PUBLIC_FLOORS].reverse().map((id) => ({ id, locked: false })), { id: SECRET_FLOOR, locked: !b1Unlocked }];
}
