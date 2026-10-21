# Agent Office revamp B: ship-it pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Status: in review (2026-10-21); follows A2 (#276)

Built on what shipped: part A ([#274](https://github.com/ShinyQ/ShinyQ-HQ/pull/274), bcb1080: snapshot v2 with desk
`helpers`, the crew, the watch and beacon chunks, the tower and dock shells with v1 lane light) and part A2
([#276](https://github.com/ShinyQ/ShinyQ-HQ/pull/276), fa1885f; [plan](2026-10-21-agent-office-live-ten.md): snapshot v3
with ten seats, the always-live scene chunk with its far level of detail, two console rows, the chip row for ten).
Contract chain: v1 (five desks), v2 = v1 plus desk `helpers`, v3 = v2 with ten seats (slots 0 to 9), v4 = v3 plus
`pipeline` (this plan). Every piece below names the code as it is on `main` (07a1d033).

**Goal:** Pushes, CI jobs, merges and production deploys of public repositories become physical events in the office
wing: the CI tower's lane matrix shows one lane per workflow job, packets fly from the pushing Rover's desk to the
tower, finished jobs burst green or red, a package flies to the ship dock per merged PR, and a beam rises over the dock
per production deploy.

**Architecture:** The Worker keeps job names and first-seen order per run and derives a `pipeline` block; snapshot v4
(`GET /api/office?v=4`, the v3 snapshot plus `pipeline`) feeds only the 3D scene's poller, while the Classic card and
the office watch stay on v3 and v1, v2 and v3 stay byte for byte. A pure `pipeline.ts` turns successive snapshots into
events; `pipelineFx.ts` writes them into new instances of the office glow and parts meshes (no new draw call or program)
inside the scene's existing in-view gate and far level of detail. The deploy beam is instance 4 of the beacon mesh in
the beacon chunk, driven by the signal's `deployAt` (fed by the watch or the scene), so it also reads from the Lobby;
the beacon chunk then loads on the first ask or the first fresh deploy. One contract change, every side in this PR.

**Tech Stack:** Cloudflare Workers and Durable Objects, Pages Functions, Next.js 16 static export, react-three-fiber, three.js, Vitest, Playwright, Bun.

Design: [`2026-10-20-agent-office-revamp-design.md`](../specs/2026-10-20-agent-office-revamp-design.md) sections 6, 8
and 9 (5.3 for the beacon chunk, 5.9 for the always-live scene, 5.10 for ten seats). Where 6.2, 6.3 and 6.5 predate A2
(the scene parser, the beam on the main path, the byte estimates), this plan wins and Task 9 brings the design up to date.

## Global Constraints

- No em dashes (U+2014) anywhere. Bun only; `rtk` for git; conventional commits.
- Contract: a new version with every side in one PR (Worker, Durable Object, Function, scene); v1, v2 and v3 bodies
  unchanged byte for byte (the golden `GOLDEN_V1` over `goldenDoc()` in `tests/office/state.test.ts` and the v2 and v3
  view tests stay green untouched). The Worker deploys before the Pages upload; a v4 request to a rolled-back Worker or
  Function gets a v3, v2 or v1 body, which `parseOfficeResponseV4` reads as v4 with an empty pipeline (the v2 and v3
  fallback pattern).
- Privacy D3: public allowlisted repositories only; job names already pass `cleanTitle` and the blocklist at ingest
  (`parseGithubEvent`, `workers/office/src/ingest.ts`) and are cut to 40 characters; forks and untrusted actors
  ignored as today; `privatized` strips runs, PRs and feed items, so the pipeline empties. No new beat field.
- Seats: ten (`OFFICE_SEATS`); a run or merge links to a desk through the session's effective seat (`seatOf`: the
  front-row `slot` 0 to 4 or the back-row `seat` 5 to 9), so `slot` in the pipeline ranges 0 to 9.
- Rendering: no new shader program and no new draw call on L1 (the effects are instances of the office glow and parts
  meshes; the beam is the beacon mesh's reserved instance 4, so the spawn gains 1 call only while a beam or an ask
  draws); L1 under 125 scene calls in every view on both tiers. The parts mesh has no instance colour (that would
  compile a new program variant), so a package body is a plain parts box and its violet comes from a glow core and trail.
- Always-live scene: pipeline effects run only inside `OfficeRovers`' frame, after its `officeRuntime.inView` gate and
  through `lodStep` (every frame near, `OFFICE_LOD.farHz` 4 times a second past `OFFICE_LOD.farDistance`); out of view
  nothing steps, and events that went stale meanwhile (60 s) are dropped, while the lanes and the dock stack are state
  and show at once on return. A still office (no event playing, lanes and stack unchanged) writes nothing per frame.
- Chip row (5.7b): the tower and the dock get no chip (the CI drawer is the tower's text alternative); from the office
  stop no packet, package or beam rises over the wall's top (6.6 u: `OFFICE.wall.bottom + OFFICE.wall.h + OFFICE.wall.frame`),
  so the effects stay under the chip row and its leader ticks; `tests/unit/office-chip-placement.test.ts` stays green.
- Reduced motion: no packets, flights, bursts or crown flashes; end states at once (lanes lit, the stack updated, a
  steady beam for 8 s, the dock ring steady).
- Strings: `office.3d.*` in both locales; the `office` namespace is in `CLIENT_NAMESPACES` (not a layout namespace),
  so keep the new strings short (they ride in the HTML of pages that wrap `ClientMessages`).
- Security review (the `security-review` agent) of the v4 surface before merge.

## Budget for B (estimate and cap rule)

Measured on `main` (`e2e/budgets.ts`): the office scene chunk 22,923 B (cap `office` 23,537 B), the drawer body 7,291 B
(`officeBody` 7,526 B), the office total in use about 30.2 KB of `officeTotal` 40 KB, the watch chunk 1,472 B
(`officeWatch` 2,075 B), the beacon chunk 1,614 B (`officeBeacon` 2,085 B), the session totals 514,424 B lite and
530,558 B full (caps 515,072 and 531,149 B; the scene chunk counts in them since A2).

| Chunk | B adds | Expected after B |
|---|---|---|
| Office scene (in the session totals) | `parseOfficeResponseV4` and its validators, `pipeline.ts`, `pipelineFx.ts`, per-job tower lanes, the CI target: about +3.5 to +4.5 KB | about 26.5 to 27.5 KB |
| Drawer body | the CI panel: about +1.0 to +1.5 KB | about 8.3 to 8.8 KB |
| Office total (scene plus body) | | about 35 to 36.3 KB, inside 40 KB |
| Beacon chunk (outside the session total) | `BEAM`, `beamSince`, `beamInstance`, the dock origin: about +0.3 to +0.4 KB | about 1.9 to 2.0 KB |
| Watch chunk | the fresh-deploy trigger, `signalFromBody` reading v4: tens of bytes | under its cap |
| Session totals (lite and full) | the scene chunk's growth | about +3.5 to +4.5 KB each |
| First frame (main path) | `OFFICE_CI_ROOM` and its room view entry: about +0.1 KB | A2 measured 476,538 B full, 1,056 B under `failAt` (477,594 B): it fits; `failAt` moves only if the measured main path passes it |

Cap rule (owner rule, appendix 08 section 2): every cap B moves (`office`, `officeBody`, `officeBeacon`, `session.lite`,
`session.full`, and `failAt` only if needed) is re-set to the measured value plus 0.6 KB (614 B), with the measured bytes
in the cap's comment in `e2e/budgets.ts`, an owner note in the PR and a decision file
`docs/decisions/2026-10-21-office-pipeline-budgets.md`; `officeTotal` stays 40 KB. Stop rule: if the scene chunk measures
over 28.5 KB or the office total over 38 KB, trim (share writers with `crewFx.ts`, shorten tables) before re-setting and
flag it to the owner.

## File structure

| File | Responsibility |
|---|---|
| `src/lib/office/protocol.ts` | v4 types, `OFFICE_PIPELINE`, `parseOfficeResponseV4` (v4, falling back to v3, v2 and v1 bodies) |
| `src/lib/office/fixtures.ts` | `OFFICE_FIXTURES_V4` (runs with 12 named jobs, a back-row run, a merge and a deploy) |
| `workers/office/src/state.ts` | `RunRecord.order`, `names`, `started`; job lanes; `pipelineOf(doc, now)`; `viewV4` |
| `workers/office/src/office.ts`, `worker.ts` | `/snapshot?v=4` |
| `functions/_lib/office.ts` | `VERSIONS[4]` (cache key `/api/office?v=4`, parser, empty-pipeline off answer) |
| `src/lib/office/poll.ts` | `OFFICE_V4_PATH`; `OfficeFeedSnapshot` and the `parse` option take v4 |
| `src/experience/floors/lobby/office/live.ts` | the scene's poller asks `OFFICE_V4_PATH` with `parseOfficeResponseV4` |
| `src/experience/floors/lobby/office/officeModel.ts` | `OfficeView.pipeline` |
| `src/experience/floors/lobby/office/officeSignal.ts` | `signalFromBody` reads v1 to v4 bodies |
| `src/experience/floors/lobby/office/pipeline.ts` (new) | `lanesOf`, `diffPipeline`, `deployRunning`, `PipeQueue` (pure) |
| `src/experience/floors/lobby/office/crewFx.ts` | per-job `TowerLanes`, `towerLanes`, `writeTower`, `towerKey`; `FX_START`, `PIPE_GLOW`, `PIPE_PARTS` |
| `src/experience/floors/lobby/office/officeRig.ts` | `PACKAGE_START`; `officeInstances()` grows by the pipeline blocks |
| `src/experience/floors/lobby/office/pipelineFx.ts` (new) | `arcPoint`, `PipelineFx` (packets, bursts, crown, package, trail, stack, dock ring) |
| `src/experience/floors/lobby/office/OfficeScene.tsx` | diff on each feed, the queue, the writes inside `whenDrawn`, the CI target, probes |
| `src/experience/fx/probes.ts` | `sceneProbes.office.lanes`, `pipe`, `beam` |
| `src/experience/floors/lobby/office/beacon.ts`, `OfficeBeacon.tsx`, `beaconChunk.ts` | the deploy beam on instance 4 (beacon chunk) |
| `src/experience/floors/lobby/office/watchChunk.ts` | loads the beacon chunk on the first ask or the first fresh deploy |
| `src/experience/floors/lobby/officeLayout.ts`, `office/interact.ts`, `src/content/room-views/lobby.ts`, `src/content/room-views/types.ts`, `office/OfficeBody.tsx`, `messages/en.json`, `messages/id.json` | the `L1:office-ci` room, its tower target and the CI drawer |
| `e2e/office-fixtures.ts`, `e2e/office.spec.ts`, `e2e/perf/floors.spec.ts`, `scripts/office-shots.ts` | the v4 route, pipeline e2e, perf spots, captures |

Tests that exist and change: `tests/office/{protocol,state,worker,office-endpoint}.test.ts`;
`tests/unit/{office-poll,office-live,office-model,office-signal,office-watch-loader,office-crew-fx,office-rig,office-beacon,office-beacon-view,office-rooms,office-interact,office-chunk-graph,lobby-office}.test.ts`;
`tests/hud/OfficeBody.test.tsx`; `e2e/office.spec.ts`; `e2e/perf/bytes-3d.spec.ts` (caps only). New:
`tests/unit/office-pipeline.test.ts`, `tests/unit/office-pipeline-fx.test.ts`.

---

### Task 1: Contract v4

**Files:**
- Modify: `src/lib/office/protocol.ts` (header comment, types, validators, parser), `src/lib/office/fixtures.ts`
- Test: `tests/office/protocol.test.ts`

**Interfaces:**
- Consumes: `OFFICE_SEATS` (10), `OfficeSnapshotV3`, `OfficeDisabledV1`, `parseOfficeResponseV3` (v3, also reading v2 and
  v1 bodies with up to ten desks as v3), the private helpers `isObj`, `isInt`, `oneOf`, `onlyKeys`, `optional`,
  `matches`, `isText`, `REPO`, `URL_RE`, `UNSAFE_TEXT`; `OFFICE_FIXTURES`, `OFFICE_FIXTURES_V2`, `OFFICE_FIXTURES_V3`,
  `OFFICE_FIXTURE_NOW`.
- Produces: `OFFICE_PIPELINE = { runs: 3, jobs: 24, ships: 10, jobName: 40, key: 160 }`, `OfficeJobStatus`,
  `OfficePipelineJob`, `OfficePipelineRun`, `OfficeShip`, `OfficePipeline`, `OfficeSnapshotV4`, `OfficeResponseV4`,
  `parseOfficeResponseV4(raw): OfficeResponseV4 | null`, `OFFICE_FIXTURES_V4: Record<keyof typeof OFFICE_FIXTURES, OfficeResponseV4>`.
  (Design 6.2's `parseOfficeAny` is not needed: the v4 parser's own fallback covers rolled-back answers, and the scene
  reads one type, Task 4.)

- [ ] **Step 1: Tests first** (append to `tests/office/protocol.test.ts`):

```ts
describe("snapshot v4", () => {
  const busy = OFFICE_FIXTURES_V4.busy as OfficeSnapshotV4;
  const run = busy.pipeline.runs[0];
  const withPipeline = (pipeline: unknown) => ({ ...busy, pipeline });

  it("accepts the fixtures and rejects extra keys, long lists, bad jobs, a slot past 9 and unknown statuses", () => {
    for (const f of Object.values(OFFICE_FIXTURES_V4)) expect(parseOfficeResponseV4(f)).toEqual(f);
    const bad = [
      withPipeline({ runs: [], ships: [], x: 1 }),
      withPipeline({ runs: Array(OFFICE_PIPELINE.runs + 1).fill(run), ships: [] }),
      withPipeline({ runs: [{ ...run, jobs: Array(OFFICE_PIPELINE.jobs + 1).fill(run.jobs[0]) }], ships: [] }),
      withPipeline({ runs: [{ ...run, jobs: [{ name: "<b>", status: "done" }] }], ships: [] }),
      withPipeline({ runs: [{ ...run, jobs: [{ name: "x".repeat(OFFICE_PIPELINE.jobName + 1), status: "done" }] }], ships: [] }),
      withPipeline({ runs: [{ ...run, slot: OFFICE_SEATS }], ships: [] }),
      withPipeline({ runs: [{ ...run, status: "cancelled" }], ships: [] }),
      withPipeline({ runs: [{ ...run, url: "javascript:alert(1)" }], ships: [] }),
      withPipeline({ runs: [], ships: [{ key: "k", kind: "merge", status: "pushed", at: 1 }] }),
      withPipeline({ runs: [], ships: [{ key: "k".repeat(OFFICE_PIPELINE.key + 1), kind: "deploy", status: "success", at: 1 }] }),
      { ...busy, pipeline: undefined },
      { ...busy, enabled: false },
    ];
    for (const b of bad) expect(parseOfficeResponseV4(b)).toBeNull();
  });

  it("reads a v3, v2 or v1 body (a rolled-back Worker or Function) as v4 with an empty pipeline; the disabled body as is", () => {
    for (const f of [OFFICE_FIXTURES_V3.busy, OFFICE_FIXTURES_V2.busy, OFFICE_FIXTURES.busy]) expect(parseOfficeResponseV4(f)).toEqual({ ...f, v: 4, pipeline: { runs: [], ships: [] } });
    expect(parseOfficeResponseV4(OFFICE_FIXTURES.disabled)).toEqual({ v: 1, enabled: false });
  });

  it("keeps v1, v2 and v3 strict: their parsers reject a v4 body", () => {
    expect(parseOfficeResponse(busy)).toBeNull();
    expect(parseOfficeResponseV2(busy)).toBeNull();
    expect(parseOfficeResponseV3(busy)).toBeNull();
  });

  it("links runs to seats on both rows (the busy fixture's newest run is on back-row desk 6, slot 5)", () => {
    expect(busy.pipeline.runs.map((r) => r.slot)).toEqual([5, 2, undefined]);
  });
});
```

- [ ] **Step 2:** `bunx vitest run tests/office/protocol.test.ts`; expect FAIL (no v4 exports).
- [ ] **Step 3: Implement** in `protocol.ts` (and add v4 to the header comment's version list):

```ts
/** Snapshot v4's pipeline caps: newest runs, lanes (jobs) per run, ships, a job name's length and a ship key's. */
export const OFFICE_PIPELINE = { runs: 3, jobs: 24, ships: 10, jobName: 40, key: 160 } as const;

export type OfficeJobStatus = "queued" | "running" | "done" | "failed";
export interface OfficePipelineJob {
  name: string;
  status: OfficeJobStatus;
}
export interface OfficePipelineRun {
  id: number;
  repo: string;
  title: string;
  url: string;
  status: "running" | "success" | "failure";
  /** The seat (0 to 9) of the live session on the run's public repo and head branch; absent without one (a push to main). */
  slot?: number;
  /** Epoch ms the Worker first saw this attempt. */
  at: number;
  /** First-seen order, at most OFFICE_PIPELINE.jobs; later jobs fold into the last lane's status. */
  jobs: OfficePipelineJob[];
}
export interface OfficeShip {
  /** The feed key: `pr:<repo>#<number>` or `deploy:<id>`. */
  key: string;
  kind: "merge" | "deploy";
  status: "running" | "success" | "failure" | "merged";
  at: number;
  /** A merge's desk (0 to 9), as for runs. */
  slot?: number;
}
export interface OfficePipeline {
  /** Newest first, at most OFFICE_PIPELINE.runs. */
  runs: OfficePipelineRun[];
  /** Newest first, at most OFFICE_PIPELINE.ships. */
  ships: OfficeShip[];
}

/** GET /api/office?v=4 (the 3D scene only): the v3 snapshot (ten seats) with `v: 4` and the pipeline. */
export interface OfficeSnapshotV4 extends Omit<OfficeSnapshotV3, "v"> {
  v: 4;
  pipeline: OfficePipeline;
}
export type OfficeResponseV4 = OfficeSnapshotV4 | OfficeDisabledV1;

const JOB_STATUSES = ["queued", "running", "done", "failed"] as const;
const RUN_STATUSES = ["running", "success", "failure"] as const;
const SHIP_KINDS = ["merge", "deploy"] as const;
const SHIP_STATUSES = ["running", "success", "failure", "merged"] as const;
const isSeat = (x: unknown) => isInt(x, 0, OFFICE_SEATS - 1);

function isJob(x: unknown): boolean {
  return isObj(x) && onlyKeys(x, ["name", "status"]) && typeof x.name === "string" && x.name.length >= 1 && x.name.length <= OFFICE_PIPELINE.jobName && !UNSAFE_TEXT.test(x.name) && oneOf(JOB_STATUSES, x.status);
}

function isRun(x: unknown): boolean {
  return (
    isObj(x) &&
    onlyKeys(x, ["id", "repo", "title", "url", "status", "slot", "at", "jobs"]) &&
    isInt(x.id) &&
    matches(REPO)(x.repo) &&
    isText(x.title) &&
    matches(URL_RE)(x.url) &&
    oneOf(RUN_STATUSES, x.status) &&
    optional(x, "slot", isSeat) &&
    isInt(x.at) &&
    Array.isArray(x.jobs) &&
    x.jobs.length <= OFFICE_PIPELINE.jobs &&
    x.jobs.every(isJob)
  );
}

function isShip(x: unknown): boolean {
  return (
    isObj(x) &&
    onlyKeys(x, ["key", "kind", "status", "at", "slot"]) &&
    typeof x.key === "string" &&
    x.key.length >= 1 &&
    x.key.length <= OFFICE_PIPELINE.key &&
    !UNSAFE_TEXT.test(x.key) &&
    oneOf(SHIP_KINDS, x.kind) &&
    oneOf(SHIP_STATUSES, x.status) &&
    isInt(x.at) &&
    optional(x, "slot", isSeat)
  );
}

function isPipeline(x: unknown): x is OfficePipeline {
  return isObj(x) && onlyKeys(x, ["runs", "ships"]) && Array.isArray(x.runs) && x.runs.length <= OFFICE_PIPELINE.runs && x.runs.every(isRun) && Array.isArray(x.ships) && x.ships.length <= OFFICE_PIPELINE.ships && x.ships.every(isShip);
}

/**
 * Validates GET /api/office?v=4: the v3 checks (ten seats, desk helpers) on everything but `v` and `pipeline`, plus the
 * pipeline (strict keys). A v3, v2 or v1 body (a Worker or Pages deploy rolled back to before v4) reads as v4 with an
 * empty pipeline, so the scene shows the office and part A's anonymous tower progress; the disabled body passes as is.
 */
export function parseOfficeResponseV4(raw: unknown): OfficeResponseV4 | null {
  if (!isObj(raw)) return null;
  if (raw.v === 4) {
    const pipeline = raw.pipeline;
    if (raw.enabled !== true || !isPipeline(pipeline)) return null;
    const rest: Obj = { ...raw, v: 3 };
    delete rest.pipeline;
    const v3 = parseOfficeResponseV3(rest);
    return v3 && v3.enabled ? { ...v3, v: 4, pipeline } : null;
  }
  const older = parseOfficeResponseV3(raw);
  return older && older.enabled ? { ...older, v: 4, pipeline: { runs: [], ships: [] } } : older;
}
```

In `fixtures.ts`, add `OFFICE_FIXTURES_V4` built from `OFFICE_FIXTURES_V3` (`const v4 = (snap: OfficeSnapshotV3, pipeline: OfficePipeline): OfficeSnapshotV4 => ({ ...snap, v: 4, pipeline })`):

```ts
/** The real CI's twelve jobs (the full PR run), named as GitHub names them. */
const CI_JOBS = ["Typecheck, lint, unit tests", ...Array.from({ length: 8 }, (_, i) => `Build, CV and e2e (${i + 1}/8)`), "Lighthouse CI", "3D perf gates 1/2", "3D perf gates 2/2"];
const jobs = (statuses: readonly OfficeJobStatus[]): OfficePipelineJob[] => statuses.map((status, i) => ({ name: CI_JOBS[i], status }));
/** Run 1001 on desk 3 (slot 2): 7 of 12 finished (6 done, 1 failed), 2 running, 3 queued, as that desk's `progress`. */
const RUN_1001: OfficePipelineRun = { id: 1001, repo: HQ, title: "CI · feat/intro-orbit-reveal", url: `${RUNS}/1001`, status: "running", slot: 2, at: ago(6), jobs: jobs(["done", "done", "done", "done", "done", "failed", "done", "running", "running", "queued", "queued", "queued"]) };
const BUSY_PIPELINE: OfficePipeline = {
  runs: [
    // The newest run is back-row desk 6's (slot 5, reviewing on the public repo): its packet starts from the riser.
    { id: 1002, repo: HQ, title: "CI · feat/second-console-row", url: `${RUNS}/1002`, status: "running", slot: 5, at: ago(1), jobs: jobs(["running", "queued", "queued"]) },
    RUN_1001,
    { id: 998, repo: HQ, title: "CI · main", url: `${RUNS}/998`, status: "success", at: ago(121), jobs: jobs(Array(12).fill("done")) },
  ],
  ships: [
    { key: "deploy:999", kind: "deploy", status: "success", at: ago(118) },
    { key: `pr:${HQ}#227`, kind: "merge", status: "merged", at: ago(125) },
  ],
};
const EMPTY: OfficePipeline = { runs: [], ships: [] };

/** The same snapshots as GET /api/office?v=4: busy adds `BUSY_PIPELINE`, rough the same with run 1001 failed, the others an empty pipeline. */
export const OFFICE_FIXTURES_V4: Record<keyof typeof OFFICE_FIXTURES, OfficeResponseV4> = {
  busy: v4(OFFICE_FIXTURES_V3.busy as OfficeSnapshotV3, BUSY_PIPELINE),
  rough: v4(OFFICE_FIXTURES_V3.rough as OfficeSnapshotV3, { ...BUSY_PIPELINE, runs: BUSY_PIPELINE.runs.map((r) => (r.id === 1001 ? { ...r, status: "failure" as const, jobs: r.jobs.map((j) => (j.status === "failed" ? j : { ...j, status: "done" as const })) } : r)) }),
  quiet: v4(OFFICE_FIXTURES_V3.quiet as OfficeSnapshotV3, EMPTY),
  semiLive: v4(OFFICE_FIXTURES_V3.semiLive as OfficeSnapshotV3, EMPTY),
  off: v4(OFFICE_FIXTURES_V3.off as OfficeSnapshotV3, EMPTY),
  disabled: { v: 1, enabled: false },
};
```

- [ ] **Step 4:** Run the test file and `bunx vitest run tests/office/`; expected PASS (the v1 to v3 tests untouched;
  `parseOfficeResponseV3({ ...busy, v: 4 })` in the existing v3 tests still returns null).
- [ ] **Step 5:** Commit `feat(office): snapshot contract v4 with the pipeline`.

### Task 2: The Worker keeps job lanes and builds the pipeline

**Files:**
- Modify: `workers/office/src/state.ts`
- Test: `tests/office/state.test.ts`

**Interfaces:**
- Consumes: `OFFICE_PIPELINE`, `OfficePipeline`, `OfficePipelineJob`, `OfficePipelineRun`, `OfficeShip`, `OfficeSnapshotV4`
  (Task 1); `seatOf`, `effective`, `viewV3`, `OfficeDoc`, `RunRecord`, `JobStatus`, `GithubChange` (state.ts); the test
  file's `T0`, `HQ`, `sid`, `beat`, `publicDoc`, `goldenDoc`.
- Produces: `RunRecord.order?: string[]` (laned job ids in first-seen order, at most 24), `RunRecord.names?: Record<string, string>`
  (laned job names, cut to 40), `RunRecord.started?: number` (first seen, this attempt); all optional, so stored
  documents from before B read through fallbacks. `pipelineOf(doc, now): OfficePipeline`, `viewV4(doc, now): OfficeSnapshotV4`.
  `RunRecord.jobs` keeps every job id as today, so v1 to v3 `progress` (done of total) never changes; the 24-lane cap
  applies only to `order`, `names` and the served lanes.

- [ ] **Step 1: Tests first** (append to `tests/office/state.test.ts`; add `pipelineOf` and `viewV4` to its imports and
  `parseOfficeResponseV4` to the protocol import):

```ts
describe("pipeline (v4)", () => {
  const url = (id: number) => `https://github.com/${HQ}/actions/runs/${id}`;
  const run = (id: number, branch = "feat/x", status: "running" | "success" | "failure" = "running", attempt = 1) => ({ type: "run" as const, id, attempt, branch, title: `CI · ${branch}`, url: url(id), status });
  const job = (runId: number, n: number, status: "queued" | "running" | "done" | "failed", attempt = 1) => ({ type: "job" as const, runId, attempt, jobId: String(n), name: `E2E (${n + 1}/30)`, status });
  const merged = (n: number, branch = "feat/x") => ({ type: "pr" as const, number: n, branch, title: "Thing", url: `https://github.com/${HQ}/pull/${n}`, action: "merged" as const });

  it("keeps job names in first-seen order on 24 lanes; later jobs fold into the last lane; v1 progress still counts all", () => {
    let d = applyGithub(publicDoc(), { repo: HQ, changes: [run(1)] }, "r1", T0);
    for (let n = 0; n < 30; n++) d = applyGithub(d, { repo: HQ, changes: [job(1, n, n === 27 ? "failed" : "done")] }, `j${n}`, T0 + n + 1);
    const lanes = pipelineOf(d, T0 + 100).runs[0].jobs;
    expect(lanes).toHaveLength(24);
    expect(lanes[0]).toEqual({ name: "E2E (1/30)", status: "done" });
    expect(lanes[23]).toEqual({ name: "E2E (24/30)", status: "failed" });
    expect(view(d, T0 + 100).github[0].progress).toEqual({ done: 30, total: 30 });
  });

  it("links a run and a merged PR to the seat of the live session on that public repo and branch, back row included", () => {
    let d = publicDoc();
    for (let n = 1; n <= 7; n++) d = applyBeat(d, beat(n, n === 7 ? { repo: HQ, branch: "feat/x" } : {}), T0 + n);
    d = applyGithub(d, { repo: HQ, changes: [run(2), merged(7)] }, "d2", T0 + 10);
    const p = pipelineOf(d, T0 + 20);
    expect(p.runs[0].slot).toBe(6);
    expect(p.ships[0]).toEqual({ key: `pr:${HQ}#7`, kind: "merge", status: "merged", at: T0 + 10, slot: 6 });
    expect(pipelineOf(d, T0 + 7 + TIMING.removeAfter).runs[0].slot).toBeUndefined();
  });

  it("lists merges and deploys as ships, newest first, and forgets a privatized repository", () => {
    let d = applyGithub(publicDoc(), { repo: HQ, changes: [merged(7)] }, "p7", T0 + 1);
    d = applyGithub(d, { repo: HQ, changes: [{ type: "deploy", id: 9, title: "Deploy · production", url: `https://github.com/${HQ}`, status: "success" }] }, "x9", T0 + 2);
    expect(pipelineOf(d, T0 + 3).ships.map((s) => [s.kind, s.status])).toEqual([["deploy", "success"], ["merge", "merged"]]);
    d = applyGithub(d, { repo: HQ, changes: [{ type: "privatized" }] }, "pv", T0 + 4);
    expect(pipelineOf(d, T0 + 5)).toEqual({ runs: [], ships: [] });
  });

  it("orders runs by first seen; a re-run clears its lanes and restarts its clock", () => {
    let d = applyGithub(publicDoc(), { repo: HQ, changes: [run(1), job(1, 0, "done")] }, "a", T0);
    d = applyGithub(d, { repo: HQ, changes: [run(2, "feat/y")] }, "b", T0 + 5);
    d = applyGithub(d, { repo: HQ, changes: [job(1, 1, "running")] }, "c", T0 + 9);
    expect(pipelineOf(d, T0 + 10).runs.map((r) => r.id)).toEqual([2, 1]);
    d = applyGithub(d, { repo: HQ, changes: [run(1, "feat/x", "running", 2)] }, "e", T0 + 20);
    expect(pipelineOf(d, T0 + 21).runs[0]).toMatchObject({ id: 1, at: T0 + 20, jobs: [] });
  });

  it("reads a stored run from before B (no order, names or started) through the fallbacks", () => {
    const legacy: OfficeDoc = { ...publicDoc(), runs: [{ id: 3, attempt: 1, repo: HQ, branch: "main", title: "CI · main", url: url(3), status: "running", jobs: { a: "done", b: "running" }, updated: T0 }] };
    expect(pipelineOf(legacy, T0 + 1).runs[0]).toMatchObject({ at: T0, jobs: [{ name: "Job", status: "done" }, { name: "Job", status: "running" }] });
  });

  it("serves v4 as the v3 view plus the pipeline, valid for the v4 parser", () => {
    const doc = goldenDoc();
    const v4 = viewV4(doc, T0);
    expect(v4).toEqual({ ...viewV3(doc, T0), v: 4, pipeline: pipelineOf(doc, T0) });
    expect(parseOfficeResponseV4(JSON.parse(JSON.stringify(v4)))).toEqual(v4);
  });
});
```

- [ ] **Step 2:** `bunx vitest run tests/office/state.test.ts`; expect FAIL.
- [ ] **Step 3: Implement.** Extend `RunRecord` with the three optional fields (doc comments as in Interfaces). In
  `applyChange` `case "run"`, build the record from the kept attempt:

```ts
      const restart = prev !== undefined && c.attempt > prev.attempt;
      const kept = restart ? undefined : prev;
      const run: RunRecord = {
        id: c.id,
        attempt: c.attempt,
        repo,
        branch: c.branch,
        title: c.title,
        url: c.url,
        status: c.status,
        jobs: kept?.jobs ?? {},
        ...(kept?.order ? { order: kept.order } : {}),
        ...(kept?.names ? { names: kept.names } : {}),
        ...(kept?.failedJob ? { failedJob: kept.failedJob } : {}),
        started: kept ? (kept.started ?? kept.updated) : now,
        updated: now,
      };
```

In `case "job"`, lane the job while lanes are free (the `jobs` map and `progressOf` stay as they are):

```ts
      const order = laneOrder(run);
      const known = order.includes(c.jobId);
      const laned = known || order.length < OFFICE_PIPELINE.jobs;
      const updated: RunRecord = {
        ...run,
        jobs: { ...run.jobs, [c.jobId]: c.status },
        ...(laned ? { order: known ? order : [...order, c.jobId], names: { ...run.names, [c.jobId]: c.name.slice(0, OFFICE_PIPELINE.jobName).trim() } } : {}),
        ...(c.status === "failed" ? { failedJob: c.name } : {}),
        updated: now,
      };
```

Then add, after `effectiveHelpers`:

```ts
/** A run's laned job ids: `order`, or (a run stored before B) its first job ids. */
const laneOrder = (r: RunRecord): string[] => r.order ?? Object.keys(r.jobs).slice(0, OFFICE_PIPELINE.jobs);

const JOB_RANK: Record<JobStatus, number> = { done: 0, queued: 1, running: 2, failed: 3 };

/** The served lanes: laned jobs in first-seen order; jobs past the cap fold into the last lane (failed over running over queued over done). */
function lanesOf(r: RunRecord): OfficePipelineJob[] {
  const order = laneOrder(r);
  const rest = Object.keys(r.jobs).filter((id) => !order.includes(id));
  return order.map((id, i) => {
    let status: JobStatus = r.jobs[id] ?? "queued";
    if (i === order.length - 1) for (const k of rest) if (JOB_RANK[r.jobs[k]] > JOB_RANK[status]) status = r.jobs[k];
    return { name: r.names?.[id] ?? "Job", status };
  });
}

/** The effective seat (0 to 9, `seatOf`) of the live session on `repo` and `branch` that beat last, if any. */
function seatFor(doc: OfficeDoc, repo: string, branch: string, now: number): number | undefined {
  let best: SessionRecord | undefined;
  for (const s of doc.sessions) if (s.repo === repo && s.branch === branch && seatOf(s) !== null && effective(s, now) !== null && (!best || s.lastBeat > best.lastBeat)) best = s;
  return best ? (seatOf(best) ?? undefined) : undefined;
}

/** The v4 pipeline block (design 6.2): the newest runs with their lanes, and the latest merges and deploys from the feed. */
export function pipelineOf(doc: OfficeDoc, now: number): OfficePipeline {
  const runs = [...doc.runs]
    .sort((a, b) => (b.started ?? b.updated) - (a.started ?? a.updated))
    .slice(0, OFFICE_PIPELINE.runs)
    .map((r): OfficePipelineRun => {
      const slot = seatFor(doc, r.repo, r.branch, now);
      return { id: r.id, repo: r.repo, title: r.title.slice(0, OFFICE_FEED_TITLE_MAX), url: r.url, status: r.status, ...(slot !== undefined ? { slot } : {}), at: r.started ?? r.updated, jobs: lanesOf(r) };
    });
  const ships = doc.feed
    .filter((f) => (f.kind === "pr" && f.status === "merged") || f.kind === "deploy")
    .slice(0, OFFICE_PIPELINE.ships)
    .map((f): OfficeShip => {
      const pr = f.kind === "pr" ? doc.prs.find((p) => f.key === `pr:${p.repo}#${p.number}`) : undefined;
      const slot = pr ? seatFor(doc, pr.repo, pr.branch, now) : undefined;
      return { key: f.key, kind: f.kind === "pr" ? "merge" : "deploy", status: f.status as OfficeShip["status"], at: f.at, ...(slot !== undefined ? { slot } : {}) };
    });
  return { runs, ships };
}

/** The public v4 snapshot at `now` (the 3D scene only): the v3 view (ten seats) with `v: 4` and the pipeline. */
export function viewV4(doc: OfficeDoc, now: number): OfficeSnapshotV4 {
  return { ...viewV3(doc, now), v: 4, pipeline: pipelineOf(doc, now) };
}
```

(`deskOf`'s run lookup, `progressOf`, the feed and `privatized` are unchanged: `privatized` already drops the repo's
runs, PRs and feed items, which empties the pipeline.)
- [ ] **Step 4:** Run `bunx vitest run tests/office/`; expected PASS, the goldens and the v1 to v3 view tests untouched.
- [ ] **Step 5:** Commit `feat(office): the Worker keeps job lanes and builds the pipeline`.

### Task 3: Serve v4 (Durable Object, Worker, Pages Function)

**Files:**
- Modify: `workers/office/src/office.ts`, `workers/office/src/worker.ts`, `functions/_lib/office.ts`
- Test: `tests/office/worker.test.ts`, `tests/office/office-endpoint.test.ts`

**Interfaces:**
- Consumes: `viewV4` (Task 2), `parseOfficeResponseV4`, `OfficeResponseV4`, `OFFICE_FIXTURES_V4` (Task 1); the
  Function's `VERSIONS`, `versionOf`, `jsonAnswer`, `offSnapshot`; the endpoint test's `worker(reply)`, `memoryCache()`,
  `get(env, cache, method, headers, query)`, `SITE`, `T0`.
- Produces: exactly `?v=4` served as v4 at every hop, with its own edge cache entry (`/api/office?v=4`); anything else
  unchanged.

- [ ] **Step 1: Tests first.** `tests/office/worker.test.ts`: `GET /snapshot?v=4` answers `viewV4` (parses with
  `parseOfficeResponseV4`, carries `pipeline`), `?v=3` and `?v=2` unchanged; the forwarding test becomes "forwards only
  `?v=2`, `?v=3` and `?v=4`" and its junk list and the v1 test's list use `?v=5` and `?v=4x` where they use `?v=4` today.
  `tests/office/office-endpoint.test.ts` (the two tests that use `?v=4` as a v1 query move to `?v=5`), plus:

```ts
  it("serves v4 only for ?v=4, from the Worker's v4 snapshot, with one cache entry per version; v1 to v3 unchanged", async () => {
    const bodies: Record<string, unknown> = { "/snapshot": OFFICE_FIXTURES.busy, "/snapshot?v=2": OFFICE_FIXTURES_V2.busy, "/snapshot?v=3": OFFICE_FIXTURES_V3.busy, "/snapshot?v=4": OFFICE_FIXTURES_V4.busy };
    const { binding, calls } = worker((path) => Response.json(bodies[path]));
    const { cache, map } = memoryCache();
    const env: OfficeEnv = { OFFICE_ENABLED: "true", OFFICE: binding };
    expect(await (await get(env, cache, "GET", {}, "?v=4")).json()).toEqual(OFFICE_FIXTURES_V4.busy);
    for (const [query, body] of [["?v=3", OFFICE_FIXTURES_V3.busy], ["?v=2", OFFICE_FIXTURES_V2.busy], ["", OFFICE_FIXTURES.busy], ["?v=5", OFFICE_FIXTURES.busy], ["?v=4x", OFFICE_FIXTURES.busy], ["?v=4&x=%3Cscript%3E", OFFICE_FIXTURES_V4.busy]] as const) expect(await (await get(env, cache, "GET", {}, query)).json(), query).toEqual(body);
    expect([...map.keys()].sort()).toEqual([`${SITE}/api/office`, `${SITE}/api/office?v=2`, `${SITE}/api/office?v=3`, `${SITE}/api/office?v=4`]);
    expect(calls.map((c) => c.path)).toEqual(["/snapshot?v=4", "/snapshot?v=3", "/snapshot?v=2", "/snapshot"]);
  });

  it("serves a v3, v2 or v1 body as v4 with an empty pipeline after a rollback, and mode off as v4 on failure", async () => {
    for (const body of [OFFICE_FIXTURES_V3.busy, OFFICE_FIXTURES_V2.busy, OFFICE_FIXTURES.busy]) {
      const rolledBack = worker(() => Response.json(body)).binding;
      expect(await (await get({ OFFICE_ENABLED: "true", OFFICE: rolledBack }, null, "GET", {}, "?v=4")).json()).toEqual({ ...body, v: 4, pipeline: { runs: [], ships: [] } });
    }
    const off4 = { ...offSnapshot(T0), v: 4, pipeline: { runs: [], ships: [] } };
    expect(parseOfficeResponseV4(off4)).toEqual(off4);
    expect(await (await get({ OFFICE_ENABLED: "true" }, null, "GET", {}, "?v=4")).json()).toEqual(off4);
    expect(await (await get({ OFFICE_ENABLED: "true", OFFICE: worker(() => new Response(null, { status: 500 })).binding }, null, "GET", {}, "?v=4")).json()).toEqual(off4);
    expect(await (await get({ OFFICE_ENABLED: "false" }, null, "GET", {}, "?v=4")).json()).toEqual({ v: 1, enabled: false });
  });
```

(`?v=4&x=...` reads `v` as "4" through `searchParams.get`, so it gets v4's body from the canonical v4 cache entry: only
the `v` value picks the version, and no other query part reaches a cache key or the Worker.)
- [ ] **Step 2:** Run both files; expect FAIL.
- [ ] **Step 3: Implement.** `office.ts` `/snapshot`: `v === "4" ? viewV4(doc, now) : v === "3" ? viewV3(...) : v === "2" ? viewV2(...) : view(...)`
  (one `now`), comment updated. `worker.ts`: forward `v === "2" || v === "3" || v === "4"`, route comment updated.
  `functions/_lib/office.ts`:

```ts
  4: { key: "/api/office?v=4", worker: `${WORKER}/snapshot?v=4`, parse: parseOfficeResponseV4, off: (now: number) => ({ ...offSnapshot(now), v: 4 as const, pipeline: { runs: [], ships: [] } }) },
```

with `versionOf` mapping "4" to 4, `jsonAnswer` and the `value` variable typed with `OfficeResponseV4` too, and the
handler and `VERSIONS` comments naming v4 ("v4: the pipeline, the 3D scene only").
- [ ] **Step 4:** `bunx vitest run tests/office/`; expected PASS.
- [ ] **Step 5:** Commit `feat(office): serve the v4 snapshot at /api/office?v=4`.

### Task 4: The scene polls v4

**Files:**
- Modify: `src/lib/office/poll.ts`, `src/experience/floors/lobby/office/live.ts`, `src/experience/floors/lobby/office/officeModel.ts`,
  `src/experience/floors/lobby/office/officeSignal.ts`, `e2e/office-fixtures.ts`, `e2e/office.spec.ts`, `e2e/perf/floors.spec.ts`, `scripts/office-shots.ts`
- Test: `tests/unit/office-poll.test.ts`, `tests/unit/office-live.test.ts`, `tests/unit/office-model.test.ts`, `tests/unit/office-signal.test.ts`

**Interfaces:**
- Consumes: `createOfficePoller({ path, parse, interval, now })` (the `path` and `parse` options exist since part A),
  `OFFICE_V3_PATH`, `officePollInterval`, `officeLive` and its `near`, `far` and `drawer` reasons (A2), `withSeats`.
- Produces: `OFFICE_V4_PATH` (`/api/office?v=4`); `OfficeFeedSnapshot = Omit<OfficeSnapshot, "v"> & { v: 1 | 2 | 3 | 4; pipeline?: OfficePipeline }`;
  the `parse` option also returns `OfficeResponseV4`; `OfficeView.pipeline: OfficePipeline | null` (null when the view
  is off, offline or disabled, or the snapshot carries none); `signalFromBody` accepts v1 to v4 bodies. Who polls what
  after B: the 3D scene's poller `?v=4`; the Classic card (`src/components/office/OfficePanel.tsx`) and the office watch
  (`officeWatch.ts`) stay on `?v=3`, and the watch still reads `deployAt` from v3's `github` feed.

- [ ] **Step 1: Tests first.**
  - `office-poll`: a poller with `path: OFFICE_V4_PATH, parse: parseOfficeResponseV4` fetches `/api/office?v=4` and
    keeps `pipeline` in `feed().snapshot` for `OFFICE_FIXTURES_V4.busy`; fed `OFFICE_FIXTURES_V3.busy` (a rollback) the
    snapshot is v4 with an empty pipeline.
  - `office-live`: the scene's poller asks `/api/office?v=4` (the URL the stub fetcher records) for every reason; the
    cadence tests stay as they are.
  - `office-model`: `officeView` keeps `pipeline` for a live v4 feed, and gives null for the offline, off and disabled
    feeds and for a v3 snapshot handed in directly.
  - `office-signal`: `signalFromBody(OFFICE_FIXTURES_V4.busy, OFFICE_FIXTURE_NOW)` equals `{ asking: [3, 7], deployAt: null }`;
    the version loop accepts `[1, 2, 3, 4]`; the rejections move from 4 to 5 (`for (const v of [0, 5, "3", null])`, and
    `{ ...OFFICE_FIXTURES_V3.busy, v: 5 }`); eleven desks and a slot of 10 still reject.
- [ ] **Step 2:** `bunx vitest run tests/unit/office-poll.test.ts tests/unit/office-live.test.ts tests/unit/office-model.test.ts tests/unit/office-signal.test.ts`; expect FAIL.
- [ ] **Step 3: Implement.**
  - `poll.ts`: add `OFFICE_V4_PATH` beside `OFFICE_V3_PATH` (comment: "the 3D scene's poller only"), widen
    `OfficeFeedSnapshot` and the `parse` option's return type as in Interfaces (imports `OfficePipeline`,
    `OfficeResponseV4`, `OfficeSnapshotV4` types only).
  - `live.ts`: `createOfficePoller({ now: () => Date.now() + clock.skew, path: OFFICE_V4_PATH, parse: parseOfficeResponseV4, interval: (feed) => officePollInterval(wants, feed) })`;
    its doc comment says it polls v4 (v3 plus the pipeline), reading a rolled-back v3, v2 or v1 body as v4 with an
    empty pipeline.
  - `officeModel.ts`: `OfficeView` gains `pipeline: OfficePipeline | null`, set as `pipeline: live?.pipeline ?? null`
    (`live` is the snapshot when not sleeping, as for `today`); `withSeats` keeps the field (it spreads the snapshot).
  - `officeSignal.ts`: `signalFromBody` accepts `body.v` 1 to 4 (the fields it reads are the same; the scene hands it
    its v4 snapshot); comment updated. The watch chunk still never imports the protocol module.
  - E2E plumbing: `e2e/office-fixtures.ts` widens `OFFICE_API` to `/\/api\/office(\?v=[234])?$/` and adds
    `OFFICE_API_V4 = /\/api\/office\?v=4$/`; `serveOffice` in `e2e/office.spec.ts` answers the v3 and v4 paths with the
    reply body as is (a v3 or v2 body reads as v4 with an empty pipeline, as after a rollback) and the v1 path with
    `asV1`; `pollNow` and the other waits on the scene's fetch wait for `OFFICE_API_V4`, the watch's waits stay on
    `OFFICE_API_V3`. `e2e/perf/floors.spec.ts` and `scripts/office-shots.ts` route the widened `OFFICE_API`.
- [ ] **Step 4:** Run the four files; expected PASS. `bun run build` keeps the Classic JS budget (the card imports only
  `parseOfficeResponseV3`; the v4 validators tree-shake out of its chunk). `bun run e2e:changed` for `e2e/office.spec.ts`
  passes unchanged in behaviour.
- [ ] **Step 5:** Commit `feat(office): the 3D office polls the v4 snapshot`.

### Task 5: Pipeline events (pure)

**Files:**
- Create: `src/experience/floors/lobby/office/pipeline.ts`
- Test: `tests/unit/office-pipeline.test.ts`

**Interfaces:**
- Consumes: `OfficePipeline`, `OfficePipelineRun`, `OfficeJobStatus` (types only), `OFFICE_FIXTURES_V4`, `OFFICE_FIXTURE_NOW`.
- Produces:

```ts
export const PIPE = { staleMs: 60_000, deployRunMs: 15 * 60_000, burstGap: 0.15, packageGap: 1, maxQueue: 40, lanes: 24 } as const;
export type PipeEvent =
  | { kind: "packet"; from: number | "wall"; at: number }
  | { kind: "burst"; lane: number; ok: boolean; at: number }
  | { kind: "crown"; ok: boolean; at: number }
  | { kind: "package"; from: number | "tower"; key: string; at: number }
  | { kind: "deployFailed"; at: number };
export interface Lane { run: number; name: string; status: OfficeJobStatus }
export function lanesOf(p: OfficePipeline | null): Lane[];
export function diffPipeline(prev: OfficePipeline | null, next: OfficePipeline, now: number): PipeEvent[];
export function deployRunning(p: OfficePipeline | null, now: number): boolean;
export class PipeQueue { push(events: readonly PipeEvent[]): void; due(t: number, wall: number): readonly PipeEvent[]; size(): number }
```

  A deploy success is not an event: the beam follows the signal's `deployAt` (Task 7), fed by the watch or the scene,
  so it also fires with the office out of view and on the first snapshot of a deploy under 30 s old.

- [ ] **Step 1: Tests first:**

```ts
import { describe, expect, it } from "vitest";
import { deployRunning, diffPipeline, lanesOf, PIPE, PipeQueue } from "@/experience/floors/lobby/office/pipeline";
import { OFFICE_FIXTURE_NOW, OFFICE_FIXTURES_V4 } from "@/lib/office/fixtures";
import type { OfficePipeline, OfficeSnapshotV4 } from "@/lib/office/protocol";

const P = (OFFICE_FIXTURES_V4.busy as OfficeSnapshotV4).pipeline;
const now = OFFICE_FIXTURE_NOW;
const withJob = (p: OfficePipeline, run: number, lane: number, status: "done" | "failed"): OfficePipeline => ({ ...p, runs: p.runs.map((r) => (r.id === run ? { ...r, jobs: r.jobs.map((j, k) => (k === lane ? { ...j, status } : j)) } : r)) });

describe("office pipeline events", () => {
  it("orders lanes: running runs first (newest first), then the others, at most 24 in all", () => {
    const lanes = lanesOf(P);
    expect(lanes).toHaveLength(PIPE.lanes);
    expect(lanes.slice(0, 3).every((l) => l.run === 1002)).toBe(true);
    expect(lanes[3]).toEqual({ run: 1001, name: "Typecheck, lint, unit tests", status: "done" });
    expect(lanesOf(null)).toEqual([]);
  });

  it("sets a silent baseline on the first snapshot", () => {
    expect(diffPipeline(null, P, now)).toEqual([]);
  });

  it("bursts on a job finishing (on its lane), crowns a finished run, packets a new run from its desk or the wall", () => {
    const k = P.runs[1].jobs.findIndex((j) => j.status === "running");
    expect(diffPipeline(P, withJob(P, 1001, k, "failed"), now)).toEqual([{ kind: "burst", lane: 3 + k, ok: false, at: now }]);
    const fin = { ...P, runs: P.runs.map((r) => (r.id === 1001 ? { ...r, status: "success" as const } : r)) };
    expect(diffPipeline(P, fin, now)).toContainEqual({ kind: "crown", ok: true, at: now });
    const fresh = { ...P.runs[0], id: 1003, slot: 7, at: now - 1_000, jobs: [] };
    expect(diffPipeline(P, { ...P, runs: [fresh, P.runs[0], P.runs[1]] }, now)).toContainEqual({ kind: "packet", from: 7, at: now - 1_000 });
    const main = { ...fresh, id: 1004, slot: undefined };
    expect(diffPipeline(P, { ...P, runs: [main, P.runs[0], P.runs[1]] }, now)).toContainEqual({ kind: "packet", from: "wall", at: now - 1_000 });
  });

  it("packages a new merge from its desk or the tower, pulses the dock on a failed deploy, and drops stale changes", () => {
    const merge = { key: "pr:x#9", kind: "merge" as const, status: "merged" as const, at: now, slot: 1 };
    expect(diffPipeline(P, { ...P, ships: [merge, ...P.ships] }, now)).toEqual([{ kind: "package", from: 1, key: "pr:x#9", at: now }]);
    expect(diffPipeline(P, { ...P, ships: [{ ...merge, slot: undefined }, ...P.ships] }, now)).toEqual([{ kind: "package", from: "tower", key: "pr:x#9", at: now }]);
    const failed = { key: "deploy:1000", kind: "deploy" as const, status: "failure" as const, at: now };
    expect(diffPipeline(P, { ...P, ships: [failed, ...P.ships] }, now)).toEqual([{ kind: "deployFailed", at: now }]);
    expect(diffPipeline(P, { ...P, ships: [{ ...merge, at: now - PIPE.staleMs - 1 }, ...P.ships] }, now)).toEqual([]);
  });

  it("reads a running deploy as the dock's shimmer, for at most 15 minutes", () => {
    const running = { ...P, ships: [{ key: "deploy:1000", kind: "deploy" as const, status: "running" as const, at: now }, ...P.ships] };
    expect(deployRunning(running, now)).toBe(true);
    expect(deployRunning(running, now + PIPE.deployRunMs)).toBe(false);
    expect(deployRunning(P, now)).toBe(false);
  });

  it("staggers bursts and packages, drops stale events and caps the queue", () => {
    const q = new PipeQueue();
    q.push(Array.from({ length: 50 }, (_, i) => ({ kind: "burst" as const, lane: i % 24, ok: true, at: now })));
    expect(q.size()).toBe(PIPE.maxQueue);
    expect(q.due(0, now)).toHaveLength(1);
    expect(q.due(0.1, now)).toHaveLength(0);
    expect(q.due(0.16, now)).toHaveLength(1);
    expect(q.due(0.4, now + PIPE.staleMs + 1)).toEqual([]);
    expect(q.size()).toBe(0);
  });
});
```

- [ ] **Step 2:** `bunx vitest run tests/unit/office-pipeline.test.ts`; expect FAIL.
- [ ] **Step 3: Implement** `pipeline.ts`:

```ts
import type { OfficeJobStatus, OfficePipeline, OfficePipelineRun } from "@/lib/office/protocol";

/**
 * Agent Office pipeline events (design 6.4; office scene chunk, pure): snapshots arrive by polling, so events come from
 * comparing two of them. `staleMs`: older events never play; `deployRunMs`: how long a deploy may read as running;
 * bursts play `burstGap` s apart and packages `packageGap` s apart; at most `maxQueue` wait.
 */
export const PIPE = { staleMs: 60_000, deployRunMs: 15 * 60_000, burstGap: 0.15, packageGap: 1, maxQueue: 40, lanes: 24 } as const;

export type PipeEvent =
  | { kind: "packet"; from: number | "wall"; at: number }
  | { kind: "burst"; lane: number; ok: boolean; at: number }
  | { kind: "crown"; ok: boolean; at: number }
  | { kind: "package"; from: number | "tower"; key: string; at: number }
  | { kind: "deployFailed"; at: number };

export interface Lane {
  run: number;
  name: string;
  status: OfficeJobStatus;
}

const byRunning = (a: OfficePipelineRun, b: OfficePipelineRun) => Number(b.status === "running") - Number(a.status === "running") || b.at - a.at;

/** The tower's lanes bottom to top: running runs first (newest first), then the others, at most `PIPE.lanes` in all. */
export function lanesOf(p: OfficePipeline | null): Lane[] {
  const out: Lane[] = [];
  if (!p) return out;
  for (const r of [...p.runs].sort(byRunning)) for (const j of r.jobs) if (out.length < PIPE.lanes) out.push({ run: r.id, name: j.name, status: j.status });
  return out;
}

const laneIndex = (lanes: readonly Lane[], run: number, k: number): number => {
  let seen = 0;
  for (let i = 0; i < lanes.length; i++) if (lanes[i].run === run && seen++ === k) return i;
  return -1;
};

/** Events between two snapshots: the first (`prev` null, also after offline or off) is a silent baseline. */
export function diffPipeline(prev: OfficePipeline | null, next: OfficePipeline, now: number): PipeEvent[] {
  if (!prev) return [];
  const fresh = (at: number) => now - at <= PIPE.staleMs;
  const out: PipeEvent[] = [];
  const lanes = lanesOf(next);
  const before = new Map(prev.runs.map((r) => [r.id, r]));
  for (const r of next.runs) {
    const old = before.get(r.id);
    if (!old) {
      if (fresh(r.at)) out.push({ kind: "packet", from: r.slot ?? "wall", at: r.at });
      continue;
    }
    r.jobs.forEach((j, k) => {
      if ((j.status === "done" || j.status === "failed") && old.jobs[k]?.status !== j.status) {
        const lane = laneIndex(lanes, r.id, k);
        if (lane >= 0) out.push({ kind: "burst", lane, ok: j.status === "done", at: now });
      }
    });
    if (old.status === "running" && r.status !== "running") out.push({ kind: "crown", ok: r.status === "success", at: now });
  }
  const seen = new Set(prev.ships.map((s) => `${s.key}:${s.status}`));
  for (const s of next.ships) {
    if (seen.has(`${s.key}:${s.status}`) || !fresh(s.at)) continue;
    if (s.kind === "merge") out.push({ kind: "package", from: s.slot ?? "tower", key: s.key, at: s.at });
    else if (s.status === "failure") out.push({ kind: "deployFailed", at: s.at });
  }
  return out;
}

/** Whether the newest deploy is running (and started under `PIPE.deployRunMs` ago): the dock ring's shimmer. */
export function deployRunning(p: OfficePipeline | null, now: number): boolean {
  const d = p?.ships.find((s) => s.kind === "deploy");
  return d !== undefined && d.status === "running" && now - d.at < PIPE.deployRunMs;
}

/** What `due` returns with nothing queued: one shared empty list, so a still office allocates nothing per frame. */
const NONE: readonly PipeEvent[] = [];

/**
 * Plays events staggered in scene time `t` (bursts `burstGap` apart, packages `packageGap` apart, the rest at once),
 * dropping any whose wall time `at` is over `staleMs` old at `wall` (the office was out of view), at most `maxQueue` waiting.
 */
export class PipeQueue {
  private items: PipeEvent[] = [];
  private nextBurst = 0;
  private nextPackage = 0;

  push(events: readonly PipeEvent[]): void {
    this.items.push(...events);
    if (this.items.length > PIPE.maxQueue) this.items.splice(0, this.items.length - PIPE.maxQueue);
  }

  due(t: number, wall: number): readonly PipeEvent[] {
    if (this.items.length === 0) return NONE;
    const out: PipeEvent[] = [];
    const rest: PipeEvent[] = [];
    for (const e of this.items) {
      if (wall - e.at > PIPE.staleMs) continue;
      if (e.kind === "burst" && t < this.nextBurst) rest.push(e);
      else if (e.kind === "package" && t < this.nextPackage) rest.push(e);
      else {
        out.push(e);
        if (e.kind === "burst") this.nextBurst = t + PIPE.burstGap;
        if (e.kind === "package") this.nextPackage = t + PIPE.packageGap;
      }
    }
    this.items = rest;
    return out;
  }

  size(): number {
    return this.items.length;
  }
}
```

- [ ] **Step 4:** Run; expected PASS.
- [ ] **Step 5:** Commit `feat(office): pipeline events from snapshots`.

### Task 6: Pipeline visuals (tower lanes per job, packets, bursts, crown, packages, dock ring)

**Files:**
- Modify: `src/experience/floors/lobby/office/crewFx.ts` (`TowerLanes`, `towerLanes`, `writeTower`, `towerKey`, new
  `DARK_TOWER`, `PIPE_GLOW`, `PIPE_PARTS`), `src/experience/floors/lobby/office/officeRig.ts` (`PACKAGE_START`,
  `officeInstances`), `src/experience/floors/lobby/office/OfficeScene.tsx` (`OfficeRovers`, `restInstances`, the probe
  reset in `OfficeScene`), `src/experience/fx/probes.ts`
- Create: `src/experience/floors/lobby/office/pipelineFx.ts`
- Test: `tests/unit/office-pipeline-fx.test.ts` (new), `tests/unit/office-crew-fx.test.ts`, `tests/unit/office-rig.test.ts`, `tests/unit/office-chunk-graph.test.ts`

**Interfaces:**
- Consumes: `lanesOf`, `diffPipeline`, `deployRunning`, `PipeQueue`, `PipeEvent` (Task 5); `OfficeView.pipeline`,
  `OfficeView.today` (Task 4); `TOWER` (`start` = `OFFICE_SEAT_COUNT` x 38 = 380, 24 lanes of 8 dots), `writeTower`,
  `towerKey`; `PARTS_PER_ROVER` (10), `OFFICE_SEAT_COUNT` (10); `OFFICE_SLOTS` (`officeShell.ts`, each with `rover`,
  `lift`, `yaw`), `OFFICE_ROVER_HEAD_TOP` (`chipRows.ts`, 1.95), `officeTowerColumn`, `officeTowerYaw`, `officeDockPad`,
  `officeWallRect`, `OFFICE.wall`, `OFFICE.tower`, `OFFICE.dock` (`officeLayout.ts`); `STATUS_COLOR` (`officeVisual.ts`),
  `COLORS.violet`, `COLORS.cyan`; `whenDrawn` (`scene/drawnWork.ts`: the latest call per object wins, so the Rovers, the
  tower and the effects share one callback); `lodStep` and `officeRuntime.inView` as the frame uses them now.
- Produces:
  - `crewFx.ts`: `type LaneStatus = "idle" | OfficeJobStatus`; `TowerLanes = { states: readonly LaneStatus[]; chasing: boolean; sig: string }`
    (replacing `{ total, done, running }`); `DARK_TOWER`; `PIPE_GLOW = { start: TOWER.start + TOWER.lanes * TOWER.dots, packets: 3, packetDots: 4, bursts: 3, burstDots: 8, crown: 8, trail: 6, cores: 13, dock: 8, count: 71 }`
    (glow instances 572 to 642); `PIPE_PARTS = { flying: 1, stack: 12, perRow: 3, size: 0.5, count: 13 }`.
  - `officeRig.ts`: `PACKAGE_START = OFFICE_SEAT_COUNT * PARTS_PER_ROVER` (100); `officeInstances()` returns parts
    `PACKAGE_START + PIPE_PARTS.count` (113) and glow `PIPE_GLOW.start + PIPE_GLOW.count` (643); treads and quads unchanged.
  - `pipelineFx.ts`: `FX_CEILING` (6.6 u, the wall's top), `PIPE_FX` timings, `arcPoint`, `arcLift`, `restPipeline`,
    `class PipelineFx { readonly counts; play(e, t, reduced); key(t, merged, deploying, reduced): string; write(t, merged, deploying, reduced, glowM, glowC, parts): void }`.
  - `sceneProbes.office`: `lanes` (lanes not idle), `pipe: { packets, bursts, crowns, packages, deployFailed, stack }`, `beam` (Task 7).

- [ ] **Step 1: Tests first.**
  - `office-crew-fx`: the three `towerLanes` tests read `states`: the busy v4 view gives the 24 `lanesOf` states (the
    back-row run's 3 lanes first); a v3 feed (no pipeline) still gives part A's anonymous lanes from the newest running
    run's `progress` (done lanes `done`, the next `running`, the rest `queued`; scaled past 24 jobs); no run gives
    `DARK_TOWER` and a still key. `writeTower` paints a `failed` lane in `STATUS_COLOR.failure` and every running lane
    chasing. The count test: glow 643 (380 Rover glow, 192 tower dots, 71 pipeline), the pipeline block right after the
    tower's last dot.
  - `office-rig`: parts 113, `PACKAGE_START` 100, the packages after every Rover's parts.
  - `office-pipeline-fx` (new):

```ts
import { describe, expect, it } from "vitest";
import { PIPE_GLOW, PIPE_PARTS } from "@/experience/floors/lobby/office/crewFx";
import { arcLift, arcPoint, FX_CEILING, PIPE_FX, PipelineFx } from "@/experience/floors/lobby/office/pipelineFx";
import { officeInstances } from "@/experience/floors/lobby/office/officeRig";

const glow = () => ({ m: new Float32Array(officeInstances().glow * 16), c: new Float32Array(officeInstances().glow * 3) });
const parts = () => new Float32Array(officeInstances().parts * 16);
const scaleAt = (m: Float32Array, i: number) => Math.hypot(m[i * 16], m[i * 16 + 1], m[i * 16 + 2]);
const yAt = (m: Float32Array, i: number) => m[i * 16 + 13];

describe("office pipeline visuals", () => {
  it("arcs from start to end and never over the wall's top", () => {
    const a = { x: 0, y: 2, z: 0 };
    const b = { x: 10, y: 4.6, z: 4 };
    const out = { x: 0, y: 0, z: 0 };
    expect(arcPoint(a, b, 0, 2, out)).toEqual(a);
    expect(arcPoint(a, b, 1, 2, out)).toEqual(b);
    const lift = arcLift(a, b, Infinity);
    for (let u = 0; u <= 1; u += 0.05) expect(arcPoint(a, b, u, lift, out).y).toBeLessThanOrEqual(FX_CEILING + 1e-9);
  });

  it("a burst grows a ring of 8 dots for 0.6 s, then nothing is drawn and the key goes still", () => {
    const fx = new PipelineFx();
    const g = glow();
    fx.play({ kind: "burst", lane: 5, ok: false, at: 0 }, 10, false);
    fx.write(10.3, 0, false, false, g.m, g.c, parts());
    const ring = PIPE_GLOW.start + PIPE_GLOW.packets * PIPE_GLOW.packetDots;
    expect(Array.from({ length: 8 }, (_, i) => scaleAt(g.m, ring + i) > 0)).toEqual(Array(8).fill(true));
    fx.write(10 + PIPE_FX.burst.s + 0.01, 0, false, false, g.m, g.c, parts());
    expect(scaleAt(g.m, ring)).toBe(0);
    expect(fx.key(11, 0, false, false)).toBe(fx.key(12, 0, false, false));
  });

  it("flies a package from a desk to the dock, then stacks today's merges (at most 12); reduced motion only stacks", () => {
    const fx = new PipelineFx();
    const p = parts();
    const g = glow();
    fx.play({ kind: "package", from: 7, key: "pr:x#1", at: 0 }, 0, false);
    for (let t = 0; t <= PIPE_FX.package.s; t += 0.1) {
      fx.write(t, 3, false, false, g.m, g.c, p);
      expect(yAt(p, 100)).toBeLessThanOrEqual(FX_CEILING + 1e-9);
    }
    fx.write(PIPE_FX.package.s + 0.1, 20, false, false, g.m, g.c, p);
    expect(scaleAt(p, 100)).toBe(0);
    expect(Array.from({ length: PIPE_PARTS.stack }, (_, i) => scaleAt(p, 101 + i) > 0).filter(Boolean)).toHaveLength(12);
    const still = new PipelineFx();
    still.play({ kind: "package", from: 7, key: "pr:x#2", at: 0 }, 0, true);
    still.write(0, 2, false, true, g.m, g.c, p);
    expect(scaleAt(p, 100)).toBe(0);
    expect(still.key(0, 2, false, true)).toBe(still.key(5, 2, false, true));
  });

  it("counts what played for the probe and skips packets, bursts and the crown under reduced motion", () => {
    const fx = new PipelineFx();
    fx.play({ kind: "packet", from: 2, at: 0 }, 0, false);
    fx.play({ kind: "burst", lane: 0, ok: true, at: 0 }, 0, true);
    fx.play({ kind: "crown", ok: true, at: 0 }, 0, true);
    expect(fx.counts).toMatchObject({ packets: 1, bursts: 0, crowns: 0 });
  });
});
```

  - `office-chunk-graph`: `pipeline.ts` and `pipelineFx.ts` join `OFFICE_ONLY` (the scene chunk only, never the main
    path, the watch or the beacon chunk).
- [ ] **Step 2:** `bunx vitest run tests/unit/office-pipeline-fx.test.ts tests/unit/office-crew-fx.test.ts tests/unit/office-rig.test.ts tests/unit/office-chunk-graph.test.ts`; expect FAIL.
- [ ] **Step 3: Implement.**
  - `crewFx.ts` lanes (writeTower keeps its geometry: the stop-facing face, `TOWER.base`, `gap`, `across`):

```ts
export type LaneStatus = "idle" | OfficeJobStatus;

export interface TowerLanes {
  /** Lane states bottom to top, at most `TOWER.lanes`; the lanes past them stay the dim idle grid. */
  states: readonly LaneStatus[];
  /** Whether any lane runs (its dots chase). */
  chasing: boolean;
  /** The states as one string, built once per view, for `towerKey`. */
  sig: string;
}

const tower = (states: LaneStatus[]): TowerLanes => ({ states, chasing: states.includes("running"), sig: states.map((s) => s[0]).join("") });
export const DARK_TOWER: TowerLanes = tower([]);

/**
 * The tower's lanes: one per job from snapshot v4's pipeline (`lanesOf`: running runs first, at most 24), else part A's
 * anonymous lanes from the newest running public run's `progress` (a v4 body with no runs, after a rollback), dark without either.
 */
export function towerLanes(view: OfficeView): TowerLanes {
  const lanes = lanesOf(view.pipeline);
  if (lanes.length > 0) return tower(lanes.map((l) => l.status));
  let run: OfficeView["github"][number] | null = null;
  for (const g of view.github) if (g.kind === "run" && g.status === "running" && (!run || g.at > run.at)) run = g;
  if (!run) return DARK_TOWER;
  const jobs = run.progress?.total ?? 1;
  const total = Math.min(TOWER.lanes, jobs);
  const finished = Math.min(jobs, run.progress?.done ?? 0);
  const done = jobs > TOWER.lanes ? Math.floor((finished * total) / jobs) : finished;
  return tower(Array.from({ length: total }, (_, i): LaneStatus => (i < done ? "done" : i === done ? "running" : "queued")));
}

/** Changes when `writeTower` would write other colours: the lane states, and the chasing dot while a lane runs. */
export function towerKey(lanes: TowerLanes, t: number, reduced: boolean): string {
  return `${lanes.sig}:${reduced || !lanes.chasing ? 0 : Math.floor(t * 8) % TOWER.dots}`;
}
```

    In `writeTower`, per lane: `const s = lanes.states[lane] ?? "idle"`; size `TOWER.size.idle` when idle else `lit`;
    colour and gain `done` green (`#34d399`, `TOWER.done`), `failed` `STATUS_COLOR.failure` (`TOWER.done`), `running`
    `#a78bfa` chasing (1.4 on the head dot, 0.5 elsewhere), `queued` the idle grey at `TOWER.pending`, `idle` at
    `TOWER.idle`. Then `PIPE_GLOW` and `PIPE_PARTS` as in Interfaces, with doc comments listing each block.
  - `officeRig.ts`: `PACKAGE_START` and the two counts; the doc comment of `officeInstances` names the blocks in order
    (Rover glow, tower dots, pipeline effects; Rover parts, packages).
  - `pipelineFx.ts` (office scene chunk; no allocation in `write`: module temporaries, fixed pools):

```ts
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** The highest any pipeline effect flies (u): the wall's top, so from the office stop nothing rises into the chip row (5.7b). */
export const FX_CEILING = OFFICE.wall.bottom + OFFICE.wall.h + OFFICE.wall.frame;

/** Durations (s) and shapes: packets arc 1.5 s up to 2 u, packages 2.5 s, bursts widen from 0.2 u to 1 u over 0.6 s, the crown flashes 0.5 s, a failed deploy pulses the dock ring 0.8 s, a running deploy shimmers it at 0.5 Hz. */
export const PIPE_FX = { packet: { s: 1.5, lift: 2 }, package: { s: 2.5 }, burst: { s: 0.6, r0: 0.2, r1: 1 }, crown: { s: 0.5 }, deployFailed: { s: 0.8 }, shimmerHz: 0.5 } as const;

/** A point `u` (0 to 1) along a parabola from `a` to `b` that rises `lift` u over the straight line at its middle (writes `out`). */
export function arcPoint(a: Vec3, b: Vec3, u: number, lift: number, out: Vec3): Vec3 {
  out.x = a.x + (b.x - a.x) * u;
  out.y = a.y + (b.y - a.y) * u + 4 * u * (1 - u) * lift;
  out.z = a.z + (b.z - a.z) * u;
  return out;
}

/** The lift (at most `want`) that keeps an arc from `a` to `b` under `FX_CEILING`. */
export const arcLift = (a: Vec3, b: Vec3, want: number): number => Math.max(0, Math.min(want, FX_CEILING - Math.max(a.y, b.y)));
```

    The ends: a desk is `OFFICE_SLOTS[slot].rover` at `lift + OFFICE_ROVER_HEAD_TOP` (both rows, slots 0 to 9); the
    wall is the centre of `officeWallRect`'s front face at mid height; the tower is `officeTowerColumn` on its stop-facing
    face at the lane's height (`OFFICE.tower.plinth + TOWER.base + lane * TOWER.gap`, the middle lane for packets); the
    dock is `officeDockPad` at `OFFICE.dock.pad` plus the stack's height. `PipelineFx` keeps fixed pools (3 packets,
    3 bursts, one crown, one flying package with its trail, one dock pulse; a new event takes the oldest slot) of
    `{ t0, from, lane, ok }`, laid out in the glow block in `PIPE_GLOW`'s order (packets, bursts, crown, trail, cores, dock). `play` starts an effect at scene time `t` and bumps `counts` for what it starts; under reduced motion it starts
    nothing for packets, bursts and the crown, ends a package at once (it joins the stack) and holds the failed-deploy
    ring steady for its 0.8 s. `write` walks the pools: packets as 4 cyan dots 0.08 u apart along `arcPoint` (lift
    `arcLift(a, b, PIPE_FX.packet.lift)`), bursts as 8 dots on a ring around the lane's middle dot in the column's face
    plane (radius `r0 + u * (r1 - r0)`, `COLORS.green` or `STATUS_COLOR.failure`, gain `1 - u`), the crown as the 8 dots
    over the column's top flashing once, the flying package as the parts box `PACKAGE_START` (0.5 u) on `arcPoint` (lift
    `arcLift(a, b, Infinity)`, so it peaks at the wall's top) with a `COLORS.violet` glow core and a 6-dot violet trail
    behind it, the stack as `min(12, merged)` parts boxes on the dock pad (3 per row, 4 rows; minus the one in flight,
    which lands as the next box) each with a violet core, and the dock ring as 8 dots around the pad (a violet shimmer
    while `deploying`, steady under reduced motion; a red pulse after `deployFailed`). Every unused instance is written
    at zero scale on the tower column (glow) or the dock pad (parts), never at the origin, so the glow mesh's computed
    bounds stay on the office; `restPipeline(glowM, glowC, parts)` writes that rest state. `key` changes only when the
    picture does: a 30 Hz tick while any effect plays, the stack count, and the dock ring's state (an 8 Hz tick while it
    shimmers in full motion), so a still office keeps one key and writes nothing.
  - `OfficeScene.tsx`: `restInstances` calls `writeTower(DARK_TOWER, ...)` (the local `DARK_TOWER` constant goes) and
    `restPipeline`. In `OfficeRovers`:

