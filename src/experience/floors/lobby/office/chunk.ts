import { useSyncExternalStore } from "react";
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
}

/**
 * The speculative trigger (always-live office, design 5.9): once the first frame went idle, on L1 or riding there,
 * with speculative prefetch on, at any distance from the wing, so the office lives whenever it comes into view.
 * With `?prefetch=off` it never asks; an office drawer still loads the chunk (`OfficeBody`).
 */
export function officeLoadWanted({ idle, state: chunk, prefetch, floor, rideTo }: OfficeLoadInput): boolean {
  return idle && chunk === "idle" && prefetch && (rideTo ?? floor) === "L1";
}

let asks = 0;

/** OfficeMount counts each trigger ask made after the first frame went idle (e2e proof that `?prefetch=off` held). */
export function countOfficeAsk(): void {
  asks += 1;
}

/** `window.__hq.office` (Playwright and the perf lane): load, load the drawer body, load the replay chunk, the chunk state, the trigger's idle asks and the chunk's test hooks once loaded. */
export const officeHandle = {
  load: (): Promise<void> => loadOffice().then(() => undefined),
  loadBody: (): Promise<void> => loadOfficeBody().then(() => undefined),
  loadReplay: (): Promise<void> => loadOffice().then((m) => m.loadOfficeReplay()).then(() => undefined),
  state: officeChunkState,
  asks: (): number => asks,
  test: () => loaded?.officeTest ?? null,
};
