# Agent Office revamp B: ship-it pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Status: planned (2026-10-20); starts after part A merges.

**Goal:** Pushes, CI jobs, merges and production deploys of public repositories become physical events in the office
wing: a CI tower with one light lane per workflow job, packets from the pushing agent's desk, green or red bursts, a
package flying to the ship dock per merged PR, and a beam over the dock per production deploy.

**Architecture:** The Worker keeps job names and derives a `pipeline` block; a v2 snapshot (`GET /api/office?v=2`)
carries it to the 3D scene while v1 stays byte for byte for the Classic card. A pure `pipeline.ts` derives events from
successive snapshots; `pipelineFx.ts` writes them into the existing glow and parts meshes and the main-path beacon
mesh's spare instance (the beam). One contract change, every side in this PR.

**Tech Stack:** Cloudflare Workers and Durable Objects, Pages Functions, Next.js 16 static export, react-three-fiber, three.js, Vitest, Playwright, Bun.

Design: [`2026-10-20-agent-office-revamp-design.md`](../specs/2026-10-20-agent-office-revamp-design.md) sections 6, 8 to 11.

## Global Constraints

- No em dashes (U+2014) anywhere. Bun only; `rtk` for git; conventional commits.
- Contract: change it only with a new version and every side in one PR; v1 responses unchanged byte for byte.
- Privacy D3: public allowlisted repositories only; job names, titles and branches pass `cleanTitle` / the blocklist;
  forks and untrusted actors ignored; `privatized` strips runs and ships. No new beat field.
- No new shader program on L1; L1 under 125 scene draw calls on both tiers; office caps re-set by measured plus 0.6 KB,
  `officeTotal` 40 KB.
- Reduced motion: no packets, flights or bursts; end states shown at once.
- Security review (the `security-review` agent) of the v2 surface before merge.

## File structure

| File | Responsibility |
|---|---|
| `workers/office/src/state.ts` | `RunRecord.names`, job caps, `pipelineOf(doc, now)`, `viewV2` |
| `workers/office/src/office.ts`, `worker.ts` | `/snapshot?v=2` |
| `src/lib/office/protocol.ts` | v2 types, `parseOfficeResponseV2`, `parseOfficeAny` |
| `src/lib/office/fixtures.ts`, `e2e/office-fixtures.ts` | v2 fixtures with runs, jobs and ships |
| `functions/_lib/office.ts` | `?v=2` honoured, per-version cache key |
| `src/lib/office/poll.ts` | `path` and `parse` options |
| `src/experience/floors/lobby/office/live.ts` | the scene polls v2 |
| `src/experience/floors/lobby/office/pipeline.ts` (new) | lanes, `diffPipeline`, event queue (pure) |
| `src/experience/floors/lobby/office/pipelineFx.ts` (new) | lane matrix, packets, bursts, crown, package and trail writes |
| `src/experience/floors/lobby/office/beacon.ts`, `OfficeBeacon.tsx`, `officeSignal.ts` | the deploy beam on instance 4 |
| `src/experience/floors/lobby/officeLayout.ts`, `office/interact.ts`, `OfficeBody.tsx` | the `L1:office-ci` room, target and drawer |
| tests | `tests/office/state.test.ts`, `protocol.test.ts`, `office-endpoint.test.ts`, `worker.test.ts`, `tests/unit/office-poll.test.ts`, `office-pipeline.test.ts`, `office-pipeline-fx.test.ts`, `office-beacon.test.ts`, `office-rooms.test.ts`, `tests/hud/OfficeBody.test.tsx`, `e2e/office.spec.ts` |

---

### Task 1: Worker keeps job names and builds the pipeline

**Files:**
- Modify: `workers/office/src/state.ts`
- Test: `tests/office/state.test.ts`

**Interfaces:**
- Produces: `TIMING.jobsKept = 24`, `TIMING.pipelineRuns = 3`, `TIMING.ships = 10`; `RunRecord.names?: Record<string, string>`,
  `RunRecord.order?: string[]` (first-seen job ids), `RunRecord.started: number`; `pipelineOf(doc, now): OfficePipeline`
  (types from Task 2).

- [ ] **Step 1: Tests first** (append to `tests/office/state.test.ts`, reusing its `doc`, `run` and `job` builders):

