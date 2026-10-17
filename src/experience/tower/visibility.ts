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
  /** Intro fly-in progress 0 to 1 (`roverRuntime.introFly`), -1 or undefined outside it. */
  introFly?: number;
}

/** How far below the car a passing floor still shows its content during a ride. */
export const RIDE_BELOW_REACH = FLOOR_GAP;

/**
 * Whether a floor's content group draws this frame (its slab and edges always do). Keeps intro and
 * ride peaks under the 150-call budget (REPORT F5.4): the exterior shows the Lobby's and L2's detail only
 * (never a floor the boot warm-up mounts),
 * a ride shows its target and the floors right under the car, and floors above the rover are ghosts.
 */
export function contentVisible({ id, floorY, roverY, exterior, rideTo, introFly }: VisibilityInput): boolean {
  // The intro's opening shot frames the L2 slab, so its shell (grid, pads) stays; nothing above it is mounted then.
  // Once the camera flies in, L2's slab fades to a ghost over the Lobby (`introGhost`), so its detail goes.
  if (exterior) return id === "L1" || (id === "L2" && !(introFly !== undefined && introFly >= 0));
  if (floorY > roverY + 0.5) return false;
  if (floorY < roverY - 0.5) {
    if (!rideTo) return false;
    return id === rideTo || roverY - floorY <= RIDE_BELOW_REACH;
  }
  return true;
}

/** Fly-in progress at which the slabs above the rover are full ghosts (Round 9 M). */
export const INTRO_GHOST_BY = 0.2;

/**
 * How far the slabs above the rover have turned into ghosts during the boot and intro exterior (0 solid, 1 ghost):
 * solid for the orbit, then fading over the first part of the fly-in (smoothstep), so the camera never comes down
 * onto an opaque L2 slab and the Lobby does not pop in when explore starts.
 */
export function introGhost(fly: number): number {
  if (fly <= 0) return 0;
  const x = Math.min(1, fly / INTRO_GHOST_BY);
  return x * x * (3 - 2 * x);
}
