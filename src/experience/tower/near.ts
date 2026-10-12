import type { FloorId } from "@/content/schema";
import { FLOOR_IDS, floorIndex } from "../config";
import type { RideStage } from "./elevator";

const BEFORE_MOVING: ReadonlySet<RideStage> = new Set(["toDoor", "boarding", "closing"]);

/**
 * Floors render full detail only next to the current floor or the ride target (`reach` 1); the rest
 * are silhouettes. Until the first frames are done `reach` is 0, so a deep link builds one floor's
 * text and meshes, not three (about 100 ms less main-thread work on a throttled phone). `warm` is the
 * floor the boot warm-up mounts hidden to compile its programs (scene/ProgramWarmup.tsx).
 */
export function nearFloors(floor: FloorId, target: FloorId | null, exterior: boolean, reach = 1, warm: FloorId | null = null): FloorId[] {
  return FLOOR_IDS.filter((id) => {
    if (id === warm) return true;
    if (exterior && id === "L1") return true;
    const d = Math.abs(floorIndex(id) - floorIndex(floor));
    const dt = target ? Math.abs(floorIndex(id) - floorIndex(target)) : Infinity;
    return Math.min(d, dt) <= reach;
  });
}

/**
 * Whether a floor's content draws this frame. Floors above the rover are ghosts; content under the
 * current slab is hidden by it, so it only draws while a ride runs. A floor below whose shader programs
 * are still compiling stays hidden until the car moves (R5 P6): drawing it would force a blocking
 * compile while the doors close, and explore hides it the same way, so nothing new shows.
 */
export function floorContentVisible({
  floorY,
  roverY,
  exterior,
  ride,
  ready,
}: {
  floorY: number;
  roverY: number;
  exterior: boolean;
  ride: { stage: RideStage } | null;
  ready: boolean;
}): boolean {
  if (exterior) return true;
  if (floorY > roverY + 0.5) return false;
  if (floorY >= roverY - 0.5) return true;
  if (!ride) return false;
  return ready || !BEFORE_MOVING.has(ride.stage);
}