```tsx
  const fx = useMemo(() => new PipelineFx(), []);
  const queue = useMemo(() => new PipeQueue(), []);
  const prevPipe = useRef<OfficePipeline | null>(null);
  const fxKey = useRef("");
  // Each new feed: diff against the last pipeline (a silent baseline after a load, offline or off).
  useEffect(() => {
    const next = view.pipeline;
    if (next) queue.push(diffPipeline(prevPipe.current, next, Date.now()));
    prevPipe.current = next;
  }, [view.pipeline, queue]);
  useEffect(() => {
    sceneProbes.office.lanes = lanes.states.filter((s) => s !== "idle").length;
  }, [lanes]);
```

    and in its `useFrame`, after `stepOfficeCrew` (so only in view, and at the far rate past `OFFICE_LOD.farDistance`):

```tsx
    const wall = Date.now();
    for (const e of queue.due(now, wall)) fx.play(e, now, reduced);
    const merged = view.today?.prsMerged ?? 0;
    const deploying = deployRunning(view.pipeline, wall);
    const tk = towerKey(lanes, now, reduced);
    const fk = fx.key(now, merged, deploying, reduced);
    if (writes.pending() || tk !== lanesKey.current || fk !== fxKey.current) {
      const rovers = view.rovers;
      // One callback per object (the latest wins): the Rovers, the tower and the pipeline effects together.
      whenDrawn(g, () => {
        flushRovers(writes, crew.fx, slots, rovers, now, reduced, lite, { parts: P, treads: D, glow: G, quads: Q }, drawn);
        const gm = G.instanceMatrix.array as Float32Array;
        const gc = G.instanceColor!.array as Float32Array;
        if (tk !== lanesKey.current) {
          writeTower(lanes, now, reduced, gm, gc);
          lanesKey.current = tk;
          G.instanceMatrix.needsUpdate = G.instanceColor!.needsUpdate = true;
        }
        if (fk !== fxKey.current) {
          fx.write(now, merged, deploying, reduced, gm, gc, P.instanceMatrix.array as Float32Array);
          fxKey.current = fk;
          Object.assign(sceneProbes.office.pipe, fx.counts, { stack: Math.min(PIPE_PARTS.stack, merged) });
          G.instanceMatrix.needsUpdate = G.instanceColor!.needsUpdate = P.instanceMatrix.needsUpdate = true;
        }
      });
    }
```

    The `OfficeRovers` doc comment adds the pipeline effects to the glow and parts meshes and to the far-LOD list;
    `OfficeScene`'s probe reset adds `lanes: 0`, `pipe` zeroed and `beam: false`. `probes.ts` adds the three fields.
