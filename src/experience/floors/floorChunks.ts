import type { FloorId } from "@/content/schema";
import type * as LabsChunk from "./chunks/labs";
import type * as LibraryChunk from "./chunks/library";
import type * as RoofChunk from "./chunks/roof";

/**
 * On-demand floor chunks (Round 7 B). L3, L4 and RF load through one dynamic import each; L1 and L2
 * stay in the main 3D chunk. Pure state machine plus the app instance; no React, no three.
 */
export const LAZY_FLOORS = ["L3", "L4", "RF"] as const satisfies readonly FloorId[];
export type LazyFloor = (typeof LAZY_FLOORS)[number];
export type FloorChunkState = "eager" | "idle" | "loading" | "ready" | "failed";

const ALL_FLOORS: readonly FloorId[] = ["L1", "L2", "L3", "L4", "RF"];

export function isLazyFloor(id: FloorId): id is LazyFloor {
  return (LAZY_FLOORS as readonly FloorId[]).includes(id);
}

/** `?prefetch=off` turns speculative prefetches off (tests measure the main path with it). */
export function speculativePrefetchOn(search: string): boolean {
  return new URLSearchParams(search).get("prefetch") !== "off";
}

export interface FloorChunks<M extends Record<LazyFloor, unknown>> {
  /** Loads a floor chunk (deduped); rejects when the import fails. */
  load<K extends LazyFloor>(id: K): Promise<M[K]>;
  /** The floor is needed now (ride target, deep link, warm-up): load it, ignore eager floors and errors. */
  ensure(id: FloorId): void;
  /** The floor may be needed soon: like ensure, unless speculative prefetches are off. */
  prefetch(id: FloorId): void;
  prefetchAll(): void;
  state(id: FloorId): FloorChunkState;
  /** Eager, ready or failed: nothing to wait for (a failed import surfaces through the canvas error boundary). */
  settled(id: FloorId): boolean;
  /** `now()` of the first request this session, or null. */
  requestedAt(id: FloorId): number | null;
  snapshot(): Record<FloorId, FloorChunkState>;
  /** The loaded module, or null until its import resolved (renders a ready floor without React.lazy). */
  module<K extends LazyFloor>(id: K): M[K] | null;
  /** The floor's import failed at least once this session (it then renders through React.lazy). */
  hasFailed(id: FloorId): boolean;
  /** Called after every state change; returns the unsubscribe function. */
  subscribe(listener: () => void): () => void;
}

export function createFloorChunks<M extends Record<LazyFloor, unknown>>(
  loaders: { [K in LazyFloor]: () => Promise<M[K]> },
  { speculative = () => true, now = () => performance.now() }: { speculative?: () => boolean; now?: () => number } = {},
): FloorChunks<M> {
  const states = new Map<LazyFloor, FloorChunkState>();
  const pending = new Map<LazyFloor, Promise<unknown>>();
  const requested = new Map<LazyFloor, number>();
  const modules = new Map<LazyFloor, unknown>();
  const failed = new Set<LazyFloor>();
  const listeners = new Set<() => void>();

  const setState = (id: LazyFloor, next: FloorChunkState) => {
    states.set(id, next);
    for (const listener of [...listeners]) listener();
  };

  function load<K extends LazyFloor>(id: K): Promise<M[K]> {
    const inFlight = pending.get(id);
    if (inFlight) return inFlight as Promise<M[K]>;
    if (!requested.has(id)) requested.set(id, now());
    const promise = loaders[id]().then(
      (mod) => {
        modules.set(id, mod);
        setState(id, "ready");
        return mod;
      },
      (error: unknown) => {
        failed.add(id);
        pending.delete(id);
        setState(id, "failed");
        throw error;
      },
    );
    pending.set(id, promise);
    setState(id, "loading");
    return promise;
  }

  const ensure = (id: FloorId) => {
    if (isLazyFloor(id)) load(id).catch(() => undefined);
  };
  const prefetch = (id: FloorId) => {
    if (speculative()) ensure(id);
  };
  const state = (id: FloorId): FloorChunkState => (isLazyFloor(id) ? (states.get(id) ?? "idle") : "eager");

  return {
    load,
    ensure,
    prefetch,
    prefetchAll: () => LAZY_FLOORS.forEach(prefetch),
    state,
    settled: (id) => state(id) !== "idle" && state(id) !== "loading",
    requestedAt: (id) => (isLazyFloor(id) ? (requested.get(id) ?? null) : null),
    snapshot: () => Object.fromEntries(ALL_FLOORS.map((id) => [id, state(id)])) as Record<FloorId, FloorChunkState>,
    module: <K extends LazyFloor>(id: K) => (modules.get(id) as M[K] | undefined) ?? null,
    hasFailed: (id) => isLazyFloor(id) && failed.has(id),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  };
}

/**
 * How the tower mounts a floor. A loaded chunk renders its component directly, so the floor commits in
 * an ordinary update like an eager floor. Through React.lazy it would commit in a Suspense retry, which
 * React throttles for up to 300 ms when a nested boundary (the L4 newsroom decor waiting for fonts)
 * suspends; a font that resolves inside that window joins the floor's first commit, so FloorPrep
 * compiled and pinned its programs on some runs and not on others. While the chunk loads nothing
 * renders (the slab shows); a floor whose import ever failed keeps React.lazy, whose rejection reaches
 * the canvas error boundary (the crash path).
 */
export type FloorMount = "eager" | "module" | "lazy" | "wait";

export function floorMount(chunks: Pick<FloorChunks<Record<LazyFloor, unknown>>, "module" | "hasFailed">, id: FloorId): FloorMount {
  if (!isLazyFloor(id)) return "eager";
  if (chunks.hasFailed(id)) return "lazy";
  return chunks.module(id) === null ? "wait" : "module";
}

/**
 * Whether a ride to `to` must wait for its chunk. Starts the import only while the chunk is idle, so a
 * failed import releases the car instead of retrying every frame (the canvas crash remount retries it).
 */
export function rideChunkHold(
  chunks: Pick<FloorChunks<FloorChunkModules>, "state" | "ensure" | "settled">,
  to: FloorId,
): boolean {
  if (chunks.state(to) === "idle") chunks.ensure(to);
  return !chunks.settled(to);
}

export interface FloorChunkModules {
  L3: typeof LabsChunk;
  L4: typeof LibraryChunk;
  RF: typeof RoofChunk;
}

/** The app's floor chunks. Each import() here is the only reference to its chunk entry. */
export const floorChunks = createFloorChunks<FloorChunkModules>(
  {
    L3: () => import("./chunks/labs"),
    L4: () => import("./chunks/library"),
    RF: () => import("./chunks/roof"),
  },
  { speculative: () => typeof window !== "undefined" && speculativePrefetchOn(window.location.search) },
);

/** `window.__hq.floorChunks` (Playwright): states, request times and a serializable load. */
export const floorChunksHandle = {
  state: (id: FloorId) => floorChunks.state(id),
  snapshot: () => floorChunks.snapshot(),
  requestedAt: (id: FloorId) => floorChunks.requestedAt(id),
  load: (id: LazyFloor): Promise<void> => floorChunks.load(id).then(() => undefined),
};
