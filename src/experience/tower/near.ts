import type { FloorId } from "@/content/schema";
import { FLOOR_IDS, floorIndex } from "../config";

/**
 * Floors render full detail only next to the current floor or the ride target (`reach` 1); the rest
 * are silhouettes. Until the first frames are done `reach` is 0, so a deep link builds one floor's
 * text and meshes, not three (about 100 ms less main-thread work on a throttled phone).
 */
export function nearFloors(floor: FloorId, target: FloorId | null, exterior: boolean, reach = 1): FloorId[] {
  return FLOOR_IDS.filter((id) => {
    if (exterior && id === "L1") return true;
    const d = Math.abs(floorIndex(id) - floorIndex(floor));
    const dt = target ? Math.abs(floorIndex(id) - floorIndex(target)) : Infinity;
    return Math.min(d, dt) <= reach;
  });
}
