import { useSyncExternalStore } from "react";
import { OFFICE } from "../officeLayout";
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
 * so the next request (`__hq.office.load()`) retries; the speculative trigger never retries a failed load. An office
 * drawer loads only its body (`loadOfficeBody`). This import() is the only reference to the chunk entry.
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
}

/** The speculative trigger: after the first frame on idle, on L1 or riding there, within `OFFICE.loadRadius` of the stop. */
export function officeLoadWanted({ idle, state: chunk, prefetch, floor, rideTo, at }: OfficeLoadInput): boolean {
  if (!idle || chunk !== "idle" || !prefetch || (rideTo ?? floor) !== "L1") return false;
  return Math.hypot(at.x - OFFICE.stop.x, at.z - OFFICE.stop.z) <= OFFICE.loadRadius;
}

/** `window.__hq.office` (Playwright and the perf lane): load, load the drawer body, the chunk state and the chunk's test hooks once loaded. */
export const officeHandle = {
  load: (): Promise<void> => loadOffice().then(() => undefined),
  loadBody: (): Promise<void> => loadOfficeBody().then(() => undefined),
  state: officeChunkState,
  test: () => loaded?.officeTest ?? null,
};