- [ ] **Step 4:** Run the four files, then `bunx vitest run tests/unit/office-*.test.ts`; expected PASS (the crew frame
  and still-office tests unchanged: an office with no event and steady lanes writes nothing).
- [ ] **Step 5:** Commit `feat(office): tower lanes per job, packets, bursts and packages`.

### Task 7: The deploy beam (beacon chunk)

**Files:**
- Modify: `src/experience/floors/lobby/office/beacon.ts`, `src/experience/floors/lobby/office/OfficeBeacon.tsx`,
  `src/experience/floors/lobby/office/beaconChunk.ts` (comment), `src/experience/floors/lobby/office/watchChunk.ts`,
  `src/experience/floors/lobby/office/OfficeMount.tsx` and `watchLoader.ts` (comments: the beacon chunk loads on the
  first ask or the first fresh deploy)
- Test: `tests/unit/office-beacon.test.ts`, `tests/unit/office-watch-loader.test.ts`, `tests/unit/office-beacon-view.test.ts`

**Interfaces:**
- Consumes: `officeSignal.deployAt` (a deploy success at most 30 s old, from `signalFromBody`; fed by the office watch
  over v3 while the scene's poller is not running, else by `OfficeScene` from its v4 feed; cleared 60 s after `goodAt`);
  `BEACON` (`slots` 5: column, three rings, instance 4 reserved for this beam), `BeaconInstance`, `beaconInstances`,
  `beaconGain`, `beaconOrigin`; `atOfficeStop`; `officeDockPad`, `OFFICE.wall`, `LOBBY.officeWing`; `COLORS.green`;
  `loadOfficeBeacon`, `setOfficeAsks` (`watchLoader.ts`); `sceneProbes.office.beam` (Task 6).
- Produces: `BEAM = { slot: 4, h: 40, r: 1.1, s: 8, rise: 0.6, fade: 1.5, stopH }` (`stopH` the wall's top, 6.6 u);
  `BeamClock`; `beamSince(deployAt, t, clock): number | null`; `beamInstance(since, reduced, atStop, out)`. The beacon
  mesh draws while a Rover asks or a beam runs; the watch chunk loads the beacon chunk on the first ask or the first
  fresh deploy (`deployAt` not null).

- [ ] **Step 1: Tests first.**
  - `office-beacon`:

```ts
describe("deploy beam", () => {
  it("fires once per new deploy, for 8 s of scene time from the moment it is first seen", () => {
    const clock: BeamClock = { deployAt: null, t0: 0 };
    expect(beamSince(null, 1, clock)).toBeNull();
    expect(beamSince(5_000, 10, clock)).toBe(0);
    expect(beamSince(5_000, 13, clock)).toBe(3);
    expect(beamSince(5_000, 10 + BEAM.s, clock)).toBeNull();
    expect(beamSince(null, 30, clock)).toBeNull();
    expect(beamSince(5_000, 31, clock)).toBeNull();
    expect(beamSince(9_000, 40, clock)).toBe(0);
  });

  it("rises over 0.6 s, holds, fades over the last 1.5 s; steady under reduced motion; no higher than the wall's top at the stop", () => {
    const b: BeaconInstance = { y: 0, r: 0, h: 0, alpha: 0 };
    beamInstance(0.3, false, false, b);
    expect(b.h).toBeCloseTo(BEAM.h / 2);
    beamInstance(3, false, false, b);
    expect(b).toMatchObject({ h: BEAM.h, r: BEAM.r });
    beamInstance(BEAM.s - 0.75, false, false, b);
    expect(b.alpha).toBeCloseTo(0.95 / 2);
    beamInstance(0.1, true, false, b);
    const steady = { ...b };
    beamInstance(BEAM.s - 0.1, true, false, b);
    expect(b).toEqual(steady);
    beamInstance(3, false, true, b);
    expect(b.h).toBe(BEAM.stopH);
    beamInstance(null, false, false, b);
    expect(b).toEqual({ y: 0, r: 0, h: 0, alpha: 0 });
  });
});
```

    The existing "leaves the reserved slot as it is" test stays (`beaconInstances` never writes instance 4).
  - `office-watch-loader`: the watch chunk loads the beacon chunk once on a fresh deploy with nobody asking (the test
    that says "never on a quiet feed" now feeds a quiet signal with `deployAt: null`, and a new case sets `deployAt`).
  - `office-beacon-view`: the beam (40 u over `officeDockPad`) projects on screen from the primed spawn on the landscape
    desktop sizes where the beacon column does (at least 30% of it in frame), using `tests/helpers/office-cameras.ts`.
- [ ] **Step 2:** `bunx vitest run tests/unit/office-beacon.test.ts tests/unit/office-watch-loader.test.ts tests/unit/office-beacon-view.test.ts`; expect FAIL.
- [ ] **Step 3: Implement** in `beacon.ts`:

```ts
/**
 * The production deploy beam (design 6.3), the beacon mesh's instance `slot`: a green column `h` u tall and `r` u wide
 * over the ship dock for `s` seconds from the moment a client first sees a fresh deploy success, rising over `rise` s
 * and fading over the last `fade` s. At the office stop it stops at `stopH` (the wall's top), so it never crosses the
 * chip row or the HUD there.
 */
export const BEAM = { slot: 4, h: 40, r: 1.1, s: 8, rise: 0.6, fade: 1.5, stopH: OFFICE.wall.bottom + OFFICE.wall.h + OFFICE.wall.frame } as const;

/** Which deploy the beam showed last and when it started (scene seconds); kept across a cleared signal, so a deploy fires once. */
export interface BeamClock {
  deployAt: number | null;
  t0: number;
}

/** Seconds into the beam at scene time `t`, or null when none shows: a `deployAt` the clock has not seen starts one now. */
export function beamSince(deployAt: number | null, t: number, clock: BeamClock): number | null {
  if (deployAt !== null && deployAt !== clock.deployAt) {
    clock.deployAt = deployAt;
    clock.t0 = t;
  }
  if (clock.deployAt === null || t - clock.t0 >= BEAM.s) return null;
  return t - clock.t0;
}

/** Instance `BEAM.slot` at `since` seconds into the beam (zero size without one). Reduced motion: full height and steady for the 8 s. */
export function beamInstance(since: number | null, reduced: boolean, atStop: boolean, out: BeaconInstance): void {
  if (since === null) {
    Object.assign(out, { y: 0, r: 0, h: 0, alpha: 0 });
    return;
  }
  const rise = reduced ? 1 : Math.min(1, since / BEAM.rise);
  const fade = reduced || since <= BEAM.s - BEAM.fade ? 1 : (BEAM.s - since) / BEAM.fade;
  Object.assign(out, { y: 0, r: BEAM.r, h: (atStop ? BEAM.stopH : BEAM.h) * rise, alpha: (reduced ? 0.6 : 0.95) * fade });
}
```

  `OfficeBeacon.tsx`: the instance colours are pink for 0 to 3 and `COLORS.green` for `BEAM.slot`; a `BeamClock` ref
  and the dock origin (`officeDockPad(LOBBY.officeWing)`, a module constant); the frame advances its scene clock every
  frame (not only while drawn, so the beam's 8 s run in real time), then:

```tsx
    const now = (t.current += Math.min(dt, 0.1));
    const asking = officeSignal.needsKurniadi;
    const since = beamSince(officeSignal.deployAt, now, beam.current);
    sceneProbes.office.beacon = asking;
    sceneProbes.office.beam = since !== null;
    m.visible = asking || since !== null;
    if (!m.visible) return;
    const stop = atOfficeStop();
    const reduced = getHQStore().getState().reducedMotion;
    const gain = beaconGain(stop);
    beaconInstances(now, reduced, INST, gain.reach);
    if (!asking) for (let i = 0; i <= BEACON.bands; i++) Object.assign(INST[i], { r: 0, h: 0, alpha: 0 });
    beamInstance(since, reduced, stop, INST[BEAM.slot]);
```

  then writes instances 0 to 3 at `beaconOrigin` (as now) and instance 4 at the dock origin with its own alpha (no
  stop gain: `beamInstance` already caps its height there). The doc comment says it draws while a Rover asks or a beam
  runs (1 call either way). `watchChunk.ts` `sync()`:

```ts
function sync(): void {
  const on = officeSignal.needsKurniadi;
  setOfficeAsks(on);
  if ((on || officeSignal.deployAt !== null) && !beaconAsked) {
    beaconAsked = true;
    loadOfficeBeacon().catch(() => {
      beaconAsked = false;
    });
  }
}
```

  (The minimap cue and `officeAsks` stay ask-only: a deploy is not a request for Kurniadi.)
- [ ] **Step 4:** Run the three files plus `office-chunk-graph` (the beam code stays in `BEACON_ONLY`'s `beacon.ts` and
  `OfficeBeacon.tsx`; the watch chunk gains no import); expected PASS.
- [ ] **Step 5:** Commit `feat(office): the production deploy beam over the dock`.

### Task 8: The CI room, its tower target and the drawer

**Files:**
- Modify: `src/experience/floors/lobby/officeLayout.ts` (`OFFICE_CI_ROOM`, `OFFICE_ROOMS`), `src/content/room-views/lobby.ts`
  (`buildOfficeViews`), `src/content/room-views/types.ts` (`RoomView.office.panel`), `src/experience/floors/lobby/office/interact.ts`,
  `src/experience/floors/lobby/office/OfficeScene.tsx` (the target label), `src/experience/floors/lobby/office/OfficeBody.tsx`,
  `messages/en.json`, `messages/id.json`
- Test: `tests/unit/office-rooms.test.ts`, `tests/unit/office-interact.test.ts`, `tests/hud/OfficeBody.test.tsx`, `tests/unit/client-namespaces.test.ts` (unchanged lists, still green)

**Interfaces:**
- Consumes: `isOfficeRoom` (already true for any `L1:office-*` room), `officeStops` (maps every `OFFICE_ROOMS` entry to
  the office stop), `officeTowerTall`, `officeTowerColumn`, `officeTowerYaw`, `OFFICE.tower`; `OfficeTargetLabels`;
  `OfficeBody`'s `officeView(feed)`, `GithubRow`, `Dot`, `Field`, `ROW`, `NOTE`, `useNow`, `PanelNotes`; `safeGithubUrl`,
  `sinceLabel`, `STATUS_COLOR`; `OfficeView.pipeline` (Task 4).
- Produces: `OFFICE_CI_ROOM = "L1:office-ci"` (after `OFFICE_GITHUB_ROOM` in `OFFICE_ROOMS` and in the room chain); the
  point-and-go target `L1:station:office-ci` on the tower column (driving to the office stop like every office target,
  URL stays `/{locale}`); `RoomView.office.panel` gains `"ci"`; `OfficeTargetLabels.ci`; the `CiPanel` drawer body (the
  tower's text alternative, design 11). Strings (both locales, short: the `office` namespace rides in `ClientMessages` pages):
  `office.3d.ciTitle` ("Ship-It Pipeline" / "Jalur Rilis"), `office.3d.ciNote` ("The CI tower: one light lane per job of
  the latest runs on public repositories, a package on the dock per merged pull request, a beam per production deploy." /
  "Menara CI: satu jalur lampu per job dari run terbaru di repositori publik, satu paket di dermaga per pull request yang
  digabung, satu sinar per deploy produksi."), `office.3d.target.ci` ("Agent Office: CI tower" / "Kantor Agen: menara
  CI"), `office.3d.ci.runs` ("Latest runs" / "Run terbaru"), `office.3d.ci.ships` ("Merged and deployed" / "Digabung dan
  dirilis"), `office.3d.ci.none` ("No recent runs" / "Belum ada run terbaru"), `office.3d.ci.desk` ("From desk {n}" /
  "Dari meja {n}"), `office.3d.ci.job.queued|running|done|failed` ("queued", "running", "done", "failed" / "antre",
  "berjalan", "selesai", "gagal").

- [ ] **Step 1: Tests first.**
  - `office-rooms`: `L1:office-ci` is an office room (`isOfficeRoom`, no route beyond the home anchor), has a drawer
    view in both locales chained among the office rooms (after the GitHub board) and ships in the L1 room data file only.
  - `office-interact`: the targets are the two wall halves, the CI tower and one per Rover (both rows); the CI target
    opens `OFFICE_CI_ROOM` from the office stop, its pick box is the turned column (`box: { center: officeTowerColumn(w), w: OFFICE.tower.column, d: OFFICE.tower.column, yaw: officeTowerYaw(w) }`)
    from the plinth to the column's top (`officeTowerTall(w).h`).
  - `OfficeBody` (jsdom, both locales): the `ci` panel lists each run of `OFFICE_FIXTURES_V4.busy` (title linked through
    `safeGithubUrl`, its status, "From desk 6" for the back-row run) with its lanes as a list of "job name: status"
    (12 for run 1001, the failed one marked), and the merged PR and the deploy from `office.github` as `GithubRow`s; a
    v4 feed with an empty pipeline (a rollback) shows the running run's anonymous progress line (`3d.jobs`) instead;
    no runs and no ships show `3d.ci.none`; a `javascript:` run URL renders as text, never a link.
- [ ] **Step 2:** Run the three files; expect FAIL.
- [ ] **Step 3: Implement.**
  - `officeLayout.ts`: `export const OFFICE_CI_ROOM = "L1:office-ci" as RoomId;` and
    `OFFICE_ROOMS = [OFFICE_ROOM, OFFICE_GITHUB_ROOM, OFFICE_CI_ROOM, ...desk rooms]`.
  - `room-views/lobby.ts`: after the GitHub view,
    `single({ id: roomId("L1", "office-ci"), kind: "office", title: o.ciTitle, subtitle: o.subtitle, accent: "violet", sections: [{ body: o.ciNote }], office: { panel: "ci" } })`;
    `types.ts`: `office?: { panel: "summary" | "github" | "ci" | "desk"; slot?: number }`.
  - `interact.ts`: `OfficeTargetLabels.ci`, and after the GitHub half:

```ts
    {
      id: "L1:station:office-ci",
      floor: "L1",
      kind: "station",
      label: labels.ci,
      at,
      bounds: { minX: tall.minX, maxX: tall.maxX, minZ: tall.minZ, maxZ: tall.maxZ },
      box: { center: officeTowerColumn(w), w: OFFICE.tower.column, d: OFFICE.tower.column, yaw: officeTowerYaw(w) },
      base: OFFICE.tower.plinth,
      height: tall.h,
      action: { type: "open-room", room: OFFICE_CI_ROOM },
    },
```

    with `const tall = officeTowerTall(w);`. `OfficeScene` passes `ci: t("3d.target.ci")`.
  - `OfficeBody.tsx`: `panel.panel === "ci"` renders `CiPanel`; `PanelNotes` shows `3d.githubNote` for the `github` and
    `ci` panels.

```tsx
const JOB_COLOR = { queued: "#8a93b5", running: STATUS_COLOR.running, done: STATUS_COLOR.success, failed: STATUS_COLOR.failure } as const;

/** The CI tower's text alternative: the latest runs with their lanes, then the latest merges and deploys. */
function CiPanel({ office, locale, now }: { office: OfficeView; locale: Locale; now: number }) {
  const t = useTranslations("office");
  const runs = office.pipeline?.runs ?? [];
  const ships = office.github.filter((g) => (g.kind === "pr" && g.status === "merged") || g.kind === "deploy");
  const anonymous = runs.length === 0 ? office.github.find((g) => g.kind === "run" && g.status === "running") : undefined;
  if (runs.length === 0 && ships.length === 0 && !anonymous) return <p className={NOTE}>{t("3d.ci.none")}</p>;
  return (
    <div className="grid gap-6" data-testid="office-ci">
      {anonymous && <GithubRow item={anonymous} locale={locale} now={now} />}
      {runs.length > 0 && (
        <Field label={t("3d.ci.runs")}>
          <ul className="space-y-2">
            {runs.map((r) => {
              const url = safeGithubUrl(r.url);
              return (
                <li key={r.id} className={ROW} data-testid="office-ci-run" data-status={r.status}>
                  <p className="flex items-center gap-2 text-ink">
                    <Dot color={STATUS_COLOR[r.status]} />
                    {url ? <External href={url}>{r.title}</External> : r.title}
                  </p>
                  <p className="text-xs text-ink-3">{[r.repo, t(`3d.github.status.${r.status}`), r.slot !== undefined && t("3d.ci.desk", { n: r.slot + 1 }), sinceLabel(r.at, locale, now)].filter(Boolean).join(" · ")}</p>
                  <ol className="mt-2 grid gap-1 text-[13px] leading-5 text-ink-2">
                    {r.jobs.map((j, k) => (
                      <li key={k} className="flex items-center gap-2" data-status={j.status}>
                        <Dot color={JOB_COLOR[j.status]} />
                        {`${j.name}: ${t(`3d.ci.job.${j.status}`)}`}
                      </li>
                    ))}
                  </ol>
                </li>
              );
            })}
          </ul>
        </Field>
      )}
      {ships.length > 0 && (
        <Field label={t("3d.ci.ships")}>
          <ul className="space-y-2">
            {ships.map((item, i) => (
              <GithubRow key={`${item.url}-${i}`} item={item} locale={locale} now={now} />
            ))}
          </ul>
        </Field>
      )}
    </div>
  );
}
```

    (Existing classes only: no new Tailwind utilities, the CSS budget rides on every page; check `bun run build` keeps
    the Classic CSS at or under 20,480 B. `Field`'s props are used as they are today.)
- [ ] **Step 4:** Run the three files, `tests/unit/client-namespaces.test.ts` and `bunx vitest run tests/hud/`; expected
  PASS. `bun run build` and check the HTML of `/en` and `/id` against the Lighthouse HTML budget (82 KB).
- [ ] **Step 5:** Commit `feat(office): the ship-it pipeline drawer and the CI tower target`.

### Task 9: E2E, perf and budgets, captures, security review, docs, PR

**Files:**
- Modify: `e2e/office-fixtures.ts`, `e2e/office.spec.ts`, `e2e/perf/floors.spec.ts`, `e2e/budgets.ts`, `scripts/office-shots.ts`,
  `docs/agents/office.md`, `docs/agents/floor-l1-lobby.md`, `docs/agents/performance.md`, `docs/features.md`,
  `workers/office/README.md`, `docs/superpowers/specs/2026-10-20-agent-office-revamp-design.md` (6.2, 6.3, 6.5, 8),
  `AGENTS.md` (the budget rows, only if the session caps move), this plan's `Status:`
- Create: `docs/decisions/2026-10-21-office-pipeline-budgets.md`

- [ ] **Step 1: E2E** (`e2e/office.spec.ts`, with `serveOffice` and `pollNow` from Task 4; fixtures from
  `OFFICE_FIXTURES_V4` and a builder in `e2e/office-fixtures.ts` that returns a v4 body for `Date.now()`, like `crewA`):
  - the tower shows one lane per job: `__hq.probes.office.lanes` is 24 for the busy pipeline, and part A's anonymous
    lanes for a v3 body served on `?v=4` (a rollback);
  - a snapshot where a running job finished raises `__hq.probes.office.pipe.bursts`; a new run on back-row desk 6
    raises `pipe.packets`; a new merge raises `pipe.packages` and, after the flight, `pipe.stack` follows `today.prsMerged`;
  - a deploy success under 30 s old in the feed loads the beacon chunk and sets `__hq.probes.office.beam` for about 8 s from the spawn, with no Rover asking and the office
    out of view (the watch path), and again in view (the scene path); a stale deploy never fires it;
  - reduced motion: no `pipe.packets` or `pipe.bursts` growth on the same snapshots, the stack and lanes still update;
  - clicking the CI tower drives to the office stop and opens `L1:office-ci`, which lists the jobs (`office-ci-run` rows);
  - the existing ten-desk, crew, chip, beacon and offline tests stay green with the scene on `?v=4`.
  Wait on state (probes, responses), never on time (AGENTS.md E2E rule); use the `e2e/hq.ts` helpers.
- [ ] **Step 2: Perf lane** (`E2E_PORT=4512 bun run e2e:perf`): L1 settled scene calls at the office stop, at the spawn
  turned toward the wing (`settled-L1-spawn-wing`) and at the lane ring's south point (`settled-L1-ring-south`) with a
  beam running and a burst playing, both tiers, under 125 (the spawn +1 only while the beam or the beacon draws);
  programs at `e2e/perf/baseline.json`; the memory gates flat across live switches; lite fps healthy at the stop with
  the effects playing. Bytes (`e2e/perf/bytes-3d.spec.ts`): re-set `office`, `officeBody`, `officeBeacon`,
  `session.lite` and `session.full` (and `failAt` only if the main path passed it) by the rule in "Budget for B", the
  measured bytes in each cap's comment; `officeTotal` 40 KB holds. Write the decision file with the before and after
  numbers and the owner note, and put the same note in the PR.
- [ ] **Step 3: Captures and video:** `scripts/office-shots.ts` gains shots `pipeline` (the busy v4 pipeline: lanes lit,
  a burst, a packet from the back row) and `ship` (a package landing on the stack and the deploy beam, from the stop
  and from the spawn), and its video feeds a scripted run (lanes filling, a failure burst, a merge package, a deploy
  beam) at 1440x900, 820x1180 and 390x844, full and lite; send them to the coordinator before merge.
- [ ] **Step 4: Security review:** run the `security-review` agent on the branch diff (focus: v4 parsing and its
  fallback, job names and ship keys, the `v` query and the edge cache keys, `privatized` handling, the CI drawer's links
  and text); fix findings; summarise them in the PR.
- [ ] **Step 5: Docs** (current state only, no history):
  - `docs/agents/office.md`: the contract section (v4: `OfficeSnapshotV4`, `OFFICE_PIPELINE`, `parseOfficeResponseV4`
    and its fallback), who polls what (the scene `?v=4`, the card and the watch `?v=3`), the Worker (`RunRecord.order`,
    `names`, `started`, `pipelineOf`, `viewV4`, lanes folding past 24, seats through `seatOf`), the Function's
    `VERSIONS` and cache keys, the tests list.
  - `docs/agents/floor-l1-lobby.md`: the tower's per-job lanes and their colours, the pipeline effects and their
    instance blocks (glow 643, parts 113), the far LOD and in-view rules for them, the ceiling under the chip row, the
    beam on the beacon mesh's instance 4 and the beacon chunk's two triggers, the CI room and target, the probes
    (`lanes`, `pipe`, `beam`), the measured calls.
  - `docs/agents/performance.md` and `AGENTS.md` budget rows (if moved), `docs/features.md` (L1 Agent Office bullets
    and the status log), `workers/office/README.md` (the `?v=4` route).
  - The design: 6.2 (the v4 parser's fallback replaces `parseOfficeAny`; the scene reads one type), 6.3 (the beam in the
    beacon chunk, fired from the signal's `deployAt`; packages as plain parts boxes with violet glow; the arc ceiling),
    6.5 and section 8 (the measured bytes).
  - This plan's `Status:` line to `in review`.
- [ ] **Step 6:** `bun run verify:quick && bun run e2e:changed` (plus the perf lane from Step 2), check the CI runs in
  flight (`gh run list -R ShinyQ/ShinyQ-HQ -s in_progress` and `-s queued`), push and open a ready-for-review PR
  `feat(office): the ship-it pipeline (revamp part B)` with the budget note, the captures and the security summary.

## Self-review notes

- Design coverage: 6.1 (placement) shipped in part A (`officeTower`, `officeDock`, `officeTowerColumn`, `officeDockPad`,
  the 1.2 u column); 6.2 is Tasks 1 to 4; 6.3 is Tasks 6 to 8; 6.4 is Task 5; 6.5, 8, 9 and 13 are Task 9 and the
  Global Constraints.
- Contract chain: v1 five desks; v2 = v1 plus desk `helpers` (part A); v3 = v2 with ten seats, slots 0 to 9 (A2); v4 =
  v3 plus `pipeline` (this plan), served only for exactly `?v=4`, read by the scene's poller only; each parser reads
  the older bodies as its own version (v4 with an empty pipeline).
- Seats: `pipelineOf` links runs and merges through `seatOf` (front `slot` or back-row `seat`), so a back-row desk's
  run launches its packet from the riser; the protocol checks `slot` 0 to 9.
- Always-live: the diff runs on every feed (cheap, React effect); everything that draws runs in `OfficeRovers`' frame
  behind `officeRuntime.inView` and `lodStep`; the beam lives in the beacon chunk and follows the signal, so it shows
  from the Lobby and while the scene is out of view.
- Types shared across tasks: `OFFICE_PIPELINE`, `OfficeJobStatus`, `OfficePipelineJob`, `OfficePipelineRun`,
  `OfficeShip`, `OfficePipeline`, `OfficeSnapshotV4`, `OfficeResponseV4`, `parseOfficeResponseV4`, `OFFICE_FIXTURES_V4`,
  `pipelineOf`, `viewV4`, `OFFICE_V4_PATH`, `OfficeView.pipeline`, `PIPE`, `PipeEvent`, `Lane`, `lanesOf`,
  `diffPipeline`, `deployRunning`, `PipeQueue`, `LaneStatus`, `TowerLanes`, `DARK_TOWER`, `PIPE_GLOW`, `PIPE_PARTS`,
  `PACKAGE_START`, `FX_CEILING`, `PIPE_FX`, `arcPoint`, `arcLift`, `restPipeline`, `PipelineFx`, `BEAM`, `BeamClock`,
  `beamSince`, `beamInstance`, `OFFICE_CI_ROOM`.