```ts
describe("pipeline", () => {
  it("keeps job names in first-seen order, capped at 24 lanes", () => {
    let d = applyGithub(emptyDoc(0), { repo: "ShinyQ/ShinyQ-HQ", changes: [{ type: "run", id: 1, attempt: 1, branch: "feat/x", title: "CI · feat/x", url: "https://github.com/ShinyQ/ShinyQ-HQ/actions/runs/1", status: "running" }] }, "d1", 1_000);
    for (let i = 0; i < 30; i++) d = applyGithub(d, { repo: "ShinyQ/ShinyQ-HQ", changes: [{ type: "job", runId: 1, attempt: 1, jobId: String(i), name: `E2E (${i + 1}/30)`, status: "running" }] }, `j${i}`, 2_000 + i);
    const p = pipelineOf(d, 5_000);
    expect(p.runs[0].jobs).toHaveLength(24);
    expect(p.runs[0].jobs[0]).toEqual({ name: "E2E (1/30)", status: "running" });
  });
  it("links a run to the desk on the same public repo and branch", () => {
    const d0 = withSession(emptyDoc(0), { slot: 3, repo: "ShinyQ/ShinyQ-HQ", branch: "feat/x" });
    const d = applyGithub(d0, { repo: "ShinyQ/ShinyQ-HQ", changes: [{ type: "run", id: 2, attempt: 1, branch: "feat/x", title: "CI · feat/x", url: "https://github.com/ShinyQ/ShinyQ-HQ/actions/runs/2", status: "running" }] }, "d2", 1_000);
    expect(pipelineOf(d, 1_500).runs[0].slot).toBe(3);
  });
  it("lists merges and deploys as ships, newest first, and forgets a privatized repository", () => {
    let d = applyGithub(emptyDoc(0), { repo: "ShinyQ/ShinyQ-HQ", changes: [{ type: "pr", number: 7, branch: "feat/x", title: "Thing", url: "https://github.com/ShinyQ/ShinyQ-HQ/pull/7", action: "merged" }] }, "p7", 1_000);
    d = applyGithub(d, { repo: "ShinyQ/ShinyQ-HQ", changes: [{ type: "deploy", id: 9, title: "Deploy · production", url: "https://github.com/ShinyQ/ShinyQ-HQ", status: "success" }] }, "x9", 2_000);
    expect(pipelineOf(d, 3_000).ships.map((s) => [s.kind, s.status])).toEqual([["deploy", "success"], ["merge", "merged"]]);
    d = applyGithub(d, { repo: "ShinyQ/ShinyQ-HQ", changes: [{ type: "privatized" }] }, "pv", 4_000);
    expect(pipelineOf(d, 5_000)).toEqual({ runs: [], ships: [] });
  });
});
```

(`withSession` is a small helper in the test file that inserts a `SessionRecord` with the given slot, repo and branch,
the repo also added to `publicRepos`.)
- [ ] **Step 2:** `bun run test tests/office/state.test.ts`; expect FAIL.
- [ ] **Step 3: Implement.** In `applyChange` `case "job"`, record the name and order and cap the lanes:

```ts
    case "job": {
      const run = doc.runs.find((r) => r.id === c.runId && r.repo === repo);
      if (!run || c.attempt < run.attempt) return doc;
      const order = run.order ?? Object.keys(run.jobs);
      const known = order.includes(c.jobId);
      // Past 24 lanes a new job folds into the last lane (its status wins while it runs or fails).
      const jobId = known || order.length < TIMING.jobsKept ? c.jobId : order[order.length - 1];
      const updated: RunRecord = {
        ...run,
        jobs: { ...run.jobs, [jobId]: c.status },
        names: { ...(run.names ?? {}), ...(known || order.length < TIMING.jobsKept ? { [jobId]: c.name.slice(0, 40) } : {}) },
        order: known || order.length >= TIMING.jobsKept ? order : [...order, jobId],
        ...(c.status === "failed" ? { failedJob: c.name } : {}),
        updated: now,
      };
      const progress = progressOf(updated);
      const feed = doc.feed.map((f) => (f.key === `run:${run.id}` && f.status === "running" && progress ? { ...f, progress } : f));
      return { ...doc, runs: doc.runs.map((r) => (r.id === run.id ? updated : r)), feed };
    }
```

In `case "run"`, a restart clears `names` and `order` with `jobs`, and a new run records `started: now`
(`started: prev && !restart ? (prev.started ?? prev.updated) : now`). Then add:

```ts
const slotOf = (doc: OfficeDoc, repo: string, branch: string, now: number): number | undefined =>
  doc.sessions.find((s) => s.slot !== null && s.repo === repo && s.branch === branch && effective(s, now) !== null)?.slot ?? undefined;

/** The v2 pipeline block (design 6.2): the newest runs with their lanes, and the latest merges and deploys. */
export function pipelineOf(doc: OfficeDoc, now: number): OfficePipeline {
  const runs = [...doc.runs]
    .sort((a, b) => (b.started ?? b.updated) - (a.started ?? a.updated))
    .slice(0, TIMING.pipelineRuns)
    .map((r): OfficePipelineRun => {
      const order = r.order ?? Object.keys(r.jobs);
      const slot = slotOf(doc, r.repo, r.branch, now);
      return {
        id: r.id,
        repo: r.repo,
        title: r.title.slice(0, OFFICE_FEED_TITLE_MAX),
        url: r.url,
        status: r.status,
        at: r.started ?? r.updated,
        jobs: order.map((id) => ({ name: r.names?.[id] ?? "Job", status: r.jobs[id] })),
        ...(slot !== undefined ? { slot } : {}),
      };
    });
  const ships = doc.feed
    .filter((f) => (f.kind === "pr" && f.status === "merged") || f.kind === "deploy")
    .slice(0, TIMING.ships)
    .map((f): OfficeShip => {
      const pr = f.kind === "pr" ? doc.prs.find((p) => `pr:${p.repo}#${p.number}` === f.key) : undefined;
      const slot = pr ? slotOf(doc, pr.repo, pr.branch, now) : undefined;
      return { key: f.key, kind: f.kind === "pr" ? "merge" : "deploy", status: f.status as OfficeShip["status"], at: f.at, ...(slot !== undefined ? { slot } : {}) };
    });
  return { runs, ships };
}

