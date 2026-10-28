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
 * 476,967 B full, 460,833 B lite; cap 477,594 B). `floors`: each on-demand floor chunk (Round 7 B, floors/floorChunks.ts), measured on
 * its own load; caps are incremental (a module shared by two floors counts toward the first one loaded, L3). Idle
 * prefetch loads every floor in a normal session, so the session total (main + the public floor chunks + the office
 * watch, scene and replay chunks) has its own cap per tier: full 531.8 KB (measured 531.2 KB), lite 516.0 KB (measured 515.4 KB). Owner decisions 2026-10-16
 * and 2026-10-19 (the Study Vault; the floor layouts moved out of the Classic bundle, option A; the inline idle frame
 * cadence, option A), relayed for the L1 Agent Office 2026-10-19/20: each cap, `failAt` included, is the measured value
 * plus about 0.6 KB, re-set whenever the office merges main, for the office's look offset and ghost outline rule on the
 * main path (2026-10-20) and for its final fix round (the wing sign fade, the tower frame rule, the stop chip gate, the
 * fade-in and the chip and canvas helpers moved off the office chunk, 2026-10-20), and re-set for the L1 more-room
 * layout (2026-10-20, measured on its rebase over the office, with the logo program precompile) and for the office's
 * higher wall (2026-10-20: the camera's settled flag and the held look offset on the main path) and its fix round (the
 * camera's zone hold and the chip mode and placement helpers on the main path), and re-set for the office crew (2026-10-21:
 * the living crew, the helper drones, the beacon and the watch) and for the always-live office (owner decision 2026-10-21,
 * docs/decisions/2026-10-21-office-always-live-budgets.md: the office scene chunk joins the session total) and for the ten
 * desks (owner decision 2026-10-21, docs/decisions/2026-10-21-office-live-ten-budgets.md: ten Rovers on two rows) and for the
 * ship-it pipeline (owner decision 2026-10-21, docs/decisions/2026-10-21-office-pipeline-budgets.md: snapshot v4, the
 * tower's lanes per job and the pipeline effects in the scene chunk, the deploy beam in the beacon chunk) and for the day
 * replay (owner decision 2026-10-22, docs/decisions/2026-10-22-office-replay-budgets.md: the replay chunk joins the session
 * total, the scene chunk grew by its tiles, banner, pill and chip mark; `failAt` did not move), and re-set for the L4 reader
 * tracks (owner decision 2026-10-25, docs/decisions/2026-10-25-l4-reader-tracks.md: the owner approved the session raise
 * after the trims; measured lite 527,810 B and full 543,944 B, caps measured + 614 B: lite 528,424 B and full 544,558 B,
 * +2,158 B on both tiers over 526,266 B and 542,400 B; `failAt` and every other cap did not move).
 * B1 (the Engine Room) is measured on its own in an unlocked session (`?unlock=b1&debug=1`). Its cap counts B1 plus
 * any modules it shares with the public floors (`?prefetch=off` never loads L3, L4 or RF first), a safe over-count,
 * and it is left out of the session total: only unlocked visitors load it.
 * The L1 Agent Office chunk (`floors/lobby/office/scene.ts`, idle on every L1 visit since the always-live office, owner
 * decision 2026-10-21) is measured after the office watch chunk, held to `office` and counted in the session total. Its drawer body (`floors/lobby/office/body.ts`, loaded only
 * when an office drawer opens) is measured after the scene chunk and held to the `officeBody` sanity cap. Owner decision
 * 2026-10-20 (the office revamp chunks): the office watch chunk (`floors/lobby/office/watchChunk.ts`, idle on every L1
 * session) is measured right after the session floors, counted in the session total and held to `officeWatch`; the
 * beacon chunk (`floors/lobby/office/beaconChunk.ts`, on the first Needs Kurniadi ask or the first fresh production deploy) is measured last and held to
 * `officeBeacon`, outside the session total; each cap is its measured value plus 0.6 KB (614 B). The office revamp's own
 * budget (owner decision 2026-10-20) caps the scene chunk plus the drawer body and the replay chunk at
 * `officeTotal`, 40 KB gzip (the office chunks' own cap; the drawer body stays outside the session total, the replay chunk
 * is in it, owner decision 2026-10-22); `office`, `officeBody` and `officeReplay` stay sanity caps inside it, re-set by the
 * same rule (last for the day replay, 2026-10-22). The replay controls chunk (loaded only by the drawer's "Show day replay"
 * press) has its own cap, `officeControls`, outside the office total and the session total.
 */
export const BYTES_3D_BUDGET = {
  failAt: Math.round(466.4 * 1024),
  spec: 600 * 1024,
  minExpected: 100 * 1024,
  /** `B1` measured 16,946 B, cap 16,946 + 614 B (owner decision 2026-10-25, docs/decisions/2026-10-25-b1-material-cap.md). */
  floors: { L3: 20 * 1024, L4: 16 * 1024, RF: 8 * 1024, B1: 16_946 + 614 },
  /** L1 Agent Office scene chunk (idle on every L1 visit, in the session total), incremental over the main path, the session floors and the watch chunk (measured 28,217 B, cap 28,831 B; was 26,586 B before the day replay, owner decision 2026-10-22). */
  office: 28_217 + 614,
  /** L1 Agent Office drawer body chunk (on an office drawer open), incremental over the office scene chunk: a sanity cap (measured 7,171 B, cap 7,785 B; 7,018 B and 7,097 B before the replay footer line and the hidden replay button, owner decision 2026-10-22). */
  officeBody: 7_171 + 614,
  /** L1 day replay chunk (the engine, the feed, the label formatting and the replay view; loaded by the idle loop on a quiet L1 visit or the drawer's press, in the session total): measured 5,240 B, cap 5,854 B. */
  officeReplay: 5_240 + 614,
  /** L1 day replay controls (a lazy chunk of the replay chunk, loaded with the drawer's "Show day replay" press), outside the session total and the office total (it loads only on that explicit press, like the beacon): measured 826 B, cap 1,440 B. */
  officeControls: 826 + 614,
  /** L1 Agent Office total: the scene chunk plus the drawer body and the replay chunk (the chunks that load with the office), the office chunks' own cap (measured 40,475 B, cap 40,960 B). The watch, beacon and controls chunks keep their own caps outside it. */
  officeTotal: 40 * 1024,
  /** L1 office watch chunk (the signal, the watch and the minimap cue; idle on every L1 session), inside the session total (measured 1,555 B, cap 2,075 B). */
  officeWatch: Math.round(2.026 * 1024),
  /** L1 office beacon chunk (the beacon and deploy beam mesh, on the first Needs Kurniadi ask or fresh production deploy), incremental over the office chunks, outside the session total (measured 2,043 B, cap 2,657 B). */
  officeBeacon: Math.round(2.595 * 1024),
  /** First-session tour chunk (`hud/dialog/onboarding.ts`, loaded only by a session that plays the tour or Replay tutorial), outside both session totals like the intro chunk (parent session under the owner's delegation, 2026-10-25): measured 1,018 B + 614 B (cap 1,632 B; 1,211 B before the tour stopped driving the rover, 2026-10-27). */
  tour: 1_018 + 614,
  /** Corners menu sheet chunk (`hud/menu/MenuSheet.tsx`, loaded on the menu button's first press), outside both session totals like the tour chunk (owner decision 2026-10-28): measured 1,470 B + 614 B (cap 2,084 B; 1,475 B since it reads the pointer for the key caps). */
  menu: 1_470 + 614,
  /** Pad picker sheet chunk (`hud/pads/PickerSheet.tsx`, loaded when a pad picker first opens), outside both session totals like the menu chunk (owner decision 2026-10-28): measured 1,891 B + 614 B (cap 2,505 B). */
  picker: 1_891 + 614,
  /** Floor chunks every session loads (idle prefetch): the session total counts these. B1 loads only for unlocked visitors. */
  sessionFloors: ["L3", "L4", "RF"],
  /** Main path + the session floors + the office watch, scene and replay chunks (measured 527,810 B lite, 543,944 B full; caps 528,424 B and 544,558 B, +2,158 B each for the L4 reader tracks, owner decision 2026-10-25). */
  session: { lite: 527_810 + 614, full: 543_944 + 614 },
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
