import { useSyncExternalStore } from "react";
import { LOBBY } from "../../../config";
import { isOfficeRoom, OFFICE } from "../officeLayout";
import type * as OfficeBodyChunk from "./body";
import type * as OfficeChunk from "./scene";

/** The Agent Office chunk (`./scene.ts`): the Rovers, the wall, the chips and the live feed. */
export type OfficeModule = typeof OfficeChunk;
/** The office drawer body chunk (`./body.ts`), loaded only when an office drawer opens. */
export type OfficeBodyModule = typeof OfficeBodyChunk;
export type OfficeChunkState = "idle" | "loading" | "ready" | "failed";

let pending: Promise<OfficeModule> | null = null;
let loaded: OfficeModule | null = null;
let state: OfficeChunkState = "idle";
const listeners = new Set<() => void>();

const set = (next: OfficeChunkState) => {
  state = next;
  for (const listener of listeners) listener();
};

/**
 * Loads the office chunk once per page (one shared promise). Rejects when the import fails and forgets the promise,
 * so the next request (`__hq.office.load()`) retries; the speculative trigger never retries a failed load. Opening an
 * office drawer starts it too, beside its body (`loadOfficeBody`). This import() is the only reference to the chunk entry.
 */
export function loadOffice(): Promise<OfficeModule> {
  if (!pending) {
    set("loading");
    pending = import("./scene").then(
      (mod) => {
        loaded = mod;
        set("ready");
        return mod;
      },
      (error: unknown) => {
        pending = null;
        set("failed");
        throw error;
      },
    );
  }
  return pending;
}

let pendingBody: Promise<OfficeBodyModule> | null = null;

/**
 * Loads the drawer body chunk once per page, on an office drawer open (never speculatively). Like `loadOffice`, a
 * failed import forgets the promise so the next drawer open retries. This import() is the only reference to it.
 */
export function loadOfficeBody(): Promise<OfficeBodyModule> {
  pendingBody ??= import("./body").catch((error: unknown) => {
    pendingBody = null;
    throw error;
  });
  return pendingBody;
}

export function officeModule(): OfficeModule | null {
  return loaded;
}

export function officeChunkState(): OfficeChunkState {
  return state;
}

export function subscribeOffice(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useOfficeModule(): OfficeModule | null {
  return useSyncExternalStore(subscribeOffice, officeModule, () => null);
}

export interface OfficeLoadInput {
  /** The first frame has drawn and the page went idle (`afterFirstFrameIdle`). */
  idle: boolean;
  state: OfficeChunkState;
  /** Speculative prefetches on (`?prefetch=off` turns them off). */
  prefetch: boolean;
  floor: string;
  rideTo: string | null;
  /** The rover, or the elevator arrival point during a ride. */
  at: { x: number; z: number };
  /** The running mission's id, if any: a catalog mission or `goto:<room>` (`MissionRunner.goTo`). */
  mission: string | null;
}

/** The Rover menu's office mission (content/site-content.json `missions`): the elevator to L1, a drive to the office, its drawer. */
export const OFFICE_MISSION = "office";

/**
 * The speculative trigger: after the first frame on idle, on L1 or riding there, either within `OFFICE.loadRadius` of
 * the stop or running a mission bound for the office (the office mission, a `goto:` an office room: a chip, a Rover,
 * a palette result), so a ride to L1 for the office preloads it.
 */
export function officeLoadWanted({ idle, state: chunk, prefetch, floor, rideTo, at, mission }: OfficeLoadInput): boolean {
  if (!idle || chunk !== "idle" || !prefetch || (rideTo ?? floor) !== "L1") return false;
  if (mission === OFFICE_MISSION || isOfficeRoom(mission?.replace(/^goto:/, ""))) return true;
  const { stop } = LOBBY.officeWing;
  return Math.hypot(at.x - stop.x, at.z - stop.z) <= OFFICE.loadRadius;
}

let asks = 0;

/** OfficeMount counts each trigger ask made after the first frame went idle (e2e proof that `?prefetch=off` held). */
export function countOfficeAsk(): void {
  asks += 1;
}

/** `window.__hq.office` (Playwright and the perf lane): load, load the drawer body, the chunk state, the trigger's idle asks and the chunk's test hooks once loaded. */
export const officeHandle = {
  load: (): Promise<void> => loadOffice().then(() => undefined),
  loadBody: (): Promise<void> => loadOfficeBody().then(() => undefined),
  state: officeChunkState,
  asks: (): number => asks,
  test: () => loaded?.officeTest ?? null,
};
