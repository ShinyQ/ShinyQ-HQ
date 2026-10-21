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

/** Tighter caps on settled scene calls (inclusive): L1 is the densest floor, RF stays light, B1 is mostly instanced. */
export const FLOOR_SCENE_CAPS: Readonly<Record<string, number>> = { L1: 125, RF: 79, B1: 100 };

/** A settled budget check watches at least this many frames and this long (every frame counts). */
export const BUDGET_WINDOW = { frames: 20, ms: 1200 } as const;

/**
 * gzip JS the 3D path downloads after the gate, lite and full each. Spec ceiling 600 KB. `failAt` gates the critical
 * path before the first frame (`?prefetch=off`), one cap for both tiers set by the larger, full: 466.4 KB (measured
 * 465.8 KB full, 450.0 KB lite). `floors`: each on-demand floor chunk (Round 7 B, floors/floorChunks.ts), measured on
 * its own load; caps are incremental (a module shared by two floors counts toward the first one loaded, L3). Idle
 * prefetch loads every floor in a normal session, so the session total (main + the public floor chunks + the office
 * watch and scene chunks) has its own cap per tier: full 517.5 KB (measured 517.0 KB), lite 501.7 KB (measured 501.2 KB). Owner decisions 2026-10-16
 * and 2026-10-19 (the Study Vault; the floor layouts moved out of the Classic bundle, option A; the inline idle frame
 * cadence, option A), relayed for the L1 Agent Office 2026-10-19/20: each cap, `failAt` included, is the measured value
 * plus about 0.6 KB, re-set whenever the office merges main, for the office's look offset and ghost outline rule on the
 * main path (2026-10-20) and for its final fix round (the wing sign fade, the tower frame rule, the stop chip gate, the
 * fade-in and the chip and canvas helpers moved off the office chunk, 2026-10-20), and re-set for the L1 more-room
 * layout (2026-10-20, measured on its rebase over the office, with the logo program precompile) and for the office's
 * higher wall (2026-10-20: the camera's settled flag and the held look offset on the main path) and its fix round (the
 * camera's zone hold and the chip mode and placement helpers on the main path), and re-set for the office crew (2026-10-21:
 * the living crew, the helper drones, the beacon and the watch) and for the always-live office (owner decision 2026-10-21,
 * docs/decisions/2026-10-21-office-always-live-budgets.md: the office scene chunk joins the session total).
 * B1 (the Engine Room) is measured on its own in an unlocked session (`?unlock=b1&debug=1`). Its cap counts B1 plus
 * any modules it shares with the public floors (`?prefetch=off` never loads L3, L4 or RF first), a safe over-count,
 * and it is left out of the session total: only unlocked visitors load it.
 * The L1 Agent Office chunk (`floors/lobby/office/scene.ts`, idle on every L1 visit since the always-live office, owner
 * decision 2026-10-21) is measured after the office watch chunk, held to `office` and counted in the session total. Its drawer body (`floors/lobby/office/body.ts`, loaded only
 * when an office drawer opens) is measured after the scene chunk and held to the `officeBody` sanity cap. Owner decision
 * 2026-10-20 (the office revamp chunks): the office watch chunk (`floors/lobby/office/watchChunk.ts`, idle on every L1
 * session) is measured right after the session floors, counted in the session total and held to `officeWatch`; the
 * beacon chunk (`floors/lobby/office/beaconChunk.ts`, on the first Needs Kurniadi ask) is measured last and held to
 * `officeBeacon`, outside the session total; each cap is its measured value plus 0.6 KB (614 B). The office revamp's own
 * budget (owner decision 2026-10-20) caps the scene chunk plus the drawer body (and the replay chunk once it ships) at
 * `officeTotal`, 40 KB gzip (the office chunks' own cap; the drawer body and the replay chunk stay outside the session
 * total); `office` and `officeBody` stay sanity caps inside it, re-set for the office crew by the same rule (2026-10-21).
 */