/** The v2 snapshot: the v1 view plus the pipeline. */
export function viewV2(doc: OfficeDoc, now: number): OfficeSnapshotV2 {
  return { ...view(doc, now), v: 2, pipeline: pipelineOf(doc, now) };
}
```

- [ ] **Step 4:** Run; expected PASS (old documents without `names`, `order` or `started` read through the fallbacks).
- [ ] **Step 5:** Commit `feat(office): the Worker keeps job lanes and builds the pipeline`.

### Task 2: Contract v2

**Files:**
- Modify: `src/lib/office/protocol.ts`, `src/lib/office/fixtures.ts`
- Test: `tests/office/protocol.test.ts`

**Interfaces:**
- Produces: `OfficePipelineJob`, `OfficePipelineRun`, `OfficeShip`, `OfficePipeline`, `OfficeSnapshotV2`, `OFFICE_PIPELINE = { runs: 3, jobs: 24, ships: 10, jobName: 40 }`,
  `parseOfficeResponseV2(raw): OfficeSnapshotV2 | OfficeDisabledV1 | null`, `parseOfficeAny(raw): (OfficeSnapshotV1 & { pipeline?: OfficePipeline }) | OfficeDisabledV1 | null`,
  `OFFICE_FIXTURES_V2` (busy with two runs, 12 jobs, a merge and a deploy).

- [ ] **Step 1: Tests first:**

```ts
describe("v2", () => {
  it("accepts the fixtures and rejects extra keys, long lists, bad jobs and markup", () => {
    expect(parseOfficeResponseV2(OFFICE_FIXTURES_V2.busy)).not.toBeNull();
    const bad = [
      { ...OFFICE_FIXTURES_V2.busy, pipeline: { runs: [], ships: [], x: 1 } },
      { ...OFFICE_FIXTURES_V2.busy, pipeline: { runs: Array(4).fill(OFFICE_FIXTURES_V2.busy.pipeline.runs[0]), ships: [] } },
      { ...OFFICE_FIXTURES_V2.busy, pipeline: { runs: [{ ...OFFICE_FIXTURES_V2.busy.pipeline.runs[0], jobs: [{ name: "<b>", status: "done" }] }], ships: [] } },
      { ...OFFICE_FIXTURES_V2.busy, pipeline: { runs: [{ ...OFFICE_FIXTURES_V2.busy.pipeline.runs[0], slot: 7 }], ships: [] } },
      { ...OFFICE_FIXTURES_V2.busy, pipeline: { runs: [], ships: [{ key: "k", kind: "merge", status: "pushed", at: 1 }] } },
    ];
    for (const b of bad) expect(parseOfficeResponseV2(b)).toBeNull();
  });
  it("falls back to v1 with no pipeline", () => {
    expect(parseOfficeAny(OFFICE_FIXTURES.busy)).toMatchObject({ v: 1 });
    expect(parseOfficeAny(OFFICE_FIXTURES.busy)?.["pipeline" as never]).toBeUndefined();
    expect(parseOfficeAny(OFFICE_FIXTURES_V2.busy)).toHaveProperty("pipeline");
  });
  it("keeps v1 strict: a v1 parser rejects a v2 body", () => {
    expect(parseOfficeResponse(OFFICE_FIXTURES_V2.busy)).toBeNull();
  });
});
```

- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3: Implement** (types as in the design 6.2, plus):

```ts
export const OFFICE_PIPELINE = { runs: 3, jobs: 24, ships: 10, jobName: 40 } as const;
const JOB_STATUSES = ["queued", "running", "done", "failed"] as const;
const RUN_STATUSES = ["running", "success", "failure"] as const;
const SHIP_STATUSES = ["running", "success", "failure", "merged"] as const;
const isSlot = (x: unknown) => isInt(x, 0, OFFICE_DESKS - 1);

function isJob(x: unknown): boolean {
  return isObj(x) && onlyKeys(x, ["name", "status"]) && typeof x.name === "string" && x.name.length >= 1 && x.name.length <= OFFICE_PIPELINE.jobName && !UNSAFE_TEXT.test(x.name) && oneOf(JOB_STATUSES, x.status);
}

function isRun(x: unknown): boolean {
  return (
    isObj(x) &&
    onlyKeys(x, ["id", "repo", "title", "url", "status", "slot", "at", "jobs"]) &&
    isInt(x.id) && matches(REPO)(x.repo) && isText(x.title) && matches(URL_RE)(x.url) && oneOf(RUN_STATUSES, x.status) &&
    optional(x, "slot", isSlot) && isInt(x.at) &&
    Array.isArray(x.jobs) && x.jobs.length <= OFFICE_PIPELINE.jobs && x.jobs.every(isJob)
  );
}

function isShip(x: unknown): boolean {
  return isObj(x) && onlyKeys(x, ["key", "kind", "status", "at", "slot"]) && typeof x.key === "string" && x.key.length <= 160 && !UNSAFE_TEXT.test(x.key) && oneOf(["merge", "deploy"] as const, x.kind) && oneOf(SHIP_STATUSES, x.status) && isInt(x.at) && optional(x, "slot", isSlot);
}

