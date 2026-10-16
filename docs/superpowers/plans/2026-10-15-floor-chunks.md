# Floor Chunks (Round 7 B: 3D bundle split) Implementation Plan

Status: shipped in #157 (7a19129), 2026-10-16

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Load the L3 (Labs), L4 (Library) and RF (Roof) floor code as on-demand chunks so the 3D JS a visitor downloads before the first frame drops by at least 15 KB gzip, with no blank floor on any ride.

**Architecture:** One loader module (`src/experience/floors/floorChunks.ts`) owns one dynamic `import()` per lazy floor (`floors/chunks/{labs,library,roof}.ts`). Each chunk entry re-exports the floor component and the floor-only HUD pieces (L3: Ops and Reactor drawer bodies and the hologram overlay; L4: Research and Topics drawer bodies). The Tower renders `React.lazy` wrappers inside its existing per-floor Suspense boundary (fallback `null`, so the floor's slab from `FloorLevel` is what shows). The elevator holds the car at closed doors while the destination chunk is not settled (no timeout), and a prefetcher loads the chunks after the first frame on idle, on elevator and floor picker intent, and at once on a deep link.

**Tech Stack:** Next.js 16 (Turbopack, static export), React 19 `lazy`/`Suspense`, React Three Fiber, zustand, Vitest, Playwright.

## Global Constraints

- No em dashes (U+2014) anywhere: code, comments, docs, commits, PR text.
- L1 (`Lobby`) and L2 (`CareerArchive`) stay in the main 3D chunk (spawn floor and first ride).
- Floor component APIs stay stable: `Labs`, `Library`, `Roof` keep their props and exports (sub-projects G and F build on them).
- Budgets stay green: 3D JS gate 450 KB gzip (`BYTES_3D_BUDGET.failAt`), Classic JS gate 240 KB, L1 at most 125 scene calls, every floor under 150 scene calls and the triangle cap, no new shader program, memory gates.
- Never change the aesthetic. The Suspense fallback is the floor's empty slab (fallback `null`), never a spinner.
- A ride never shows an empty floor: the car holds at the shaft until the destination chunk has settled (loaded, or failed so the crash path takes over).
- The main 3D path drops by at least 15 KB gzip against main (lite 420.1 KB, full 443.7 KB measured on main e822be38 with `e2e/perf/bytes-3d.spec.ts`).
- Per-floor-chunk caps in the bundle gate: L3 20 KB, L4 16 KB, RF 8 KB gzip.
- Every PR updates AGENTS.md, `docs/features.md` and the budget appendix where conventions or budgets change.
- Never import React, the store or three into `src/experience/missions/`.
- Wait on state in e2e, never on time (AGENTS.md, "Writing 3D tests").

## Spike results (2026-10-15, local, Apple M4, `bun run build`, bytes gate)

| Variant | lite 3D JS | full 3D JS | Classic `/en?tier=static` JS |
|---|---:|---:|---:|
| main e822be38 | 420.1 KB | 443.7 KB | 227,994 B |
| Labs, Library, Roof lazy | 407.5 KB | 431.1 KB | 228,331 B |
| + L3/L4 drawer bodies, hologram overlay in the chunks | 406.3 KB | 429.9 KB | not measured |
| + drawer `VisitsPanel` through its existing lazy chunk | 404.2 KB | 427.9 KB | 228,375 B |

The floor components alone compress to about 12.5 KB in context (layout builders stay in the main path: `buildFloorLayouts` needs them for the navgrid). The floor-only HUD bodies and the drawer's `VisitsPanel` (the same dynamic import the Contact page already uses, so no new chunk) bring the drop to 15.9 KB. The spike diff is not committed.

## File structure

| File | Responsibility |
|---|---|
| `src/experience/floors/floorChunks.ts` (new) | Pure factory `createFloorChunks` (states, dedupe, retry, speculative switch), the app instance `floorChunks`, `speculativePrefetchOn(search)`, the `floorChunksHandle` for `window.__hq`. |
| `src/experience/floors/chunks/labs.ts`, `library.ts`, `roof.ts` (new) | Chunk entries: re-export the floor component and the floor-only HUD pieces. Only `floorChunks.ts` imports them, and only dynamically. |
| `src/experience/floors/lazyFloors.tsx` (new) | `React.lazy` getters `lazyLabs()`, `lazyLibrary()`, `lazyRoof()` (a failed import is retried on the next mount). |
| `src/experience/floors/floorPrefetch.ts` (new) | Pure `prefetchFor(snapshot)`: which floors a store snapshot needs (ride target) or may soon need (floor picker, call pad hover). |
| `src/experience/floors/FloorChunkPrefetch.tsx` (new) | Mounted by `Experience`: idle prefetch after the first frame and store-driven prefetch. |
| `src/experience/tower/Tower.tsx` | Renders the lazy wrappers for L3, L4, RF. |
| `src/experience/tower/elevator.ts` | `RideOptions.hold` and `Ride.chunkHeld`: no move while the destination chunk is unsettled. |
| `src/experience/tower/rideStats.ts` | `RideSummary.chunkHeld`. |
| `src/experience/scene/Director.tsx` | Passes `hold` and calls `floorChunks.ensure(ride.to)`. |
| `src/experience/scene/ProgramWarmup.tsx` | Awaits a lazy floor's chunk before mounting it hidden. |
| `src/experience/Experience.tsx` | Deep link need-loads in `startSession`, mounts `FloorChunkPrefetch`, exposes `__hq.floorChunks`. |
| `src/hud/ElevatorPanel.tsx` | Prefetch on pointer enter and focus of a floor button. |
| `src/hud/drawer/bodies.tsx`, `RoomDrawer.tsx`, `VisitsBody.tsx`, `src/hud/Hud.tsx` | Lazy floor bodies, hologram overlay and visits panel with accessible fallbacks. |
| `e2e/perf/bytes-3d.spec.ts`, `e2e/budgets.ts`, `scripts/perf-report.ts` | Main path with `?prefetch=off`, per-floor bytes and caps, summary line. |
| `e2e/floor-chunks.spec.ts` (new), `scripts/e2e-plan.ts` | Ride hold, deep link, idle prefetch; plan rule. |
| `tests/helpers/import-graph.ts` (new), `tests/unit/floor-chunks*.test.ts` (new) | Static import graph guard and pure tests. |

---

### Task 1: Floor chunk loader and chunk entries

**Files:**
- Create: `src/experience/floors/floorChunks.ts`
- Create: `src/experience/floors/chunks/labs.ts`, `src/experience/floors/chunks/library.ts`, `src/experience/floors/chunks/roof.ts`
- Test: `tests/unit/floor-chunks.test.ts`

**Interfaces:**
- Produces:
  - `LAZY_FLOORS: readonly ["L3", "L4", "RF"]`, `type LazyFloor`, `isLazyFloor(id: FloorId): id is LazyFloor`
  - `type FloorChunkState = "eager" | "idle" | "loading" | "ready" | "failed"`
  - `createFloorChunks<M extends Record<LazyFloor, unknown>>(loaders: { [K in LazyFloor]: () => Promise<M[K]> }, opts?: { speculative?: () => boolean; now?: () => number }): FloorChunks<M>`
  - `interface FloorChunks<M>`: `load<K extends LazyFloor>(id: K): Promise<M[K]>`, `ensure(id: FloorId): void`, `prefetch(id: FloorId): void`, `prefetchAll(): void`, `state(id: FloorId): FloorChunkState`, `settled(id: FloorId): boolean`, `requestedAt(id: FloorId): number | null`, `snapshot(): Record<FloorId, FloorChunkState>`
  - `speculativePrefetchOn(search: string): boolean` (false for `?prefetch=off`)
  - `floorChunks` (app instance), `type FloorChunkModules`, `floorChunksHandle` (`{ state, snapshot, requestedAt, load(id): Promise<void> }`)

- [x] **Step 1: Write the failing test**

```ts
// tests/unit/floor-chunks.test.ts
import { describe, expect, it, vi } from "vitest";
import { createFloorChunks, isLazyFloor, LAZY_FLOORS, speculativePrefetchOn } from "@/experience/floors/floorChunks";

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function setup(speculative = true) {
  const d = { L3: deferred<string>(), L4: deferred<string>(), RF: deferred<string>() };
  const calls = { L3: 0, L4: 0, RF: 0 };
  let clock = 100;
  const chunks = createFloorChunks(
    {
      L3: () => (calls.L3++, d.L3.promise),
      L4: () => (calls.L4++, d.L4.promise),
      RF: () => (calls.RF++, d.RF.promise),
    },
    { speculative: () => speculative, now: () => clock },
  );
  return { chunks, d, calls, tick: (ms: number) => (clock += ms) };
}

describe("floor chunks", () => {
  it("lists L3, L4 and RF as lazy; L1 and L2 are eager and always settled", () => {
    expect(LAZY_FLOORS).toEqual(["L3", "L4", "RF"]);
    expect(isLazyFloor("L1")).toBe(false);
    expect(isLazyFloor("L3")).toBe(true);
    const { chunks } = setup();
    expect(chunks.state("L1")).toBe("eager");
    expect(chunks.settled("L2")).toBe(true);
    expect(chunks.snapshot()).toEqual({ L1: "eager", L2: "eager", L3: "idle", L4: "idle", RF: "idle" });
  });

  it("loads once, records the request time and settles when the module arrives", async () => {
    const { chunks, d, calls } = setup();
    const a = chunks.load("L3");
    const b = chunks.load("L3");
    chunks.ensure("L3");
    expect(calls.L3).toBe(1);
    expect(chunks.state("L3")).toBe("loading");
    expect(chunks.settled("L3")).toBe(false);
    expect(chunks.requestedAt("L3")).toBe(100);
    d.L3.resolve("labs");
    await expect(a).resolves.toBe("labs");
    await expect(b).resolves.toBe("labs");
    expect(chunks.state("L3")).toBe("ready");
    expect(chunks.settled("L3")).toBe(true);
  });

  it("ignores eager floors in ensure and prefetch", () => {
    const { chunks, calls } = setup();
    chunks.ensure("L1");
    chunks.prefetch("L2");
    expect(calls).toEqual({ L3: 0, L4: 0, RF: 0 });
  });

  it("prefetches speculatively unless ?prefetch=off, but ensure always loads", () => {
    const off = setup(false);
    off.chunks.prefetchAll();
    off.chunks.prefetch("L4");
    expect(off.calls).toEqual({ L3: 0, L4: 0, RF: 0 });
    off.chunks.ensure("RF");
    expect(off.calls.RF).toBe(1);
    const on = setup(true);
    on.chunks.prefetchAll();
    expect(on.calls).toEqual({ L3: 1, L4: 1, RF: 1 });
  });

  it("marks a failed load settled (the crash path takes over) and retries on the next load", async () => {
    const { chunks, d, calls } = setup();
    const first = chunks.load("L4");
    d.L4.reject(new Error("offline"));
    await expect(first).rejects.toThrow("offline");
    expect(chunks.state("L4")).toBe("failed");
    expect(chunks.settled("L4")).toBe(true);
    d.L4 = deferred<string>();
    const again = chunks.load("L4");
    expect(calls.L4).toBe(2);
    expect(chunks.state("L4")).toBe("loading");
    d.L4.resolve("library");
    await expect(again).resolves.toBe("library");
  });

  it("swallows the rejection of a fire-and-forget ensure or prefetch", async () => {
    const { chunks, d } = setup();
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    chunks.ensure("RF");
    d.RF.reject(new Error("offline"));
    await new Promise((r) => setTimeout(r, 0));
    process.off("unhandledRejection", unhandled);
    expect(unhandled).not.toHaveBeenCalled();
    expect(chunks.state("RF")).toBe("failed");
  });

  it("reads ?prefetch=off", () => {
    expect(speculativePrefetchOn("")).toBe(true);
    expect(speculativePrefetchOn("?tier=lite")).toBe(true);
    expect(speculativePrefetchOn("?tier=lite&prefetch=off")).toBe(false);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/unit/floor-chunks.test.ts`
Expected: FAIL, cannot resolve `@/experience/floors/floorChunks`.

- [x] **Step 3: Write the implementation**

```ts
// src/experience/floors/floorChunks.ts
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
}

export function createFloorChunks<M extends Record<LazyFloor, unknown>>(
  loaders: { [K in LazyFloor]: () => Promise<M[K]> },
  { speculative = () => true, now = () => performance.now() }: { speculative?: () => boolean; now?: () => number } = {},
): FloorChunks<M> {
  const states = new Map<LazyFloor, FloorChunkState>();
  const pending = new Map<LazyFloor, Promise<unknown>>();
  const requested = new Map<LazyFloor, number>();

  function load<K extends LazyFloor>(id: K): Promise<M[K]> {
    const inFlight = pending.get(id);
    if (inFlight) return inFlight as Promise<M[K]>;
    if (!requested.has(id)) requested.set(id, now());
    states.set(id, "loading");
    const promise = loaders[id]().then(
      (mod) => {
        states.set(id, "ready");
        return mod;
      },
      (error: unknown) => {
        states.set(id, "failed");
        pending.delete(id);
        throw error;
      },
    );
    pending.set(id, promise);
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
  };
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
```

A failed load retries on the next `load` call (no timer).

```ts
// src/experience/floors/chunks/labs.ts
/** L3 chunk entry (Round 7 B): the floor and its floor-only HUD pieces. Imported only by floorChunks.ts. */
export { Labs } from "../Labs";
export { OpsBody } from "@/hud/drawer/OpsBody";
export { ReactorBody } from "@/hud/drawer/ReactorBody";
export { HologramOverlay } from "@/hud/HologramOverlay";
```

```ts
// src/experience/floors/chunks/library.ts
/** L4 chunk entry (Round 7 B). Imported only by floorChunks.ts. */
export { Library } from "../Library";
export { ResearchBody } from "@/hud/drawer/ResearchBody";
export { TopicsBody } from "@/hud/drawer/TopicsBody";
```

```ts
// src/experience/floors/chunks/roof.ts
/** RF chunk entry (Round 7 B). Imported only by floorChunks.ts. */
export { Roof } from "../Roof";
```

- [x] **Step 4: Run test to verify it passes**

Run: `bunx vitest run tests/unit/floor-chunks.test.ts && bunx tsc --noEmit -p .`
Expected: PASS, no type errors.

- [x] **Step 5: Commit**

```bash
git add src/experience/floors/floorChunks.ts src/experience/floors/chunks tests/unit/floor-chunks.test.ts
git commit -m "feat(3d): floor chunk loader for L3, L4 and RF"
```

---

### Task 2: Lazy floors, lazy floor bodies and the import graph guard

**Files:**
- Create: `src/experience/floors/lazyFloors.tsx`
- Create: `tests/helpers/import-graph.ts`
- Create: `tests/unit/floor-chunks-graph.test.ts`
- Modify: `src/experience/tower/Tower.tsx:7-11` (imports) and the floor switch in `Tower`
- Modify: `src/hud/drawer/bodies.tsx`, `src/hud/drawer/RoomDrawer.tsx` (Suspense around `<Body>`), `src/hud/Hud.tsx:21,128`, `src/hud/drawer/VisitsBody.tsx`
- Modify: `tests/hud/LibraryRoofRooms.test.tsx` (async queries for the lazy Research body), any other `tests/hud/*` that renders a lazy body synchronously

**Interfaces:**
- Consumes: `floorChunks.load(id)` and `FloorChunkModules` from Task 1.
- Produces: `lazyLabs()`, `lazyLibrary()`, `lazyRoof()`: getters returning the current `LazyExoticComponent` for `Labs`, `Library`, `Roof` (same props).

- [x] **Step 1: Write the failing import graph test**

```ts
// tests/helpers/import-graph.ts
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";

export const ROOT = join(__dirname, "../..");
const SRC = join(ROOT, "src");

function resolve(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = join(dirname(from), spec);
  else return null;
  for (const c of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (existsSync(c) && statSync(c).isFile() && /\.tsx?$/.test(c)) return c;
  }
  return null;
}

// Value imports and re-exports only: `import type`, `export type` and dynamic `import()` are skipped.
const STATIC = /^\s*(?:import|export)\s+(type\s+)?[^"';]*?from\s+["']([^"']+)["']|^\s*import\s+["']([^"']+)["']/gm;

/** Repo-relative paths a module reaches through static value imports, transitively (the module itself included). */
export function staticClosure(entry: string): Set<string> {
  const seen = new Set<string>();
  const stack = [join(ROOT, entry)];
  while (stack.length) {
    const file = stack.pop()!;
    const rel = relative(ROOT, file);
    if (seen.has(rel)) continue;
    seen.add(rel);
    for (const m of readFileSync(file, "utf8").matchAll(STATIC)) {
      if (m[1]) continue;
      const target = resolve(file, m[2] ?? m[3]);
      if (target) stack.push(target);
    }
  }
  return seen;
}
```

Check: lines like `import { lazy, type ComponentType } from "react"` must still count as value imports (they do: `m[1]` only matches a leading `type`).

```ts
// tests/unit/floor-chunks-graph.test.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT, staticClosure } from "../helpers/import-graph";

const MAIN = staticClosure("src/experience/Experience.tsx");

/** Code that must reach the browser only through a floor chunk. */
const LAZY_ONLY = [
  "src/experience/floors/Labs.tsx",
  "src/experience/floors/Library.tsx",
  "src/experience/floors/Roof.tsx",
  "src/experience/floors/chunks/labs.ts",
  "src/experience/floors/chunks/library.ts",
  "src/experience/floors/chunks/roof.ts",
  "src/hud/drawer/OpsBody.tsx",
  "src/hud/drawer/ReactorBody.tsx",
  "src/hud/drawer/ResearchBody.tsx",
  "src/hud/drawer/TopicsBody.tsx",
  "src/hud/HologramOverlay.tsx",
  "src/components/stats/VisitsPanel.tsx",
];

describe("floor chunk boundaries (Round 7 B)", () => {
  it("keeps L3, L4 and RF code out of the main 3D chunk's static imports", () => {
    expect(LAZY_ONLY.filter((f) => MAIN.has(f))).toEqual([]);
  });

  it("keeps L1 and L2 in the main 3D chunk", () => {
    expect(MAIN.has("src/experience/floors/Lobby.tsx")).toBe(true);
    expect(MAIN.has("src/experience/floors/CareerArchive.tsx")).toBe(true);
  });

  it("puts each floor and its HUD pieces in its chunk entry", () => {
    const labs = staticClosure("src/experience/floors/chunks/labs.ts");
    expect(["src/experience/floors/Labs.tsx", "src/hud/drawer/OpsBody.tsx", "src/hud/drawer/ReactorBody.tsx", "src/hud/HologramOverlay.tsx"].every((f) => labs.has(f))).toBe(true);
    const library = staticClosure("src/experience/floors/chunks/library.ts");
    expect(["src/experience/floors/Library.tsx", "src/hud/drawer/ResearchBody.tsx", "src/hud/drawer/TopicsBody.tsx"].every((f) => library.has(f))).toBe(true);
    expect(staticClosure("src/experience/floors/chunks/roof.ts").has("src/experience/floors/Roof.tsx")).toBe(true);
  });

  it("imports each chunk entry dynamically from floorChunks.ts only", () => {
    const loader = readFileSync(join(ROOT, "src/experience/floors/floorChunks.ts"), "utf8");
    for (const name of ["labs", "library", "roof"]) expect(loader).toContain(`import("./chunks/${name}")`);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/unit/floor-chunks-graph.test.ts`
Expected: FAIL in the first test, listing `Labs.tsx`, `Library.tsx`, `Roof.tsx`, the four bodies, `HologramOverlay.tsx` and `VisitsPanel.tsx`.

- [x] **Step 3: Implement the lazy wrappers and switch the Tower**

```tsx
// src/experience/floors/lazyFloors.tsx
"use client";

import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import { floorChunks, type FloorChunkModules, type LazyFloor } from "./floorChunks";

/**
 * React.lazy wrappers for the on-demand floors (Round 7 B). React caches a rejected lazy forever, so a
 * failed import drops its wrapper: the canvas remount after the crash (CanvasBoundary) gets a fresh one.
 */
const cache = new Map<LazyFloor, LazyExoticComponent<ComponentType<never>>>();

function lazyFloor<K extends LazyFloor, P>(id: K, pick: (m: FloorChunkModules[K]) => ComponentType<P>): () => LazyExoticComponent<ComponentType<P>> {
  return () => {
    let wrapper = cache.get(id) as LazyExoticComponent<ComponentType<P>> | undefined;
    if (!wrapper) {
      wrapper = lazy(() =>
        floorChunks.load(id).then(
          (m) => ({ default: pick(m) }),
          (error: unknown) => {
            cache.delete(id);
            throw error;
          },
        ),
      );
      cache.set(id, wrapper as LazyExoticComponent<ComponentType<never>>);
    }
    return wrapper;
  };
}

export const lazyLabs = lazyFloor("L3", (m) => m.Labs);
export const lazyLibrary = lazyFloor("L4", (m) => m.Library);
export const lazyRoof = lazyFloor("RF", (m) => m.Roof);
```

The wrappers are getters so a failed import can be replaced on the next mount.

In `src/experience/tower/Tower.tsx`, replace the value imports:

```tsx
import type { LabsLabels } from "../floors/Labs";
import type { LibraryLabels } from "../floors/Library";
import type { RoofLabels } from "../floors/Roof";
import { lazyLabs, lazyLibrary, lazyRoof } from "../floors/lazyFloors";
```

and inside `Tower`, before `return`:

```tsx
  // L3, L4 and RF load on demand (floors/floorChunks.ts); their Suspense fallback is nothing, so the
  // floor's own slab (FloorLevel) is what shows until the chunk arrives. Rides hold for it (elevator.ts).
  const Labs = lazyLabs();
  const Library = lazyLibrary();
  const Roof = lazyRoof();
```

Keep the JSX of the floor switch as it is (`<Labs data={data} labels={labels.labs} tier={tier} />` and so on), inside the existing `<Suspense fallback={null}>` with `ReturnPadSign` and `FloorPrep` after the floor (FloorPrep must keep mounting only once the floor has committed).

- [x] **Step 4: Lazy floor bodies, hologram overlay and visits panel**

`src/hud/drawer/bodies.tsx`:

```tsx
import { lazy, type ComponentType } from "react";
import type { Locale } from "@/content/schema";
import type { RoomView } from "@/content/room-views/types";
import { floorChunks } from "@/experience/floors/floorChunks";
import type { RoomKind } from "@/experience/missions/rooms";
import { MetricTiles, Sections } from "./blocks";
import { HighlightsBody } from "./HighlightsBody";
import { RoofBody } from "./RoofBody";
import { VisitsBody } from "./VisitsBody";

export interface RoomBodyProps {
  view: RoomView;
  locale: Locale;
}

/** The generic sections, shown if a floor chunk ever fails to load (never a crash of the HUD). */
function SectionsBody({ view }: RoomBodyProps) {
  return (
    <div className="space-y-5">
      {view.metrics.length > 0 && <MetricTiles metrics={view.metrics} fluid />}
      <Sections sections={view.sections} />
    </div>
  );
}

/** A body that ships in a floor chunk (Round 7 B); usually already loaded by the idle prefetch. */
function chunkBody(load: () => Promise<ComponentType<RoomBodyProps>>) {
  return lazy(() => load().then((Body) => ({ default: Body }), () => ({ default: SectionsBody })));
}

const OpsBody = chunkBody(() => floorChunks.load("L3").then((m) => m.OpsBody));
const ReactorBody = chunkBody(() => floorChunks.load("L3").then((m) => m.ReactorBody));
const ResearchBody = chunkBody(() => floorChunks.load("L4").then((m) => m.ResearchBody));
const TopicsBody = chunkBody(() => floorChunks.load("L4").then((m) => m.TopicsBody));
```

Keep the existing doc comment and `ROOM_BODIES` map unchanged. Check that `MetricTiles` and `Sections` are exported from `./blocks` (RoomDrawer re-exports them for older callers; import from `./blocks` directly to avoid a cycle with RoomDrawer).

`src/hud/drawer/RoomDrawer.tsx`: wrap the custom body (line with `body = <Body view={view} locale={locale} />;`):

```tsx
    body = (
      <Suspense fallback={<p className="pv-small text-ink-2" role="status">{t("loading")}</p>}>
        <Body view={view} locale={locale} />
      </Suspense>
    );
```

`t` in RoomDrawer is the `drawer` namespace (check: `drawer.loading` is "Loading room" / Indonesian equivalent in `messages/id.json`; if the hook there uses another namespace, use the drawer one). Add `Suspense` to the `react` import.

`src/hud/Hud.tsx`: replace `import { HologramOverlay } from "./HologramOverlay";` with

```tsx
import { floorChunks } from "@/experience/floors/floorChunks";

// The hologram view only opens on L3, whose chunk carries the overlay (Round 7 B).
const HologramOverlay = lazy(() => floorChunks.load("L3").then((m) => ({ default: m.HologramOverlay }), () => ({ default: () => null })));
```

and render it as `<Suspense fallback={null}><HologramOverlay locale={data.locale} /></Suspense>`. Add `lazy`, `Suspense` to the `react` import.

`src/hud/drawer/VisitsBody.tsx`: replace the static `VisitsPanel` import with the same dynamic import the Contact page uses (`src/components/stats/VisitsLazy.tsx`), so no new chunk is created:

```tsx
import { lazy, Suspense, useEffect } from "react";
// ...
const VisitsPanel = lazy(() => import("@/components/stats/VisitsPanel").then((m) => ({ default: m.VisitsPanel })));
```

and render

```tsx
      <Suspense fallback={<p className="pv-small text-ink-2" role="status">{t("loading")}</p>}>
        <VisitsPanel locale={locale} chipLabels={view.visits.chipLabels} floorLabels={view.visits.floorLabels} compact />
      </Suspense>
```

(`t` is the `stats` namespace; `stats.loading` exists in both message files.)

- [x] **Step 5: Run the guard and the HUD tests**

Run: `bunx vitest run tests/unit/floor-chunks-graph.test.ts tests/hud`
Expected: the graph test passes. HUD tests that open `L4:research`, `L4:topics`, `L3:reactor`, `L3:ops` or `L1:visits` through `RoomDrawer` and query synchronously fail; switch those queries to `await within(drawer).findAllByTestId(...)` / `findByTestId` (for example `tests/hud/LibraryRoofRooms.test.tsx` lines 85 to 107) and make the test functions `async`. Tests that render `ReactorBody`, `TopicsBody` directly stay as they are.

Run again: `bunx vitest run tests/unit/floor-chunks-graph.test.ts tests/hud`
Expected: PASS.

- [x] **Step 6: Build and measure**

Run: `bun run build && E2E_PORT=4791 PERF=1 bunx playwright test e2e/perf/bytes-3d.spec.ts --workers=1`
Expected: both tests pass; the log shows lite at most 405 KB and full at most 429 KB (spike: 404.2 and 427.9).

- [x] **Step 7: Commit**

```bash
git add src/experience/floors/lazyFloors.tsx src/experience/tower/Tower.tsx src/hud tests/helpers/import-graph.ts tests/unit/floor-chunks-graph.test.ts tests/hud
git commit -m "feat(3d): load L3, L4 and RF floors and their HUD bodies on demand"
```

---

### Task 3: The car holds at the shaft until the destination chunk has settled

**Files:**
- Modify: `src/experience/tower/elevator.ts` (`Ride`, `RideOptions`, `enterMoving`, `advanceRide`)
- Modify: `src/experience/tower/rideStats.ts` (`RideSummary.chunkHeld`, `stepRideStats` sample, the `[hq ride]` line)
- Modify: `src/experience/scene/Director.tsx` (around line 407: `advanceRide(...)` and `stepRideStats(...)`)
- Modify: `src/experience/scene/ProgramWarmup.tsx` (warm loop)
- Test: `tests/unit/elevator.test.ts`, `tests/unit/ride-stats.test.ts`

**Interfaces:**
- Consumes: `floorChunks.ensure(id)`, `floorChunks.settled(id)`, `floorChunks.load(id)`, `isLazyFloor` (Task 1).
- Produces: `RideOptions.hold?: boolean`; `Ride.chunkHeld?: number` (seconds held for the chunk); `RideSummary.chunkHeld: number`.

- [x] **Step 1: Write the failing tests**

Append to the `describe("destination gate", ...)` block in `tests/unit/elevator.test.ts`:

```ts
  it("holds past PREPARE_TIMEOUT while the destination chunk loads, counting chunkHeld instead of held", () => {
    let r: Ride | null = closing;
    for (let i = 0; i < 20; i++) r = advanceRide(r!, 0.25, { atDoor: true, reduced: false, ready: false, hold: true });
    expect(r).toMatchObject({ stage: "closing", t: STAGE_TIME.closing, held: 0 });
    expect(r!.chunkHeld).toBeCloseTo(5);
    expect(doorsOpen(r, "L1", false)).toBe(0);
    // Chunk in: the usual preparation wait starts from zero, then the car moves once ready.
    r = advanceRide(r!, 0.02, { atDoor: true, reduced: false, ready: false, hold: false })!;
    expect(r).toMatchObject({ stage: "closing" });
    expect(r.held).toBeCloseTo(0.02);
    r = advanceRide(r, 0.02, { atDoor: true, reduced: false, ready: true, hold: false })!;
    expect(r).toMatchObject({ stage: "moving", t: 0 });
    expect(r.chunkHeld).toBeCloseTo(5);
  });

  it("holds reduced motion at the door while the chunk loads", () => {
    const r = advanceRide(ride(), 3, { atDoor: true, reduced: true, ready: true, hold: true })!;
    expect(r.stage).toBe("toDoor");
    expect(r.chunkHeld).toBeCloseTo(3);
  });
```

In `tests/unit/ride-stats.test.ts`, add (match the file's existing helper names; read the top of the file first):

```ts
  it("records the longest chunk hold", () => {
    const stats = startRideStats("L1", "L3", 8);
    stepRideStats(stats, { stage: "closing", y: 0, frameDt: 0.016, held: 0, chunkHeld: 0.5, programs: 10 });
    stepRideStats(stats, { stage: "closing", y: 0, frameDt: 0.016, held: 0, chunkHeld: 2.25, programs: 10 });
    expect(finishRideStats(stats).chunkHeld).toBeCloseTo(2.25);
  });
```

(If the module's finishing function has another name, use it; the summary must carry `chunkHeld`, and the existing summary assertions get `chunkHeld: 0`.)

- [x] **Step 2: Run tests to verify they fail**

Run: `bunx vitest run tests/unit/elevator.test.ts tests/unit/ride-stats.test.ts`
Expected: FAIL (`hold` ignored, `chunkHeld` undefined).

- [x] **Step 3: Implement**

In `src/experience/tower/elevator.ts`:

```ts
export interface Ride {
  // ...existing fields...
  /** Seconds the car waited at closed doors for the destination floor's code chunk (Round 7 B; no timeout). */
  chunkHeld?: number;
}

export interface RideOptions {
  // ...existing fields...
  /** The destination floor's chunk has not settled (floors/floorChunks.ts): never move, whatever the wait. */
  hold?: boolean;
}

/**
 * Enters `moving` once the destination is ready or the wait hit PREPARE_TIMEOUT; until then returns
 * `waiting` (doors closed) with the wait grown by the frame time, not the capped ride time. While the
 * destination chunk loads (`hold`) the car never moves and that time counts as `chunkHeld`, so the
 * preparation timeout only starts once the floor can mount: a ride never shows an empty floor.
 */
function enterMoving(ride: Ride, frameDt: number, ready: boolean, hold: boolean, waiting: Ride): Ride {
  if (hold) return { ...waiting, chunkHeld: (ride.chunkHeld ?? 0) + frameDt };
  const held = ride.held ?? 0;
  if (ready || held >= PREPARE_TIMEOUT) return { ...ride, stage: "moving", t: 0, held };
  return { ...waiting, held: held + frameDt };
}
```

and in `advanceRide` destructure `hold = false` and pass it to both `enterMoving` calls. Update the `advanceRide` doc comment ("...or after PREPARE_TIMEOUT, and never while `hold`").

Note the existing `held` stays untouched while `hold` (the first test expects `held: 0`): `waiting` for the closing case is `{ ...ride, t: duration }`, so `held` carries over as is.

In `src/experience/tower/rideStats.ts`: add `chunkHeld: number` to `RideSummary` (initial 0), accept `chunkHeld?: number` in the `stepRideStats` sample (`s.chunkHeld = Math.max(s.chunkHeld, sample.chunkHeld ?? 0)`), and append `, chunk ${s.chunkHeld.toFixed(2)} s` to the console line only when `chunkHeld > 0`.

In `src/experience/scene/Director.tsx` (imports: `import { floorChunks } from "../floors/floorChunks";`):

```ts
      if (store.getState().ride) {
        // The destination's code chunk loads now if no prefetch did (Round 7 B); the car waits for it.
        floorChunks.ensure(ride.to);
        const next = advanceRide(ride, dt, {
          atDoor,
          reduced: s.reducedMotion,
          ready: destinationReady(ride.to),
          hold: !floorChunks.settled(ride.to),
          cap: rideCap(local.typicalDt),
        });
```

and pass `chunkHeld: ride.chunkHeld ?? 0` in the `stepRideStats` sample a few lines above.

In `src/experience/scene/ProgramWarmup.tsx`, inside the `for (const id of warmQueue(...))` loop, before `warmingFloor.set(id);`:

```ts
        // A lazy floor's code must be here before it can mount hidden (Round 7 B).
        if (isLazyFloor(id)) await floorChunks.load(id).catch(() => null);
        if (cancelled || getHQStore().getState().phase !== "boot") break;
```

(imports: `import { floorChunks, isLazyFloor } from "../floors/floorChunks";`).

- [x] **Step 4: Run tests to verify they pass**

Run: `bunx vitest run tests/unit/elevator.test.ts tests/unit/ride-stats.test.ts tests/unit/ride-prep.test.ts && bunx tsc --noEmit -p .`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/experience/tower/elevator.ts src/experience/tower/rideStats.ts src/experience/scene/Director.tsx src/experience/scene/ProgramWarmup.tsx tests/unit/elevator.test.ts tests/unit/ride-stats.test.ts
git commit -m "feat(3d): the car holds at the shaft until the destination floor chunk loads"
```

---

### Task 4: Prefetch triggers and the test handle

**Files:**
- Create: `src/experience/floors/floorPrefetch.ts`
- Create: `src/experience/floors/FloorChunkPrefetch.tsx`
- Modify: `src/experience/Experience.tsx` (`startSession` deep link loads, mount `<FloorChunkPrefetch />` next to `<Hud ...>`, `__hq.floorChunks`)
- Modify: `src/hud/ElevatorPanel.tsx` (prefetch on pointer enter and focus)
- Test: `tests/unit/floor-prefetch.test.ts`

**Interfaces:**
- Consumes: `floorChunks.prefetch`, `prefetchAll`, `ensure`, `LAZY_FLOORS`, `floorChunksHandle` (Task 1); `afterFirstFrameIdle` (`src/experience/boot-signals.ts`).
- Produces: `prefetchFor(s: PrefetchSnapshot): { need: FloorId[]; soon: FloorId[] }` with `PrefetchSnapshot = { ride: { to: FloorId } | null; picker: { kind: string } | null; hover: { item: { kind: string } } | null }`.

- [x] **Step 1: Write the failing test**

```ts
// tests/unit/floor-prefetch.test.ts
import { describe, expect, it } from "vitest";
import { prefetchFor } from "@/experience/floors/floorPrefetch";

const idle = { ride: null, picker: null, hover: null };

describe("floor chunk prefetch triggers", () => {
  it("needs the ride target at once", () => {
    expect(prefetchFor({ ...idle, ride: { to: "L4" } })).toEqual({ need: ["L4"], soon: [] });
  });

  it("prefetches every lazy floor when the floor picker opens or a call pad is targeted", () => {
    expect(prefetchFor({ ...idle, picker: { kind: "floor" } })).toEqual({ need: [], soon: ["L3", "L4", "RF"] });
    expect(prefetchFor({ ...idle, hover: { item: { kind: "elevator-pad" } } })).toEqual({ need: [], soon: ["L3", "L4", "RF"] });
  });

  it("ignores year pickers, the time console and other targets", () => {
    expect(prefetchFor({ ...idle, picker: { kind: "year" } })).toEqual({ need: [], soon: [] });
    expect(prefetchFor({ ...idle, picker: { kind: "console" } })).toEqual({ need: [], soon: [] });
    expect(prefetchFor({ ...idle, hover: { item: { kind: "door" } } })).toEqual({ need: [], soon: [] });
    expect(prefetchFor(idle)).toEqual({ need: [], soon: [] });
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/unit/floor-prefetch.test.ts`
Expected: FAIL, module not found.

- [x] **Step 3: Implement**

```ts
// src/experience/floors/floorPrefetch.ts
import type { FloorId } from "@/content/schema";
import { LAZY_FLOORS } from "./floorChunks";

export interface PrefetchSnapshot {
  ride: { to: FloorId } | null;
  picker: { kind: string } | null;
  hover: { item: { kind: string } } | null;
}

/**
 * Which floor chunks a store state needs now (`need`: the ride target, loaded even with ?prefetch=off)
 * or will likely need soon (`soon`: the floor picker is open or an elevator call pad is targeted).
 */
export function prefetchFor({ ride, picker, hover }: PrefetchSnapshot): { need: FloorId[]; soon: FloorId[] } {
  const soon = picker?.kind === "floor" || hover?.item.kind === "elevator-pad" ? [...LAZY_FLOORS] : [];
  return { need: ride ? [ride.to] : [], soon };
}
```

```tsx
// src/experience/floors/FloorChunkPrefetch.tsx
"use client";

import { useEffect } from "react";
import { getHQStore } from "@/store/useHQStore";
import { afterFirstFrameIdle } from "../boot-signals";
import { floorChunks } from "./floorChunks";
import { prefetchFor } from "./floorPrefetch";

/**
 * Loads the L3, L4 and RF chunks before they are needed (Round 7 B): every lazy floor once the first
 * frame is drawn and the page is idle, the ride target at once, and every floor when the floor picker
 * opens or an elevator call pad is targeted. Renders nothing.
 */
export function FloorChunkPrefetch() {
  useEffect(() => afterFirstFrameIdle(() => floorChunks.prefetchAll()), []);
  useEffect(() => {
    const store = getHQStore();
    const apply = () => {
      const { need, soon } = prefetchFor(store.getState());
      need.forEach(floorChunks.ensure);
      soon.forEach(floorChunks.prefetch);
    };
    apply();
    return store.subscribe(apply);
  }, []);
  return null;
}
```

Check: `afterFirstFrameIdle`'s default timeout is 2000 ms with `requestIdleCallback` (200 ms `setTimeout` fallback), which is the spec's "idle with a timeout fallback". `store.getState()` must expose `ride`, `picker` and `hover` with the shapes above (they do: `useHQStore.ts` lines 112, 123, 153); if TypeScript disagrees on a field shape, adapt `PrefetchSnapshot` to the store's types rather than casting.

In `src/experience/Experience.tsx`:
1. `import { floorChunks, floorChunksHandle } from "./floors/floorChunks";` and `import { FloorChunkPrefetch } from "./floors/FloorChunkPrefetch";`.
2. In `startSession`, right after `const resume = first ? takeResume() : null;`:

```ts
  // Deep links (and a language switch that resumes a floor) need their floor's chunk at once (Round 7 B).
  for (const floor of [startFloor, startRoom ? floorOf(startRoom) : undefined, resume?.floor]) if (floor) floorChunks.ensure(floor);
```

3. In the `__hq` object add `floorChunks: floorChunksHandle,` (comment: `// Floor chunk states and loads (Round 7 B).`).
4. Render `<FloorChunkPrefetch />` right before `<Hud data={data} ... />` (line 574).

In `src/hud/ElevatorPanel.tsx`, on the floor `<button>` that emits `intents.emit({ type: "elevator", to: id })`, add:

```tsx
            onPointerEnter={() => floorChunks.prefetch(id)}
            onFocus={() => floorChunks.prefetch(id)}
```

with `import { floorChunks } from "@/experience/floors/floorChunks";`.

- [x] **Step 4: Run tests to verify they pass**

Run: `bunx vitest run tests/unit/floor-prefetch.test.ts tests/unit/floor-chunks.test.ts tests/unit/floor-chunks-graph.test.ts tests/hud && bunx tsc --noEmit -p . && bun run lint`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/experience/floors/floorPrefetch.ts src/experience/floors/FloorChunkPrefetch.tsx src/experience/Experience.tsx src/hud/ElevatorPanel.tsx tests/unit/floor-prefetch.test.ts
git commit -m "feat(3d): prefetch floor chunks after the first frame, on elevator intent and on deep links"
```

---

### Task 5: Bundle gate with per-floor chunk caps

**Files:**
- Modify: `e2e/budgets.ts` (`BYTES_3D_BUDGET.floors`)
- Modify: `e2e/perf/bytes-3d.spec.ts`
- Modify: `scripts/perf-report.ts` (`bytes3d` entry `floors?`, summary line)
- Test: `tests/unit/perf-report.test.ts`

**Interfaces:**
- Consumes: `window.__hq.floorChunks.load(id)` and `?prefetch=off` (Tasks 1 and 4).
- Produces: `BYTES_3D_BUDGET.floors: { L3: 20 * 1024, L4: 16 * 1024, RF: 8 * 1024 }`; perf entry `{ kind: "bytes3d"; tier; js; other; floors?: Partial<Record<"L3" | "L4" | "RF", number>> }`.

- [x] **Step 1: Write the failing test**

In `tests/unit/perf-report.test.ts`, add:

```ts
  it("lists the on-demand floor chunks against their caps", () => {
    const entry = { kind: "bytes3d", tier: "lite", js: { "x.js": 400 * 1024 }, other: {}, floors: { L3: 12 * 1024, L4: 10 * 1024, RF: 3.5 * 1024 } } as const;
    const s = renderGates([entry], []);
    expect(s.markdown).toContain("Floor chunks (loaded on demand): L3 12.0 KB of 20.0 KB, L4 10.0 KB of 16.0 KB, RF 3.5 KB of 8.0 KB.");
  });
```

(Match the `kb()` formatting used by the existing "Total 380.0 KB" assertion.)

- [x] **Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/unit/perf-report.test.ts`
Expected: FAIL (no floor line; `floors` not in the entry type).

- [x] **Step 3: Implement**

`e2e/budgets.ts`:

```ts
/**
 * gzip JS the 3D path downloads after the gate, lite and full each. Spec ceiling 600 KB; CI fails at 450 KB.
 * `floors`: each on-demand floor chunk (Round 7 B, floors/floorChunks.ts), measured on its own load.
 */
export const BYTES_3D_BUDGET = {
  failAt: 450 * 1024,
  spec: 600 * 1024,
  minExpected: 100 * 1024,
  floors: { L3: 20 * 1024, L4: 16 * 1024, RF: 8 * 1024 },
} as const;
```

`scripts/perf-report.ts`: extend the `bytes3d` union member with `floors?: Partial<Record<"L3" | "L4" | "RF", number>>`, and in `renderGates` after `out.markdown += \`${s.markdown}Other 3D-path bytes: ...\`` add:

```ts
    if (e.floors) {
      const caps = BYTES_3D_BUDGET.floors;
      const parts = (Object.keys(caps) as (keyof typeof caps)[]).filter((f) => e.floors?.[f] !== undefined).map((f) => `${f} ${kb(e.floors![f]!)} of ${kb(caps[f])}`);
      out.markdown += `Floor chunks (loaded on demand): ${parts.join(", ")}.\n\n`;
    }
```

(Place it so the existing "Other 3D-path bytes" line keeps its trailing blank line; adjust the newline handling so the existing test assertions stay true.)

`e2e/perf/bytes-3d.spec.ts`: update the doc comment (main path measured with `?prefetch=off`; then each floor chunk loaded on its own), and change the 3D part of the test:

```ts
    const transfers = await recordTransfers(page, async () => {
      // ?prefetch=off: the main path only; floor chunks are measured one by one below.
      await page.goto(`/en?tier=${tier}&prefetch=off`);
      await waitForHQ(page);
      await waitForPhase(page, "explore");
      await waitForSceneLive(page);
    });
    const postPasses = /* unchanged */;
    const mainPaths = new Set(transfers.map((t) => t.path));
    const floors: Partial<Record<keyof typeof BYTES_3D_BUDGET.floors, number>> = {};
    for (const floor of Object.keys(BYTES_3D_BUDGET.floors) as (keyof typeof BYTES_3D_BUDGET.floors)[]) {
      const loaded = await recordTransfers(page, () => page.evaluate((f) => (window as unknown as { __hq: { floorChunks: { load: (id: string) => Promise<void> } } }).__hq.floorChunks.load(f), floor), 2000);
      floors[floor] = loaded.filter((t) => t.type === "script" && !seen.has(t.path) && !mainPaths.has(t.path)).reduce((n, t) => n + t.bytes, 0);
      for (const t of loaded) mainPaths.add(t.path);
    }
    await context.close();
```

Move `const seen = ...` above this block (it is built from the Page View transfers). Pass `floors` to `writePerfEntry({ kind: "bytes3d", tier, js, other, floors })`, log them, and assert:

```ts
    for (const [floor, bytes] of Object.entries(floors)) {
      const cap = BYTES_3D_BUDGET.floors[floor as keyof typeof BYTES_3D_BUDGET.floors];
      expect(bytes, `${floor} chunk: did __hq.floorChunks.load fetch any script?`).toBeGreaterThan(0);
      expect(bytes, `${floor} chunk ${kb(bytes)} is over its ${kb(cap)} cap`).toBeLessThan(cap);
    }
```

Note: on a main build (before/after runs) `__hq.floorChunks` is missing; guard the loop with `const hasChunks = await page.evaluate(() => Boolean((window as any).__hq?.floorChunks))` and skip the floor block when false (write the type without `any`, like the `postPasses` read).

- [x] **Step 4: Run tests**

Run: `bunx vitest run tests/unit/perf-report.test.ts && bun run build && E2E_PORT=4791 PERF=1 bunx playwright test e2e/perf/bytes-3d.spec.ts --workers=1 && bun scripts/perf-summary.ts gates --head perf-report`
Expected: PASS; the summary shows the main totals (lite about 404 KB, full about 428 KB) and the floor chunk line with each floor under its cap. Record the numbers for the PR.

- [x] **Step 5: Commit**

```bash
git add e2e/budgets.ts e2e/perf/bytes-3d.spec.ts scripts/perf-report.ts tests/unit/perf-report.test.ts
git commit -m "test(perf): measure the main 3D path and cap each floor chunk"
```

---

### Task 5b: README renderer on demand (headroom to the 15 KB target)

Measured after Task 5: main path lite 405.2 KB, full 428.8 KB, a 14.9 KB drop (Tasks 3 and 4 added about 0.4 KB to the main path). The drawer's README view (`t` key or the "..." menu) is the largest remaining module that only runs on demand: `src/hud/drawer/ascii.ts` (about 1.7 KB gzip alone, type-only imports).

**Files:**
- Modify: `src/hud/drawer/RoomDrawer.tsx` (line 14 import, the `readmeText` memo near line 348 and the README `<pre>` branch)
- Test: `tests/hud/RoomDrawer.test.tsx`; `tests/unit/floor-chunks-graph.test.ts` (`LAZY_ONLY` gets `src/hud/drawer/ascii.ts`)

**Interfaces:**
- Consumes: `renderReadme(view, labels)` from `./ascii` (unchanged).
- Produces: nothing new; the README view renders the same text once the module has loaded.

- [x] **Step 1: Write the failing tests.** Add `"src/hud/drawer/ascii.ts"` to `LAZY_ONLY` in `tests/unit/floor-chunks-graph.test.ts`. In `tests/hud/RoomDrawer.test.tsx`, make every README assertion wait with `findBy*` (the text arrives after the module loads). Run `bunx vitest run tests/unit/floor-chunks-graph.test.ts tests/hud/RoomDrawer.test.tsx`: the graph test fails (ascii is in the main closure).

- [x] **Step 2: Implement.** In `RoomDrawer.tsx` drop the static import and load the renderer the first time README opens:

```tsx
type RenderReadme = (typeof import("./ascii"))["renderReadme"];

/** The README renderer loads the first time the README view opens (Round 7 B: keeps it out of the main 3D chunk). */
function useReadmeRenderer(open: boolean): RenderReadme | null {
  const [render, setRender] = useState<RenderReadme | null>(null);
  useEffect(() => {
    if (!open || render) return;
    let alive = true;
    void import("./ascii").then((m) => alive && setRender(() => m.renderReadme));
    return () => {
      alive = false;
    };
  }, [open, render]);
  return render;
}
```

Use it in the drawer: `const renderReadme = useReadmeRenderer(readme);` and compute `readmeText` with `readme && renderReadme ? renderReadme(view, {...same labels}) : ""`. While `readme` is on and the renderer is not loaded yet, the README branch shows `<p className="pv-small text-ink-2" role="status">{t("loading")}</p>` instead of the `<pre>` (same `drawer.loading` string as the lazy bodies). Keep everything else (focus, `aria-pressed`, the `t` key) unchanged.

- [x] **Step 3: Verify.** `bunx vitest run tests/unit tests/hud`, `bun run typecheck`, `bun run lint`, then `bun run build && E2E_PORT=4791 PERF=1 bunx playwright test e2e/perf/bytes-3d.spec.ts --workers=1`. Expected: main path lite at most 405.1 KB and full at most 428.7 KB (a drop of at least 15 KB from 420.1 and 443.7); record the numbers. Also run `E2E_PORT=4791 bunx playwright test e2e/labs.spec.ts -g -i readme` (the README e2e) and keep it green.

- [x] **Step 4: Commit** `perf(hud): load the drawer README renderer on demand`.

---

### Task 6: E2E: no blank floor, deep links and idle prefetch

**Files:**
- Create: `e2e/floor-chunks.spec.ts`
- Modify: `scripts/e2e-plan.ts` (`ALL_SPECS` gets `"floor-chunks"`; one rule placed before the first `src/experience/floors/...` rule)
- Test: `tests/unit/e2e-plan.test.ts` (existing: every spec is known; add one mapping assertion)

**Interfaces:**
- Consumes: `__hq.floorChunks` (`state`, `snapshot`, `requestedAt`), `__hq.motion()`, `__hq.ridePrep` (Tasks 1, 3, 4).

- [x] **Step 1: Write the spec**

```ts
// e2e/floor-chunks.spec.ts
import { expect, test, type Page } from "@playwright/test";
import { asReturningVisitor, waitForFloor, waitForHQ, waitForSceneLive } from "./hq";

/**
 * On-demand floor chunks (Round 7 B): L3, L4 and RF load after the first frame, on elevator intent and
 * on deep links, and a ride never shows an empty floor (the car holds at closed doors for the chunk).
 */
test.describe.configure({ timeout: 180_000 });

type ChunkWindow = Window & {
  __hq: {
    floorChunks: { state: (id: string) => string; snapshot: () => Record<string, string>; requestedAt: (id: string) => number | null };
    motion: () => { ride: { stage: string; chunkHeld?: number } | null };
    ridePrep: { floors: Map<string, { state: string }> };
  };
  __chunkSamples: { stage: string | null; chunk: string; prep: string | null; chunkHeld: number }[];
};

async function open(page: Page, url: string) {
  await asReturningVisitor(page);
  await page.goto(url);
  await waitForHQ(page);
  await waitForSceneLive(page);
}

const firstFrameAt = (page: Page) => page.evaluate(() => performance.getEntriesByName("hq:first-frame")[0]?.startTime ?? null);

test("loads every floor chunk on idle after the first frame", async ({ page }) => {
  await open(page, "/en?tier=lite");
  await expect.poll(() => page.evaluate(() => (window as unknown as ChunkWindow).__hq.floorChunks.snapshot()), { timeout: 30_000 }).toMatchObject({ L3: "ready", L4: "ready", RF: "ready" });
  const frame = await firstFrameAt(page);
  expect(frame).not.toBeNull();
  for (const id of ["L3", "L4", "RF"]) {
    const at = await page.evaluate((f) => (window as unknown as ChunkWindow).__hq.floorChunks.requestedAt(f), id);
    expect(at, `${id} was requested before the first frame`).toBeGreaterThanOrEqual(frame!);
  }
});

test("a deep link requests its floor chunk before the first frame and builds the floor", async ({ page }) => {
  await open(page, "/en/labs?tier=lite&prefetch=off");
  const frame = await firstFrameAt(page);
  const at = await page.evaluate(() => (window as unknown as ChunkWindow).__hq.floorChunks.requestedAt("L3"));
  expect(at).not.toBeNull();
  expect(at!).toBeLessThanOrEqual(frame!);
  await expect.poll(() => page.evaluate(() => (window as unknown as ChunkWindow).__hq.ridePrep.floors.get("L3")?.state ?? null), { timeout: 30_000 }).toBe("ready");
  // Speculative prefetches are off: the other lazy floors stay unloaded.
  expect(await page.evaluate(() => (window as unknown as ChunkWindow).__hq.floorChunks.snapshot())).toMatchObject({ L4: "idle", RF: "idle" });
});

test("the car holds at closed doors until a slow floor chunk arrives, then the floor is there", async ({ page }) => {
  await open(page, "/en?tier=lite&prefetch=off");
  expect(await page.evaluate(() => (window as unknown as ChunkWindow).__hq.floorChunks.state("L3"))).toBe("idle");
  // Every script requested from now on is a floor chunk: hold each for 6 s (longer than PREPARE_TIMEOUT).
  await page.route(/\/_next\/static\/chunks\/.+\.js$/, async (route) => {
    await new Promise((r) => setTimeout(r, 6000));
    await route.continue();
  });
  await page.evaluate(() => {
    const w = window as unknown as ChunkWindow;
    w.__chunkSamples = [];
    const tick = () => {
      const ride = w.__hq.motion().ride;
      w.__chunkSamples.push({ stage: ride?.stage ?? null, chunk: w.__hq.floorChunks.state("L3"), prep: w.__hq.ridePrep.floors.get("L3")?.state ?? null, chunkHeld: ride?.chunkHeld ?? 0 });
      if (w.__chunkSamples.length < 50_000) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.getByRole("navigation", { name: "Elevator" }).locator('[data-floor="L3"]').click();
  await waitForFloor(page, "L3", 90_000);
  const samples = await page.evaluate(() => (window as unknown as ChunkWindow).__chunkSamples);
  const travelling = samples.filter((s) => s.stage === "moving" || s.stage === "opening" || s.stage === "exiting");
  expect(travelling.length).toBeGreaterThan(0);
  expect(travelling.filter((s) => s.chunk !== "ready"), "the car moved before the L3 chunk arrived").toEqual([]);
  expect(travelling.filter((s) => s.prep === null), "the car moved before the L3 floor mounted").toEqual([]);
  expect(Math.max(...samples.map((s) => s.chunkHeld))).toBeGreaterThan(1.5);
});
```

Check `waitForHQ` is exported from `e2e/hq.ts` (the bytes spec imports it); if the elevator navigation's accessible name differs, copy the selector from `e2e/ride.spec.ts` (`rideTo`).

- [x] **Step 2: Register the spec and the paths**

In `scripts/e2e-plan.ts` add `"floor-chunks"` to `ALL_SPECS` (alphabetical, after `"fast-return"`), and add this rule before the first rule that matches `src/experience/floors/` (rules are first-match):

```ts
  // On-demand floor chunks (Round 7 B): loader, lazy wrappers, prefetch and the chunk entries.
  { test: /^src\/experience\/floors\/(floorChunks|floorPrefetch|lazyFloors|FloorChunkPrefetch)\.tsx?$|^src\/experience\/floors\/chunks\//, specs: ["floor-chunks", "ride", "experience", "labs", "library-roof"] },
```

In `tests/unit/e2e-plan.test.ts` add:

```ts
  it("maps the floor chunk loader to its spec and the ride", () => {
    expect(specsForChanges(["src/experience/floors/floorChunks.ts"]).specs).toEqual(expect.arrayContaining(["floor-chunks", "ride", "experience"]));
  });
```

- [x] **Step 3: Run**

Run: `bunx vitest run tests/unit/e2e-plan.test.ts && E2E_PORT=4791 bunx playwright test e2e/floor-chunks.spec.ts e2e/ride.spec.ts`
Expected: PASS (uses the build from Task 5; rebuild with `bun run build` first if the source changed since).

- [x] **Step 4: Commit**

```bash
git add e2e/floor-chunks.spec.ts scripts/e2e-plan.ts tests/unit/e2e-plan.test.ts
git commit -m "test(e2e): floor chunks load on idle and deep links, rides hold for them"
```

---

### Task 7: Docs, full verification, measurements and PR

**Files:**
- Modify: `AGENTS.md` (folder layout: the new floor chunk files; "3D experience": a "Floor chunks (Round 7 B)" bullet; `window.__hq` list gets `floorChunks`; "Performance gates and measurement": main path with `?prefetch=off`, per-floor caps; the perf overlay note about dynamic imports gets the measured result: floor chunks cost the Classic site +381 B)
- Modify: `docs/features.md` (performance section and status log)
- Modify: `docs/superpowers/specs/agent-hq/08-*.md` section 2 (per-floor chunk caps; owner-approved in the Round 7 design)
- Modify: `docs/deploy.md` only if it states the 3D bytes numbers

- [x] **Step 1: Write the docs** (no em dashes; keep each addition to a few bullets). The AGENTS.md "Floor chunks" bullet must state: L3, L4, RF load through `floorChunks` (`src/experience/floors/floorChunks.ts`, one dynamic import each, chunk entries in `floors/chunks/` carry the floor and its floor-only HUD pieces); never import `Labs`, `Library`, `Roof` or those HUD pieces statically (`tests/unit/floor-chunks-graph.test.ts`); prefetch triggers; the car holds with `hold`/`chunkHeld` (no timeout, a failed import settles and the canvas crash path takes over); Suspense fallback is `null` (the slab); `?prefetch=off` turns speculative prefetches off; G and F keep the floor component props.

- [x] **Step 2: Verify**

Run: `bun run verify:quick`
Expected: PASS.

Run: `bun run e2e:changed`
Expected: PASS.

Run: `E2E_PORT=4791 bun run e2e:perf`
Expected: PASS (bytes, floors, peaks, memory-full). Compare `bun scripts/perf-summary.ts gates --head perf-report` against a main build run (`E2E_DIR=.b7/out-base`) for peaks: no new ride peak.

Run (first frame, base vs head, same session): `E2E_DIR=<main out> E2E_PORT=4792 PERF=1 bunx playwright test e2e/perf/timeline.spec.ts` and the same on the head build; record `firstFrame` medians.

- [x] **Step 3: Commit docs, push and open the PR**

Before pushing: `gh run list -R ShinyQ/ShinyQ-HQ -s in_progress` and `-s queued`; wait while another PR's CI run is active (poll every 5 minutes). PR body: before/after bytes (main path lite and full, each floor chunk), Classic site JS delta, ride and first-frame measurements, test results. Do not merge.
