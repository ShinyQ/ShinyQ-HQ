import type { FloorId } from "@/content/schema";
import { SECRET_FLOOR } from "@/lib/floors";

/** Query parameter of the dev and test unlock: `?unlock=b1`. */
export const B1_UNLOCK_PARAM = "unlock";

/**
 * `?unlock=b1` unlocks B1 for the session: always in a dev build, in a production build only together with
 * `debug` (`?unlock=b1&debug=1`: how e2e and the capture scripts reach the floor before the real unlock exists).
 */
export function b1UnlockFlag(search: string, dev: boolean): boolean {
  const query = new URLSearchParams(search);
  return query.get(B1_UNLOCK_PARAM)?.toLowerCase() === "b1" && (dev || query.has("debug"));
}

/** Whether the elevator, a deep link or a language-switch resume may take the rover to `floor`. */
export function canEnterFloor(floor: FloorId, b1Unlocked: boolean): boolean {
  return floor !== SECRET_FLOOR || b1Unlocked;
}
