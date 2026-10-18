import type { FloorId } from "@/content/schema";
import { isPublicFloor, PUBLIC_FLOORS, SECRET_FLOOR } from "@/lib/floors";
import type { HQState, HQStore } from "@/store/useHQStore";

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

/** Floors a visitor reaches to unlock B1: the five public floors (spec: "visited all 5 floors"). */
export const PUBLIC_FLOOR_COUNT = PUBLIC_FLOORS.length;

/** "n/5": public floors reached so far (B1 never counts). */
export function floorProgress(seen: readonly FloorId[]): { seen: number; total: number } {
  return { seen: PUBLIC_FLOORS.filter((f) => seen.includes(f)).length, total: PUBLIC_FLOOR_COUNT };
}

/**
 * The store patch for reaching `floor`: null when nothing changes (B1, or a floor already counted). The fifth
 * public floor unlocks B1 and starts the one-time unlock moment, unless B1 was already unlocked.
 */
export function withFloorSeen(
  state: { floorsSeen: readonly FloorId[]; b1Unlocked: boolean },
  floor: FloorId,
): { floorsSeen: FloorId[]; b1Unlocked?: true; b1Moment?: true } | null {
  if (!isPublicFloor(floor) || state.floorsSeen.includes(floor)) return null;
  const floorsSeen = [...state.floorsSeen, floor];
  const all = PUBLIC_FLOORS.every((f) => floorsSeen.includes(f));
  return all && !state.b1Unlocked ? { floorsSeen, b1Unlocked: true, b1Moment: true } : { floorsSeen };
}

/** Records every floor the rover explores (arrival, deep link, resume, the Lobby after the intro); returns the unsubscribe. */
export function watchFloorVisits(store: HQStore): () => void {
  const mark = (s: HQState) => {
    if (s.phase === "explore" && s.ride === null) s.markFloorSeen(s.floor);
  };
  mark(store.getState());
  return store.subscribe(mark);
}

/** `/{locale}#B1` (any case): a deep link into the Engine Room from the Lobby route; other routes ignore it. */
export function b1FromHash(startFloor: FloorId | undefined, hash: string): "B1" | undefined {
  return !startFloor && /^#b1$/i.test(hash) ? "B1" : undefined;
}