export const BYTES_3D_BUDGET = {
  failAt: Math.round(466.4 * 1024),
  spec: 600 * 1024,
  minExpected: 100 * 1024,
  floors: { L3: 20 * 1024, L4: 16 * 1024, RF: 8 * 1024, B1: 16 * 1024 },
  /** L1 Agent Office scene chunk (idle on every L1 visit, in the session total), incremental over the main path, the session floors and the watch chunk (measured 21,406 B, cap 22,020 B). */
  office: Math.round(21.504 * 1024),
  /** L1 Agent Office drawer body chunk (on an office drawer open), incremental over the office scene chunk: a sanity cap (measured 7,203 B, cap 7,526 B). */
  officeBody: Math.round(7.35 * 1024),
  /** L1 Agent Office total: the scene chunk plus the drawer body (plus the replay chunk once it ships), the office chunks' own cap. */
  officeTotal: 40 * 1024,
  /** L1 office watch chunk (the signal, the watch and the minimap cue; idle on every L1 session), inside the session total (measured 1,461 B, cap 2,075 B). */
  officeWatch: Math.round(2.026 * 1024),
  /** L1 office beacon chunk (the beacon mesh, on the first Needs Kurniadi ask), incremental over the office chunks, outside the session total (measured 1,475 B, cap 2,085 B). */
  officeBeacon: Math.round(2.036 * 1024),
  /** Floor chunks every session loads (idle prefetch): the session total counts these. B1 loads only for unlocked visitors. */
  sessionFloors: ["L3", "L4", "RF"],
  /** Main path + the session floors + the office watch and scene chunks (measured 513,242 B lite, 529,376 B full). */
  session: { lite: Math.round(501.7 * 1024), full: Math.round(517.5 * 1024) },
} as const;

/**
 * Study guide reader (gzip bytes, `e2e/perf/guide-reader.spec.ts`), downloaded only on the Read click: `chunk` is
 * the main-thread JS (the dialog and reader chunks plus pdf.js, measured 140.8 KB), `worker` the pdf.js worker
 * with its Turbopack bootstrap (measured 361.3 KB; pdf.js 6.4's worker alone is about 354 KB).
 */
export const GUIDE_READER_BUDGET = { chunk: 160 * 1024, worker: 400 * 1024 } as const;

/** Lighthouse CI script budget per Page View page (`resource-summary:script:size` in lighthouserc.json). */
export const PAGE_JS_BUDGET = 245_760;

/** Summaries warn when a number reaches this share of its budget. */
export const WARN_RATIO = 0.9;

/** Shader programs per floor may exceed the committed baseline (e2e/perf/baseline.json) by this many. */
export const PROGRAM_HEADROOM = 2;

/**
 * Program settle (`waitForStablePrograms`): programs count as settled when two windows of `frames` frames in a row
 * read the same programs and warmed floors. Its deadline follows the slowest window's frame time: room for `windows`
 * windows, never under `floorMs` (or the caller's timeout), never over `ceilingMs` (a hung page still fails).
 */
export const PROGRAM_SETTLE = { frames: 60, windows: 3, floorMs: 90_000, ceilingMs: 360_000 } as const;

/** The settle deadline in ms after its start, given the slowest measured frame time (ms) and the caller's floor. */
export function programSettleMs(msPerFrame: number, floorMs: number = PROGRAM_SETTLE.floorMs): number {
  const scaled = Math.ceil(PROGRAM_SETTLE.windows * PROGRAM_SETTLE.frames * msPerFrame);
  return Math.max(floorMs, Math.min(PROGRAM_SETTLE.ceilingMs, scaled));
}

/**
 * Memory after round trips: GPU object deltas after `roundTrips` L1 to RF trips and JS heap growth after
 * a forced GC. Two gates use it: `e2e/memory.spec.ts` in the default suite (CI e2e shards; lite, reduced
 * motion: round trips and Page View toggles) and `e2e/perf/memory-full.spec.ts` in the perf lane (full tier,
 * Motion Full: `fullTierRoundTrips` round trips).
 */
export const GPU_MEMORY_BUDGET = {
  geometries: 0,
  textures: 0,
  programs: 0,
  heapBytes: 2 * 1024 * 1024,
  roundTrips: 10,
  pageViewToggles: 5,
  /**
   * Round trips of the full-tier gate: a Motion Full ride on SwiftShader takes about 30 s in CI (10 trips took
   * 14.7 min in run 38609562257 and made the perf lane the critical path). A leak of one object per trip
   * still shows as growth after the first trip.
   */
  fullTierRoundTrips: 3,
} as const;
