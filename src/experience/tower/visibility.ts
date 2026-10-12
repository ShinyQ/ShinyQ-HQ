import type { FloorId } from "@/content/schema";
import { FLOOR_GAP } from "../config";

export interface VisibilityInput {
  id: FloorId;
  floorY: number;
  roverY: number;
  /** Boot and intro: the exterior orbit around the tower. */
  exterior: boolean;
  /** Target floor of the running ride, if any. */
  rideTo: FloorId | null;
}

/** How far below the car a passing floor still shows its content during a ride. */
export const RIDE_BELOW_REACH = FLOOR_GAP;

/**
 * Whether a floor's content group draws this frame (its slab and edges always do). Keeps intro and
 * ride peaks under the 150-call budget (REPORT F5.4): the exterior shows the Lobby's detail only,
 * a ride shows its target and the floors right under the car, and floors above the rover are ghosts.
 */
export function contentVisible({ id, floorY, roverY, exterior, rideTo }: VisibilityInput): boolean {
  if (exterior) return id === "L1";
  if (floorY > roverY + 0.5) return false;
  if (floorY < roverY - 0.5) {
    if (!rideTo) return false;
    return id === rideTo || roverY - floorY <= RIDE_BELOW_REACH;
  }
  return true;
}
