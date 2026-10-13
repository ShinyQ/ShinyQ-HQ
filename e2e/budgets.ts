/**
 * CI performance budgets for the 3D experience: the authoritative numbers (appendix 08 section 2).
 * Page View budgets live in lighthouserc.json. Change a number only with an owner note in the PR that
 * needs it. Pure data (no Playwright import): e2e/hq.ts, the perf specs and scripts/perf-report.ts read it.
 */
export interface RenderBudget {
  /** Scene draw calls per frame (post-processing passes excluded). */
  sceneCalls: number;
  /** Post-processing passes per frame (the full tier composer: bloom mips, the effect pass). */
  postCalls: number;
  triangles: number;
  /** A settled floor draws more scene calls than this; fewer means it did not render. */
  minSceneCalls: number;
}

export const RENDER_BUDGET: RenderBudget = { sceneCalls: 150, postCalls: 20, triangles: 30_000, minSceneCalls: 10 };

/** Tighter caps on settled scene calls (inclusive): L1 is the densest floor, RF stays light. */
export const FLOOR_SCENE_CAPS: Readonly<Record<string, number>> = { L1: 125, RF: 79 };

/** A settled budget check watches at least this many frames and this long (every frame counts). */
export const BUDGET_WINDOW = { frames: 20, ms: 1200 } as const;

/** gzip JS the 3D path downloads after the gate, lite and full each. Spec ceiling 600 KB; CI fails at 450 KB. */
export const BYTES_3D_BUDGET = { failAt: 450 * 1024, spec: 600 * 1024, minExpected: 100 * 1024 } as const;

/** Lighthouse CI script budget per Page View page (`resource-summary:script:size` in lighthouserc.json). */
export const PAGE_JS_BUDGET = 245_760;

/** Summaries warn when a number reaches this share of its budget. */
export const WARN_RATIO = 0.9;

/** Shader programs per floor may exceed the committed baseline (e2e/perf/baseline.json) by this many. */
export const PROGRAM_HEADROOM = 2;

/**
 * Memory after round trips (P3's e2e/perf/memory.spec.ts): GPU object deltas after `roundTrips` L1 to RF
 * trips and JS heap growth after a forced GC.
 */
export const GPU_MEMORY_BUDGET = { geometries: 0, textures: 0, programs: 0, heapBytes: 2 * 1024 * 1024, roundTrips: 10 } as const;
