import type { FloorId } from "@/content/schema";
import { PUBLIC_FLOORS, SECRET_FLOOR } from "@/lib/floors";

/**
 * The floor order, apart from `experience/config` so the store and the HUD pieces every Classic page loads
 * never pull the floor layouts into the Classic bundle (scripts/check-client-chunks.ts). Imports the floor
 * lists and types only; `config.ts` re-exports these names.
 */

/** Every floor bottom up: the secret B1 Engine Room under the Lobby, then the five public floors (`PUBLIC_FLOORS`). */
export const FLOOR_IDS = [SECRET_FLOOR, ...PUBLIC_FLOORS] as const satisfies readonly FloorId[];

/** Floors whose 3D content is built (B1 has no route of its own: its URL stays /{locale}, `FLOOR_ROUTE`). */
export const READY_FLOORS: readonly FloorId[] = FLOOR_IDS;

export function floorIndex(id: FloorId): number {
  return FLOOR_IDS.indexOf(id);
}
