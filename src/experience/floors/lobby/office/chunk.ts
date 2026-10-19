import { useSyncExternalStore } from "react";
import { OFFICE } from "../officeLayout";
import type * as OfficeChunk from "./scene";

/** The Agent Office chunk (`./scene.ts`): the Rovers, the wall, the chips, the drawer bodies and the live feed. */
export type OfficeModule = typeof OfficeChunk;
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
 * so the next request (an office drawer, `__hq.office.load()`) retries; the speculative trigger never retries a
 * failed load. This import() is the only reference to the chunk entry.
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

/** `window.__hq.office` (Playwright and the perf lane): load, the chunk state and the chunk's test hooks once loaded. */
export const officeHandle = {
  load: (): Promise<void> => loadOffice().then(() => undefined),
  state: officeChunkState,
  test: () => loaded?.officeTest ?? null,
};
