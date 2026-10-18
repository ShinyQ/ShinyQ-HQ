import type { FloorId } from "@/content/schema";
import { PUBLIC_FLOORS, SECRET_FLOOR } from "@/lib/floors";

export interface FloorRow {
  id: FloorId;
  /** PR 3: B1 before the visitor has seen all five floors (padlock, "Visit all 5 floors (n/5)"). */
  locked: boolean;
}

/** The elevator's rows top-down (RF first, like the panel), with B1 below L1 once it is unlocked. */
export function floorRows(b1Unlocked: boolean): FloorRow[] {
  const rows: FloorRow[] = [...PUBLIC_FLOORS].reverse().map((id) => ({ id, locked: false }));
  return b1Unlocked ? [...rows, { id: SECRET_FLOOR, locked: false }] : rows;
}