function isPipeline(x: unknown): x is OfficePipeline {
  return isObj(x) && onlyKeys(x, ["runs", "ships"]) && Array.isArray(x.runs) && x.runs.length <= OFFICE_PIPELINE.runs && x.runs.every(isRun) && Array.isArray(x.ships) && x.ships.length <= OFFICE_PIPELINE.ships && x.ships.every(isShip);
}

/** Validates GET /api/office?v=2: the v1 checks on everything but `v`, plus the pipeline. */
export function parseOfficeResponseV2(raw: unknown): OfficeSnapshotV2 | OfficeDisabledV1 | null {
  if (!isObj(raw)) return null;
  if (raw.v === 1 && raw.enabled === false) return parseOfficeResponse(raw) as OfficeDisabledV1 | null;
  if (raw.v !== 2 || !isPipeline(raw.pipeline)) return null;
  const { pipeline, ...rest } = raw;
  const v1 = parseOfficeResponse({ ...rest, v: 1 });
  return v1 && v1.enabled ? ({ ...v1, v: 2, pipeline } as OfficeSnapshotV2) : null;
}

/** The scene's parser: v2 when the Worker serves it, else v1 without a pipeline (an older Worker). */
export function parseOfficeAny(raw: unknown): (OfficeSnapshotV1 & { pipeline?: OfficePipeline }) | OfficeDisabledV1 | null {
  const v2 = parseOfficeResponseV2(raw);
  if (v2) return v2.enabled ? ({ ...v2, v: 1 } as OfficeSnapshotV1 & { pipeline: OfficePipeline }) : v2;
  return parseOfficeResponse(raw);
}
```

(Note `parseOfficeAny` normalises to `v: 1` with an extra `pipeline`, so `officeView` and every v1 consumer keep their
types.) Add `OFFICE_FIXTURES_V2` built from `OFFICE_FIXTURES` with `v: 2` and a `pipeline` (a running run on desk 1
with 12 jobs: 5 done, 1 failed, 3 running, 3 queued, named like the real CI: "Typecheck, lint, unit tests", "Build, CV
and e2e (1/8)" to "(8/8)", "Lighthouse CI", "3D perf gates 1/2", "3D perf gates 2/2"; a finished green run; a merge of
desk 2 and a production deploy success).
- [ ] **Step 4:** Run; expected PASS.
- [ ] **Step 5:** Commit `feat(office): snapshot contract v2 with the pipeline`.

### Task 3: Serve v2 (Durable Object, Worker, Pages Function)

**Files:**
- Modify: `workers/office/src/office.ts`, `workers/office/src/worker.ts`, `functions/_lib/office.ts`
- Test: `tests/office/worker.test.ts`, `tests/office/office-endpoint.test.ts`

- [ ] **Step 1: Tests first.** Worker: `GET /snapshot?v=2` answers `viewV2` (parses with `parseOfficeResponseV2`),
  `GET /snapshot` and `?v=3` answer v1. Endpoint:

```ts
it("serves v2 only for ?v=2, with its own cache entry, and v1 unchanged", async () => {
  const cache = memoryCache();
  const env = officeEnv({ snapshot: (v) => (v === "2" ? OFFICE_FIXTURES_V2.busy : OFFICE_FIXTURES.busy) });
  const h = createOfficeSnapshotHandler({ cache: () => cache });
  const v1 = await h(ctx("https://x/api/office", env));
  const v2 = await h(ctx("https://x/api/office?v=2", env));
  const junk = await h(ctx("https://x/api/office?v=2&x=<script>", env));
  expect((await v1.json()).v).toBe(1);
  expect((await v2.json()).v).toBe(2);
  expect((await junk.json()).v).toBe(2);
  expect(cache.keys()).toEqual(["https://x/api/office", "https://x/api/office?v=2"]);
  expect(v2.headers.get("Cache-Control")).toBe("public, max-age=5, stale-while-revalidate=30");
});
```

(`memoryCache`, `officeEnv` and `ctx` extend the helpers this test file already has; `officeEnv` gains a `snapshot(v)` hook.)
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3: Implement.** DO `/snapshot`: `const v2 = new URL(request.url).searchParams.get("v") === "2";` and
  `JSON.stringify(v2 ? viewV2(doc, now) : view(doc, now))`. Worker: forward `?v=2` only
  (`office.fetch(\`${DO_BASE}/snapshot${new URL(request.url).searchParams.get("v") === "2" ? "?v=2" : ""}\`)`).
  Function: `const v2 = new URL(request.url).searchParams.get("v") === "2";` the cache key is
  `new URL(v2 ? "/api/office?v=2" : "/api/office", request.url)`; fetch `${WORKER}/snapshot${v2 ? "?v=2" : ""}`;
  validate with `v2 ? parseOfficeResponseV2 : parseOfficeResponse`; the fallback on failure stays `offSnapshot` (v1:
  the scene's `parseOfficeAny` reads it). `jsonAnswer` takes `OfficeResponseV1 | OfficeSnapshotV2`.
- [ ] **Step 4:** Run `bun run test tests/office/`; expected PASS.
- [ ] **Step 5:** Commit `feat(office): serve the v2 snapshot at /api/office?v=2`.

### Task 4: The scene polls v2

**Files:**
- Modify: `src/lib/office/poll.ts`, `src/experience/floors/lobby/office/live.ts`, `src/experience/floors/lobby/office/officeModel.ts`
- Test: `tests/unit/office-poll.test.ts`, `tests/unit/office-model.test.ts`

**Interfaces:**
- Produces: `OfficePollerOptions.path?: string` (default `OFFICE_PATH`) and `parse?: (raw: unknown) => OfficeResponse | null`
  (default `parseOfficeResponse`); `OfficeFeed.snapshot: (OfficeSnapshotV1 & { pipeline?: OfficePipeline }) | null`;
  `OfficeView.pipeline: OfficePipeline | null` (null when off, offline or v1).

- [ ] **Step 1: Tests first:** the poller fetches `path` and parses with `parse` (a stub records the URL and returns
  `OFFICE_FIXTURES_V2.busy`; the feed keeps `pipeline`); `officeView` keeps `pipeline` when live and drops it when
  offline or off.
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3: Implement:** in `createOfficePoller`, `const path = opts.path ?? OFFICE_PATH; const parse = opts.parse ?? parseOfficeResponse;`
  and use them where it fetches and validates today. `live.ts`: `createOfficePoller({ now: ..., path: \`${OFFICE_PATH}?v=2\`, parse: parseOfficeAny })`.
  `officeView`: `pipeline: live && "pipeline" in live && live.pipeline ? live.pipeline : null`. The Classic card's poller
  is untouched (v1).
- [ ] **Step 4:** Run; expected PASS. `bun run build` still passes the Classic JS budget (the card does not import `parseOfficeAny`).
- [ ] **Step 5:** Commit `feat(office): the 3D office polls the v2 snapshot`.

### Task 5: Pipeline events (pure)

**Files:**
- Create: `src/experience/floors/lobby/office/pipeline.ts`
- Test: `tests/unit/office-pipeline.test.ts`

**Interfaces:**
- Produces:

```ts
export type PipeEvent =
  | { kind: "packet"; from: number | "wall"; at: number }
  | { kind: "burst"; run: number; lane: number; ok: boolean; at: number }
  | { kind: "crown"; ok: boolean; at: number }
  | { kind: "package"; from: number | "tower"; key: string; at: number }
  | { kind: "beam"; status: "running" | "success" | "failure"; at: number };
export interface Lane { run: number; name: string; status: "queued" | "running" | "done" | "failed" }
export const PIPE = { staleMs: 60_000, deployFreshMs: 30_000, burstGap: 0.15, packageGap: 1, maxQueue: 40 } as const;
export function lanesOf(p: OfficePipeline | null): Lane[]; // newest running run first, then the others, at most 24 lanes in all
export function diffPipeline(prev: OfficePipeline | null, next: OfficePipeline, now: number): PipeEvent[];
export class PipeQueue { push(events: PipeEvent[], t: number): void; due(t: number): PipeEvent[]; size(): number }
```

- [ ] **Step 1: Tests first:**

```ts
import { describe, expect, it } from "vitest";
import { diffPipeline, lanesOf, PIPE, PipeQueue } from "@/experience/floors/lobby/office/pipeline";
import { OFFICE_FIXTURES_V2 } from "@/lib/office/fixtures";
import type { OfficePipeline } from "@/lib/office/protocol";

const P = OFFICE_FIXTURES_V2.busy.pipeline;
const now = OFFICE_FIXTURES_V2.busy.updatedAt;
const withJob = (p: OfficePipeline, lane: number, status: "done" | "failed"): OfficePipeline => ({ ...p, runs: p.runs.map((r, i) => (i === 0 ? { ...r, jobs: r.jobs.map((j, k) => (k === lane ? { ...j, status } : j)) } : r)) });

describe("pipeline", () => {
  it("orders lanes: the running run first, at most 24", () => {
    const lanes = lanesOf(P);
    expect(lanes.length).toBeLessThanOrEqual(24);
    expect(lanes[0].run).toBe(P.runs.find((r) => r.status === "running")!.id);
  });
  it("is silent on the first snapshot, except a fresh deploy", () => {
    expect(diffPipeline(null, P, now).filter((e) => e.kind !== "beam")).toEqual([]);
    const fresh = { ...P, ships: [{ key: "deploy:1", kind: "deploy" as const, status: "success" as const, at: now - 5_000 }] };
    expect(diffPipeline(null, fresh, now)).toEqual([{ kind: "beam", status: "success", at: now - 5_000 }]);
  });
  it("bursts on a job finishing, crowns a finished run, packets a new run from its desk", () => {
    const lane = P.runs[0].jobs.findIndex((j) => j.status === "running");
    expect(diffPipeline(P, withJob(P, lane, "done"), now)).toContainEqual(expect.objectContaining({ kind: "burst", lane, ok: true }));
    const fin = { ...P, runs: P.runs.map((r, i) => (i === 0 ? { ...r, status: "success" as const } : r)) };
    expect(diffPipeline(P, fin, now)).toContainEqual(expect.objectContaining({ kind: "crown", ok: true }));
    const added = { ...P, runs: [{ ...P.runs[0], id: 999, slot: 2, at: now, jobs: [] }, ...P.runs.slice(0, 2)] };
    expect(diffPipeline(P, added, now)).toContainEqual(expect.objectContaining({ kind: "packet", from: 2 }));
  });
  it("drops stale events and packages a new merge from its desk or the tower", () => {
    const merged = { ...P, ships: [{ key: "pr:x#9", kind: "merge" as const, status: "merged" as const, at: now, slot: 1 }, ...P.ships] };
    expect(diffPipeline(P, merged, now)).toContainEqual(expect.objectContaining({ kind: "package", from: 1 }));
    const old = { ...P, ships: [{ key: "pr:x#8", kind: "merge" as const, status: "merged" as const, at: now - PIPE.staleMs - 1 }, ...P.ships] };
    expect(diffPipeline(P, old, now)).toEqual([]);
  });
  it("staggers bursts and packages and caps the queue", () => {
    const q = new PipeQueue();
    q.push(Array.from({ length: 50 }, (_, i) => ({ kind: "burst" as const, run: 1, lane: i % 24, ok: true, at: now })), 0);
    expect(q.size()).toBe(PIPE.maxQueue);
    expect(q.due(0)).toHaveLength(1);
    expect(q.due(0.1)).toHaveLength(0);
    expect(q.due(0.16)).toHaveLength(1);
  });
});
```

- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3: Implement** `pipeline.ts`:

```ts
import type { OfficePipeline, OfficePipelineRun } from "@/lib/office/protocol";

export const PIPE = { staleMs: 60_000, deployFreshMs: 30_000, burstGap: 0.15, packageGap: 1, maxQueue: 40, lanes: 24 } as const;

export type PipeEvent =
  | { kind: "packet"; from: number | "wall"; at: number }
  | { kind: "burst"; run: number; lane: number; ok: boolean; at: number }
  | { kind: "crown"; ok: boolean; at: number }
  | { kind: "package"; from: number | "tower"; key: string; at: number }
  | { kind: "beam"; status: "running" | "success" | "failure"; at: number };

export interface Lane {
  run: number;
  name: string;
  status: "queued" | "running" | "done" | "failed";
}

/** Lanes bottom to top: the newest running run's jobs first, then the other runs', at most 24 in all. */
export function lanesOf(p: OfficePipeline | null): Lane[] {
  if (!p) return [];
  const runs = [...p.runs].sort((a, b) => Number(b.status === "running") - Number(a.status === "running") || b.at - a.at);
  const out: Lane[] = [];
  for (const r of runs) for (const j of r.jobs) if (out.length < PIPE.lanes) out.push({ run: r.id, name: j.name, status: j.status });
  return out;
}

const laneIndex = (lanes: Lane[], run: number, k: number) => {
  let seen = 0;
  for (let i = 0; i < lanes.length; i++) if (lanes[i].run === run && seen++ === k) return i;
  return -1;
};

/** Events between two snapshots (design 6.4). The first snapshot is a silent baseline but for a fresh deploy. */
export function diffPipeline(prev: OfficePipeline | null, next: OfficePipeline, now: number): PipeEvent[] {
  const fresh = (at: number, ms: number = PIPE.staleMs) => now - at <= ms;
  if (!prev) {
    const d = next.ships.find((s) => s.kind === "deploy" && s.status === "success" && fresh(s.at, PIPE.deployFreshMs));
    return d ? [{ kind: "beam", status: "success", at: d.at }] : [];
  }
  const out: PipeEvent[] = [];
  const lanes = lanesOf(next);
  const before = new Map<number, OfficePipelineRun>(prev.runs.map((r) => [r.id, r]));
  for (const r of next.runs) {
    const old = before.get(r.id);
    if (!old) {
      if (fresh(r.at)) out.push({ kind: "packet", from: r.slot ?? "wall", at: r.at });
      continue;
    }
    r.jobs.forEach((j, k) => {
      const was = old.jobs[k]?.status;
      if ((j.status === "done" || j.status === "failed") && was !== j.status) {
        const lane = laneIndex(lanes, r.id, k);
        if (lane >= 0) out.push({ kind: "burst", run: r.id, lane, ok: j.status === "done", at: now });
      }
    });
    if (old.status === "running" && r.status !== "running") out.push({ kind: "crown", ok: r.status === "success", at: now });
  }
  const seen = new Set(prev.ships.map((s) => `${s.key}:${s.status}`));
  for (const s of next.ships) {
    if (seen.has(`${s.key}:${s.status}`) || !fresh(s.at)) continue;
    if (s.kind === "merge") out.push({ kind: "package", from: s.slot ?? "tower", key: s.key, at: s.at });
    else out.push({ kind: "beam", status: s.status === "merged" ? "success" : s.status, at: s.at });
  }
  return out;
}

/** Plays events staggered (bursts 0.15 s apart, packages 1 s apart, the rest at once), at most 40 waiting. */
export class PipeQueue {
  private items: PipeEvent[] = [];
  private nextBurst = 0;
  private nextPackage = 0;

  push(events: PipeEvent[], _t: number): void {
    this.items.push(...events);
    if (this.items.length > PIPE.maxQueue) this.items.splice(0, this.items.length - PIPE.maxQueue);
  }

  due(t: number): PipeEvent[] {
    const out: PipeEvent[] = [];
    const rest: PipeEvent[] = [];
    for (const e of this.items) {
      if (e.kind === "burst") {
        if (t >= this.nextBurst) {
          out.push(e);
          this.nextBurst = t + PIPE.burstGap;
        } else rest.push(e);
      } else if (e.kind === "package") {
        if (t >= this.nextPackage) {
          out.push(e);
          this.nextPackage = t + PIPE.packageGap;
        } else rest.push(e);
      } else out.push(e);
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

### Task 6: Pipeline visuals

**Files:**
- Create: `src/experience/floors/lobby/office/pipelineFx.ts`
- Modify: `crewFx.ts` (the stage A `towerLanes` / `writeTower` read `lanesOf` when a pipeline exists), `OfficeScene.tsx`, `officeRig.ts` (one package part)
- Test: `tests/unit/office-pipeline-fx.test.ts`

**Interfaces:**
- Consumes: `lanesOf`, `PipeEvent`, `PipeQueue` (Task 5); `TOWER`, `writeTower` (part A); `OFFICE_SLOTS`, `officeTowerColumn`, `officeDockPad`.
- Produces: `FX = { packets: 4, bursts: 8, crownDots: 8, packages: 12, trail: 6 }`; glow instance block after the tower
  (`FX_START = TOWER.start + TOWER.lanes * TOWER.dots`, size `FX.packets * 3 + FX.bursts * 3 + FX.crownDots + FX.trail`);
  parts block after the Rovers (`PACKAGE_START = 5 * PARTS_PER_ROVER`, 12 instances: one flying, eleven stacked);
  `class PipelineFx { play(e: PipeEvent, t: number): void; write(t: number, lanes: Lane[], reduced: boolean, merged: number, glowM, glowC, partsM): boolean; key(t, reduced): string }`.
  `arcPoint(from: Vec3, to: Vec3, u: number, lift: number, out: Vec3)` (pure).

- [ ] **Step 1: Tests first:** `arcPoint` starts at `from`, ends at `to`, peaks `lift` over the higher end at u 0.5;
  `PipelineFx.play` of a burst makes 8 dots grow around the lane for 0.6 s then vanish; a package flies 2.5 s from the
  desk over the wall top (every sampled y above `OFFICE.wall.bottom + OFFICE.wall.h + OFFICE.wall.frame + 1` while its
  x is within the wall) and stacks on the dock (the stack count equals `merged`, at most 12); under reduced motion
  `play` shows end states only (no flying instance, the stack updated at once) and `key` is stable; `write` returns false
  (nothing to write) when no effect is active and the lanes did not change.
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3: Implement.** Effects are small records `{ kind, t0, from, to, ok }` in fixed-size pools (no allocation per
  frame); `write` walks the pools, places dots with `arcPoint` (packets 1.5 s, lift 2 u; package 2.5 s, lift
  `wallTop + 3 - max(fromY, toY)`), bursts as a ring of 8 dots radius `0.2 + u * 0.8` around the lane's middle dot
  (green `#34d399` or red `#f87171`, alpha `1 - u`), the crown as 8 dots on the column's top flashing 0.5 s, the package
  as a 0.5 u parts box with a 6-dot trail in `COLORS.violet`, the stack as boxes on the dock pad (3 per row, 4 rows).
  Lanes: the tower writer colours each lane by `Lane.status` (queued dim, running chasing, done green, failed red) from
  `lanesOf(view.pipeline)` when `view.pipeline` exists, else part A's anonymous progress. In `OfficeScene`, keep the
  previous pipeline in a ref; on each new feed run `diffPipeline(prev, next, Date.now())` into a `PipeQueue`; every frame
  `queue.due(now)` feeds `fx.play`, then `fx.write(...)` through `whenDrawn`; beams go to the main-path signal
  (`setOfficeSignal({ deployAt })` for a success, Task 7). Grow the glow mesh by the FX block and the parts mesh by 12
  (rest instances at the dock so bounds hold).
- [ ] **Step 4:** Run the fx tests, `office-crew-fx`, `office-rig`; expected PASS.
- [ ] **Step 5:** Commit `feat(office): tower lanes, packets, bursts and packages`.

### Task 7: The deploy beam

**Files:**
- Modify: `beacon.ts`, `OfficeBeacon.tsx`, `officeSignal.ts`
- Test: `tests/unit/office-beacon.test.ts`, `tests/unit/office-signal.test.ts`

**Interfaces:**
- Produces: `BEAM = { h: 40, r: 1.1, s: 8 }`; `beamInstance(t: number, since: number | null, reduced: boolean, out: BeaconInstance): void`
  (alpha 0 outside the 8 s window); `officeSignal.deployAt` drives it; the beacon mesh is visible while
  `needsKurniadi || beamOn`.

- [ ] **Step 1: Tests first:** `beamInstance` rises to `BEAM.h` over 0.6 s, holds, fades over the last 1.5 s and is 0 at
  8 s; reduced motion holds a steady glow for 8 s; `OfficeBeacon` stays visible for a beam with no Rover asking (a jsdom
  render is not needed: test `beaconVisible(needsKurniadi, deployAt, now)` pure in `beacon.ts`).
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3: Implement** in `beacon.ts`:

```ts
export const BEAM = { h: 40, r: 1.1, s: 8, rise: 0.6, fade: 1.5 } as const;

export const beaconVisible = (asking: boolean, deployAt: number | null, now: number) => asking || (deployAt !== null && now - deployAt < BEAM.s * 1000);

/** Instance 4: the production deploy beam over the ship dock, `since` seconds after it fired. */
export function beamInstance(since: number | null, reduced: boolean, out: BeaconInstance): void {
  if (since === null || since < 0 || since >= BEAM.s) {
    Object.assign(out, { y: 0, r: 0, h: 0, alpha: 0 });
    return;
  }
  const rise = reduced ? 1 : Math.min(1, since / BEAM.rise);
  const fade = since > BEAM.s - BEAM.fade ? (BEAM.s - since) / BEAM.fade : 1;
  Object.assign(out, { y: 0, r: BEAM.r, h: BEAM.h * rise, alpha: (reduced ? 0.6 : 0.95) * fade });
}
```

`OfficeBeacon` places instance 4 at `officeDockPad(LOBBY.officeWing)` in `COLORS.green`, `since = (Date.now() - deployAt) / 1000`,
and its `visible` follows `beaconVisible`. The watch's `signalFromBody` already returns `deployAt` (part A); the scene
sets it from its own feed too.
- [ ] **Step 4:** Run; expected PASS.
- [ ] **Step 5:** Commit `feat(office): the production deploy beam over the dock`.

### Task 8: The CI room and drawer

**Files:**
- Modify: `officeLayout.ts` (`OFFICE_CI_ROOM = "L1:office-ci"` in `OFFICE_ROOMS`), `office/interact.ts` (target `L1:station:office-ci` at the tower column), `OfficeBody.tsx` (the CI view), `messages/en.json`, `messages/id.json`, `src/content/...` room id lists if office rooms are enumerated there
- Test: `tests/unit/office-rooms.test.ts`, `tests/unit/office-interact.test.ts`, `tests/hud/OfficeBody.test.tsx`

- [ ] **Step 1: Tests first:** the CI room keeps `/{locale}` (`isOfficeRoom`), stops at the office stop, its target sits at
  the tower column; the drawer lists each run (title, status) with its lanes as a list of "job name: status" and the
  latest ships ("Merged #12 ...", "Deploy · production: success"), links only through `safeGithubUrl`; a v1 feed shows
  "Pipeline details need a newer office" never: it shows the anonymous progress line instead.
- [ ] **Step 2:** Run; expect FAIL.
- [ ] **Step 3: Implement:** the room id, the target (label `t("3d.target.ci")`), and an `OfficeCiView` in the body with
  strings `office.3d.ci.*` (title "Ship-it pipeline" / "Jalur rilis", job statuses, "No runs today" / "Belum ada run hari ini").
- [ ] **Step 4:** Run the three files, `messages` and `client-namespaces` tests; expected PASS.
- [ ] **Step 5:** Commit `feat(office): the ship-it pipeline drawer and CI tower target`.

### Task 9: E2E, budgets, captures, security review, docs, PR

- [ ] **Step 1:** `e2e/office.spec.ts`: from `OFFICE_FIXTURES_V2` the tower shows N lanes (probe
  `__hq.probes.office.lanes`), feeding a snapshot with a finished job raises `__hq.probes.office.fx.bursts`, a new merge
  a package (`fx.packages`), a deploy success the beam (`__hq.probes.office.beam`); the CI drawer lists the jobs; v1
  fixtures still render (no pipeline). Add `lanes`, `fx` and `beam` to `sceneProbes.office`.
- [ ] **Step 2:** Perf lane (`E2E_PORT=4512 bun run e2e:perf`): L1 calls at the stop and the spawn with the beam on, both
  tiers (under 125), programs at baseline, memory gates; re-set `office`, `officeBody` and the main-path caps by measured
  plus 0.6 KB; `officeTotal` 40 KB holds. Decision file for the re-set caps.
- [ ] **Step 3:** Captures and video (part A's `scripts/office-shots.ts` gains shots `pipeline` and `ship`, and the video
  feeds a scripted run: lanes filling, a failure burst, a merge package, a deploy beam) at 1440x900, 820x1180 and 390x844,
  full and lite; send to the coordinator.
- [ ] **Step 4:** Security review: run the `security-review` agent on the branch diff (focus: v2 parsing, job names,
  cache keys, the `v` query, privatize handling); fix findings; summarise them in the PR.
- [ ] **Step 5:** Docs: `docs/agents/office.md` (contract v2, pipeline, endpoints), `docs/agents/floor-l1-lobby.md` (tower,
  dock, rendering counts, CI room, probes), `docs/features.md`, `workers/office/README.md`; this plan's `Status: in review`.
- [ ] **Step 6:** `bun run verify:quick && bun run e2e:changed`, check CI in flight, push, open a ready-for-review PR
  `feat(office): the ship-it pipeline (revamp part B)`.

## Self-review notes

- Spec 6.1 (placement) shipped in part A; 6.2 to Tasks 1 to 4; 6.3 to Tasks 6 to 8; 6.4 to Task 5; 6.5 and 13 to Task 9.
- Types shared across tasks: `OfficePipeline`, `OfficePipelineRun`, `OfficeShip`, `OfficeSnapshotV2`, `parseOfficeAny`,
  `pipelineOf`, `viewV2`, `lanesOf`, `diffPipeline`, `PipeQueue`, `PipelineFx`, `BEAM`, `beamInstance`, `beaconVisible`.
