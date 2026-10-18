# CI: Main Runs the Complement, Narrower PR Perf and Lighthouse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

Status: part 1 in progress (2026-10-18). Owner decision 2026-10-18: three PRs in order, after the B1 PRs merge.
No test or gate leaves the suite; only when and where each one runs changes.

**Goal:** Stop running on `main` what the merged pull request already proved on the same tree, select fewer perf
gates and Lighthouse URLs on pull requests, and then allow two CI runs in flight.

**Architecture:** `Plan CI` (`scripts/ci-plan.ts`) uploads a `ci-plan` artifact on every run: a small JSON record
of what that run covered (e2e specs, perf keys, Lighthouse paths). On a push to `main` it looks up the merged pull
request, checks that the PR head tree equals the merged tree, takes the newest green `pull_request` CI run on that
head and reads its record; the plan is then the complement (everything the PR run did not cover), and the run
counts as complete (`ci-full`) because both runs together cover everything. Missing PR, different tree, no green
run or no record: a full run, as before. The aggregate job merges the PR run's `perf-report` and the Lighthouse job
the PR run's `lighthouse-reports` into this run's artifacts, so the next PR's baselines stay complete. Part 2 swaps
the "imported by the 3D roots" perf rule for "the perf keys of the 3D files that import it"; part 3 narrows
Lighthouse on pull requests to the affected URLs plus the home page.

**Tech Stack:** Bun scripts (dependency-free, run without `bun install` in `Plan CI`), Vitest, GitHub Actions,
the `gh` CLI on the hosted runners.

## Global Constraints

- No em dashes (U+2014) anywhere: code, comments, docs, commits, PR text.
- Never drop a test or gate from the suite. The nightly (`schedule`) and plain dispatches stay full runs.
- Required check names stay valid on pull requests (`Typecheck, lint, unit tests`, `Build, CV and e2e`,
  `Lighthouse CI`, `3D perf gates 1/2`, `3D perf gates 2/2`); heavy jobs never skip at the job level.
- `scripts/ci-plan.ts` and everything it imports stay dependency-free (node builtins, fetch, `gh`, other scripts).
- Fail safe: any lookup error, a missing artifact or a malformed record plans a full run with the reason in the
  job summary.
- The deploy gate (`scripts/ci-status.ts`) and rollback (`scripts/rollback.ts`) keep reading the `ci-full`
  marker; a complement run uploads it only because the run plus its source PR run cover everything.
- One CI run in flight until part 3 changes the rule; nothing is pushed until the B1 PRs (#213) merged.
- Docs in the same PR: `docs/agents/ci-and-deploy.md`, `docs/agents/performance.md`, `docs/decisions.md`,
  `AGENTS.md`, `README.md` CI bullet, `deploy.yml` and `ci.yml` header comments.

## Measurements before (owner request 2026-10-18)

Main CI on the last four merges (`gh run view <id> --json jobs`):

| Merge | Main wall | Runner-min | PR tree == merge tree | PR run covered |
|---|---|---|---|---|
| #210 `b3780ab2` | 14.4 min | 137 | yes | every Lighthouse URL, every perf key but memory, 7 e2e specs plus 2 smoke tests |
| #209 `ae6ccefc` | 12.7 min | 118 | no | full e2e, perf, Lighthouse |
| #211 `f9686e01` | 12.9 min | 124 | yes | every Lighthouse URL, every perf key but memory, 9 e2e specs |
| #208 `e741df73` | 12.9 min | 121 | yes | every Lighthouse URL, every perf key but memory, 9 e2e specs |

Where main's runner-minutes go (run 39116733269): 8 e2e shards 81 min, 4 perf shards 42 min, Lighthouse 8 min,
check, secrets, build, plan and aggregate 5 min. e2e is test-bound: 9,515 worker-seconds in `e2e/durations.json`
at 2 workers per runner; setup is about 35 s per shard, so more shards change wall time, not runner-minutes.
`memory-full` is one 9.6 minute test that pull requests only select for memory paths, so a complement run that
includes it has a wall-time floor of about 12 minutes (build 1.7 min plus one perf job of about 10.5 min).

Expected after part 1 for a #210-like merge: e2e complement about 8,900 worker-seconds (about 75 runner-min on 8
shards), perf `memory-full` only (1 shard, about 10.5 min), no Lighthouse: about 95 runner-min (down from 137) and
about 12 minutes wall (down from 14.4). The 55 runner-min and 8 minute target is not reachable without moving
tests off `main` (reported to the owner; option: `memory-full` on `main` only in the nightly).

---

## Part 1 (PR 1): main runs the complement

### Task 1: Shared shard sizing in `scripts/e2e-plan.ts`

**Files:**
- Modify: `scripts/e2e-plan.ts` (add exports next to `specSeconds`)
- Modify: `scripts/ci-plan.ts:130-132,206-216` (use the helper)
- Test: `tests/unit/e2e-plan.test.ts`

**Interfaces:**
- Produces: `MAX_E2E_SHARDS = 8`, `E2E_SHARD_SECONDS = 480`, `e2eShardsFor(seconds: number): number`
  (0 seconds gives 1; else `ceil(seconds / 480)` clamped to 1..8).

- [x] **Step 1: Write the failing test** in `tests/unit/e2e-plan.test.ts`:

```ts
describe("e2eShardsFor", () => {
  it("sizes ceil(seconds / 480), 1 to 8", () => {
    expect(e2eShardsFor(0)).toBe(1);
    expect(e2eShardsFor(480)).toBe(1);
    expect(e2eShardsFor(481)).toBe(2);
    expect(e2eShardsFor(9515)).toBe(8);
  });
});
```

- [x] **Step 2: Run** `bunx vitest run tests/unit/e2e-plan.test.ts` and see it fail (no export).
- [x] **Step 3: Implement** in `scripts/e2e-plan.ts`:

```ts
export const MAX_E2E_SHARDS = 8;
/** Worker-seconds one e2e shard should take: 2 workers for about 4 minutes. */
export const E2E_SHARD_SECONDS = 2 * 240;

/** Shards for a planned e2e run of `seconds` worker-seconds: ceil(seconds / 480), 1 to 8. */
export function e2eShardsFor(seconds: number): number {
  return seconds <= 0 ? 1 : Math.min(MAX_E2E_SHARDS, Math.max(1, Math.ceil(seconds / E2E_SHARD_SECONDS)));
}
```

  In `scripts/ci-plan.ts` delete the local `MAX_E2E_SHARDS` and `SHARD_SECONDS`, import the two names, and replace
  the inline formula with `e2eShards = e2eShardsFor(seconds);`.
- [x] **Step 4: Run** `bunx vitest run tests/unit/e2e-plan.test.ts tests/unit/ci-plan.test.ts`: pass.
- [x] **Step 5: Commit** `refactor(ci): share the e2e shard sizing`.

### Task 2: `scripts/ci-complement.ts` (pure record, complement and source lookup)

**Files:**
- Create: `scripts/ci-complement.ts`
- Modify: `scripts/ci-plan.ts` (`CiPlan.source?`, `planOutputs` adds `source_run` and treats a complement as
  complete; `CLASSES` ci regex gains `ci-complement`)
- Test: `tests/unit/ci-complement.test.ts`, `tests/unit/ci-plan.test.ts` (classify row)

**Interfaces:**
- Consumes: `CiPlan`, `planOutputs` (`scripts/ci-plan.ts`, type-only import of `CiPlan` to avoid a cycle),
  `ALL_SPECS`, `specSeconds`, `e2eShardsFor`, `Durations`, `Spec` (`scripts/e2e-plan.ts`), `ALL_PERF_KEYS`,
  `perfGrep`, `PerfKey` (`scripts/perf-plan.ts`), `mergedPrFor`, `MergedPr` (`scripts/merge-gate.ts`).
- Produces:
  - `PLAN_ARTIFACT = "ci-plan"`, `PLAN_FILE = "ci-plan.json"`
  - `interface PlanRecord { version: 1; e2e: "all" | { specs: Spec[]; tests: string[] }; perf: "all" | PerfKey[]; lighthouse: "all" | string[] }`
  - `recordFor(plan: CiPlan, outputs: Record<string, string>): PlanRecord`
  - `parseRecord(text: string): PlanRecord | null`
  - `interface Source { run: number; pr: number; url: string }`
  - `perfSeconds(durations: Durations | null | undefined, keys: readonly PerfKey[]): number`
  - `perfShardsFor(seconds: number): number` (ceil(seconds / 960), 1 to 4)
  - `complementPlan(record: PlanRecord, source: Source, opts: { lighthousePaths: readonly string[]; durations?: Durations | null; perfDurations?: Durations | null }): CiPlan`
  - `interface GreenRun { id: number; html_url: string; event: string; head_repository: { full_name: string } | null }`
  - `interface SourceDeps { pullsFor(sha: string): Promise<MergedPr[]>; pull(n: number): Promise<MergedPr>; treeOf(sha: string): Promise<string>; greenRuns(headSha: string): Promise<GreenRun[]>; record(runId: number): Promise<PlanRecord | null> }`
  - `type SourceResult = { ok: true; source: Source; record: PlanRecord } | { ok: false; why: string }`
  - `findSource(repo: string, sha: string, prNumber: number | null, deps: SourceDeps): Promise<SourceResult>`
  - `CiPlan.source?: Source`; `planOutputs` adds `source_run` (`""` without a source) and reports
    `full: "true"` for a plan with a source.

- [x] **Step 1: Write the failing tests** (`tests/unit/ci-complement.test.ts`):

```ts
import { describe, expect, it } from "vitest";
import { complementPlan, findSource, parseRecord, perfSeconds, perfShardsFor, recordFor, type PlanRecord, type SourceDeps } from "../../scripts/ci-complement";
import { LIGHTHOUSE_PAGES, planFor, planOutputs } from "../../scripts/ci-plan";
import { ALL_SPECS } from "../../scripts/e2e-plan";
import { ALL_BUT_MEMORY, ALL_PERF_KEYS } from "../../scripts/perf-plan";

const paths = Object.keys(LIGHTHOUSE_PAGES);
const source = { run: 7, pr: 210, url: "https://github.com/o/r/actions/runs/7" };
const opts = { lighthousePaths: paths };

describe("recordFor", () => {
  it("records a full run as all", () => {
    const plan = planFor(null, () => false);
    expect(recordFor(plan, planOutputs(plan))).toEqual({ version: 1, e2e: "all", perf: "all", lighthouse: "all" });
  });
  it("records the specs, smoke tests, perf keys and Lighthouse paths of a selective run", () => {
    const plan = { ...planFor(null, () => false), full: false, e2e: ["ask" as const], e2eTests: ["e2e/ride.spec.ts:93"], perf: ["bytes" as const], lighthouse: ["/en"] };
    const urls = ["http://h/en?lhci-warmup=1", "http://h/en"];
    expect(recordFor(plan, planOutputs(plan, urls))).toEqual({ version: 1, e2e: { specs: ["ask"], tests: ["e2e/ride.spec.ts:93"] }, perf: ["bytes"], lighthouse: ["/en"] });
  });
  it("records no heavy work as empty lists", () => {
    const plan = { ...planFor(null, () => false), full: false, e2e: [], e2eTests: [], perf: false as const, lighthouse: false as const };
    expect(recordFor(plan, planOutputs(plan))).toEqual({ version: 1, e2e: { specs: [], tests: [] }, perf: [], lighthouse: [] });
  });
});

describe("parseRecord", () => {
  it("round-trips a record and rejects anything else", () => {
    const r: PlanRecord = { version: 1, e2e: { specs: ["ask"], tests: [] }, perf: ["bytes"], lighthouse: "all" };
    expect(parseRecord(JSON.stringify(r))).toEqual(r);
    expect(parseRecord("nope")).toBeNull();
    expect(parseRecord(JSON.stringify({ ...r, version: 2 }))).toBeNull();
    expect(parseRecord(JSON.stringify({ ...r, perf: ["warp"] }))).toBeNull();
    expect(parseRecord(JSON.stringify({ ...r, e2e: { specs: ["nope"], tests: [] } }))).toBeNull();
  });
});

describe("complementPlan", () => {
  it("runs nothing heavy after a full PR run, and still counts as complete", () => {
    const plan = complementPlan({ version: 1, e2e: "all", perf: "all", lighthouse: "all" }, source, opts);
    const out = planOutputs(plan);
    expect(out).toMatchObject({ full: "true", e2e: "none", perf: "false", lighthouse: "false", source_run: "7" });
  });
  it("runs the specs, perf keys and URLs the PR run did not, and partly run specs whole", () => {
    const record: PlanRecord = { version: 1, e2e: { specs: ["ask", "seo"], tests: ["e2e/ride.spec.ts:93"] }, perf: [...ALL_BUT_MEMORY], lighthouse: ["/en", "/id"] };
    const plan = complementPlan(record, source, opts);
    expect(plan.e2e).toEqual(ALL_SPECS.filter((s) => s !== "ask" && s !== "seo"));
    expect(plan.e2e).toContain("ride");
    expect(plan.perf).toEqual(["memory"]);
    expect(plan.lighthouse).toEqual(paths.filter((p) => p !== "/en" && p !== "/id"));
    expect(plan.e2eShards).toBe(8);
    expect(plan.perfShards).toBe(1);
  });
  it("runs everything when the PR run ran no heavy job", () => {
    const plan = complementPlan({ version: 1, e2e: { specs: [], tests: [] }, perf: [], lighthouse: [] }, source, opts);
    expect(plan.e2e).toBe("all");
    expect(plan.perf).toEqual([...ALL_PERF_KEYS]);
    expect(plan.lighthouse).toBe("all");
    expect(plan.perfShards).toBe(4);
  });
  it("covers every spec, perf key and URL together with the record", () => {
    const record: PlanRecord = { version: 1, e2e: { specs: ["hud", "labs"], tests: [] }, perf: ["bytes", "floor:L3"], lighthouse: ["/en/quick"] };
    const plan = complementPlan(record, source, opts);
    const e2e = new Set([...(record.e2e as { specs: string[] }).specs, ...(plan.e2e as string[])]);
    expect([...e2e].sort()).toEqual([...ALL_SPECS].sort());
    expect(new Set([...(record.perf as string[]), ...(plan.perf || [])]).size).toBe(ALL_PERF_KEYS.length);
    expect(new Set([...(record.lighthouse as string[]), ...(plan.lighthouse as string[])]).size).toBe(paths.length);
  });
});

describe("perf sizing", () => {
  const durations = { "memory-full.spec.ts › full tier, Motion Full: Lobby to Roof round trips leave renderer memory at its baseline": 900, "floors.spec.ts › L1 full: settled draw calls and shader programs": 156 };
  it("sums the durations of the tests the keys grep", () => {
    expect(perfSeconds(durations, ["memory"])).toBe(900);
    expect(perfSeconds(durations, [...ALL_PERF_KEYS])).toBe(1056);
  });
  it("sizes ceil(seconds / 960), 1 to 4", () => {
    expect(perfShardsFor(0)).toBe(1);
    expect(perfShardsFor(900)).toBe(1);
    expect(perfShardsFor(3211)).toBe(4);
    expect(perfShardsFor(99999)).toBe(4);
  });
});

describe("findSource", () => {
  const repo = "o/r";
  const pr = { number: 210, merged_at: "x", merge_commit_sha: "m", html_url: "u", base: { ref: "main" }, head: { sha: "h", repo: { full_name: repo } } };
  const record: PlanRecord = { version: 1, e2e: "all", perf: "all", lighthouse: "all" };
  const deps = (over: Partial<SourceDeps> = {}): SourceDeps => ({
    pullsFor: async () => [pr],
    pull: async () => pr,
    treeOf: async () => "t",
    greenRuns: async () => [{ id: 7, html_url: "r7", event: "pull_request", head_repository: { full_name: repo } }],
    record: async () => record,
    ...over,
  });
  it("finds the newest green same-repo PR run on the same tree", async () => {
    expect(await findSource(repo, "m", null, deps())).toEqual({ ok: true, source: { run: 7, pr: 210, url: "r7" }, record });
  });
  it("uses the given pull request for a dispatch", async () => {
    expect(await findSource(repo, "x", 210, deps({ pullsFor: async () => [] }))).toMatchObject({ ok: true });
  });
  it.each([
    ["no merged PR", { pullsFor: async () => [] }],
    ["a different tree", { treeOf: async (s: string) => (s === "h" ? "t1" : "t2") }],
    ["no green PR run", { greenRuns: async () => [] }],
    ["a fork run", { greenRuns: async () => [{ id: 7, html_url: "r7", event: "pull_request", head_repository: { full_name: "fork/r" } }] }],
    ["no record", { record: async () => null }],
  ])("falls back on %s", async (_, over) => {
    expect((await findSource(repo, "m", null, deps(over as Partial<SourceDeps>))).ok).toBe(false);
  });
});
```

  And in `tests/unit/ci-plan.test.ts` add the row `["scripts/ci-complement.ts", "ci"],` to the classify table.

- [x] **Step 2: Run** `bunx vitest run tests/unit/ci-complement.test.ts tests/unit/ci-plan.test.ts`: fails (no module).
- [x] **Step 3: Implement** `scripts/ci-complement.ts`:

```ts
/**
 * Complement runs (owner decision 2026-10-18, docs/agents/ci-and-deploy.md): a push to main whose merged pull
 * request passed CI on the same tree runs only what that PR run did not. Pure helpers plus an injected lookup, so
 * Vitest runs them; scripts/ci-plan.ts makes the API calls. Dependency-free (Plan CI runs without bun install).
 */
import type { CiPlan } from "./ci-plan";
import { ALL_SPECS, e2eShardsFor, MAX_E2E_SHARDS, specSeconds, type Durations, type Spec } from "./e2e-plan";
import { mergedPrFor, type MergedPr } from "./merge-gate";
import { ALL_PERF_KEYS, perfGrep, type PerfKey } from "./perf-plan";

/** Plan CI uploads the record of every run under this artifact name (ci.yml). */
export const PLAN_ARTIFACT = "ci-plan";
export const PLAN_FILE = "ci-plan.json";

/** What one CI run covered: "all", or the lists it ran ([] = none). */
export interface PlanRecord {
  version: 1;
  /** Specs run whole, plus single `e2e/<spec>.spec.ts:<line>` tests (a complement reruns their specs whole). */
  e2e: "all" | { specs: Spec[]; tests: string[] };
  perf: "all" | PerfKey[];
  /** Lighthouse URL paths such as "/en/quick". */
  lighthouse: "all" | string[];
}

export interface Source {
  run: number;
  pr: number;
  url: string;
}

/** The record of a plan, from what its outputs actually ran (an empty grep or URL list means everything). */
export function recordFor(plan: CiPlan, outputs: Record<string, string>): PlanRecord {
  const e2e: PlanRecord["e2e"] = outputs.e2e === "all" ? "all" : outputs.e2e === "none" ? { specs: [], tests: [] } : { specs: [...(plan.e2e as Spec[])], tests: [...plan.e2eTests] };
  const perf: PlanRecord["perf"] = outputs.perf !== "true" ? [] : outputs.perf_grep === "" ? "all" : [...(plan.perf as PerfKey[])];
  const lighthouse: PlanRecord["lighthouse"] = outputs.lighthouse !== "true" ? [] : outputs.lighthouse_urls === "" ? "all" : [...(plan.lighthouse as string[])];
  return { version: 1, e2e, perf, lighthouse };
}

const isStrings = (v: unknown): v is string[] => Array.isArray(v) && v.every((s) => typeof s === "string");

/** A record from the artifact, or null when it is not one this planner wrote. */
export function parseRecord(text: string): PlanRecord | null {
  let v: Partial<PlanRecord> & { e2e?: unknown; perf?: unknown; lighthouse?: unknown };
  try {
    v = JSON.parse(text);
  } catch {
    return null;
  }
  if (!v || v.version !== 1) return null;
  const e2e = v.e2e as { specs?: unknown; tests?: unknown } | "all";
  const e2eOk = e2e === "all" || (typeof e2e === "object" && e2e !== null && isStrings(e2e.specs) && isStrings(e2e.tests) && e2e.specs.every((s) => (ALL_SPECS as readonly string[]).includes(s)));
  const perfOk = v.perf === "all" || (isStrings(v.perf) && v.perf.every((k) => (ALL_PERF_KEYS as readonly string[]).includes(k)));
  const lighthouseOk = v.lighthouse === "all" || isStrings(v.lighthouse);
  return e2eOk && perfOk && lighthouseOk ? (v as PlanRecord) : null;
}

/** Worker-seconds of the perf tests `keys` select (the perf lane of e2e/durations.json). */
export function perfSeconds(durations: Durations | null | undefined, keys: readonly PerfKey[]): number {
  if (!keys.length) return 0;
  const grep = perfGrep(keys);
  const re = grep ? new RegExp(grep) : null;
  return Object.entries(durations ?? {}).reduce((sum, [title, s]) => (!re || re.test(title) ? sum + s : sum), 0);
}

export const MAX_PERF_SHARDS = 4;
/** Worker-seconds one perf shard should take: about one memory-full test. */
export const PERF_SHARD_SECONDS = 960;

export function perfShardsFor(seconds: number): number {
  return seconds <= 0 ? 1 : Math.min(MAX_PERF_SHARDS, Math.max(1, Math.ceil(seconds / PERF_SHARD_SECONDS)));
}

/** The plan for everything `record` did not cover; with the record it covers every spec, perf key and URL. */
export function complementPlan(record: PlanRecord, source: Source, opts: { lighthousePaths: readonly string[]; durations?: Durations | null; perfDurations?: Durations | null }): CiPlan {
  const reasons = [`complement of #${source.pr}: its CI run ${source.url} passed on the same tree, so this run covers only the rest`];

  let e2e: CiPlan["e2e"] = [];
  let e2eShards = 1;
  if (record.e2e === "all") reasons.push("e2e: the PR run ran every spec");
  else {
    const done = new Set<Spec>(record.e2e.specs);
    const rest = ALL_SPECS.filter((s) => !done.has(s));
    if (rest.length === ALL_SPECS.length) {
      e2e = "all";
      e2eShards = MAX_E2E_SHARDS;
    } else {
      e2e = rest;
      const seconds = rest.reduce((sum, spec) => sum + specSeconds(opts.durations, spec), 0);
      e2eShards = e2eShardsFor(seconds);
      reasons.push(`e2e: ${rest.length} specs the PR run did not run whole, about ${Math.round(seconds)} worker-seconds on ${e2eShards} shard(s)`);
    }
  }

  const perfDone = record.perf === "all" ? ALL_PERF_KEYS : record.perf;
  const perfRest = ALL_PERF_KEYS.filter((k) => !perfDone.includes(k));
  const perf: CiPlan["perf"] = perfRest.length ? perfRest : false;
  // The whole lane keeps the full run's 4 shards; a part is sized from its durations.
  const perfShards = !perf ? 1 : perfRest.length === ALL_PERF_KEYS.length ? MAX_PERF_SHARDS : perfShardsFor(perfSeconds(opts.perfDurations, perfRest));
  reasons.push(perf ? `3D perf gates: ${perfRest.join(", ")} on ${perfShards} shard(s)` : "3D perf gates: the PR run ran every gate");

  const lhDone = record.lighthouse === "all" ? opts.lighthousePaths : record.lighthouse;
  const lhRest = opts.lighthousePaths.filter((p) => !lhDone.includes(p));
  const lighthouse: CiPlan["lighthouse"] = lhRest.length === 0 ? false : lhRest.length === opts.lighthousePaths.length ? "all" : lhRest;
  reasons.push(lighthouse ? `Lighthouse: ${lighthouse === "all" ? "every URL" : lhRest.join(", ")}` : "Lighthouse: the PR run ran every URL");

  return { full: false, e2e, e2eTests: [], e2eShards, perf, perfShards, lighthouse, classes: {}, reasons, source };
}

export interface GreenRun {
  id: number;
  html_url: string;
  event: string;
  head_repository: { full_name: string } | null;
}

export interface SourceDeps {
  /** GET /repos/{repo}/commits/{sha}/pulls */
  pullsFor(sha: string): Promise<MergedPr[]>;
  /** GET /repos/{repo}/pulls/{n} */
  pull(n: number): Promise<MergedPr>;
  treeOf(sha: string): Promise<string>;
  /** Successful ci.yml runs on a head sha, newest first. */
  greenRuns(headSha: string): Promise<GreenRun[]>;
  /** The run's `ci-plan` record, or null when it has none. */
  record(runId: number): Promise<PlanRecord | null>;
}

export type SourceResult = { ok: true; source: Source; record: PlanRecord } | { ok: false; why: string };

/**
 * The merged pull request of `sha` (or pull request `prNumber`, for a measuring dispatch), its head on the same
 * tree, its newest green same-repository `pull_request` CI run and that run's record.
 */
export async function findSource(repo: string, sha: string, prNumber: number | null, deps: SourceDeps): Promise<SourceResult> {
  const pr = prNumber !== null ? await deps.pull(prNumber) : mergedPrFor(sha, await deps.pullsFor(sha), repo);
  if (!pr || pr.head.repo?.full_name !== repo) return { ok: false, why: prNumber !== null ? `#${prNumber} is not a pull request from this repository` : "no pull request from this repository was merged as this commit" };
  const [tree, prTree] = await Promise.all([deps.treeOf(sha), deps.treeOf(pr.head.sha)]);
  if (tree !== prTree) return { ok: false, why: `#${pr.number} was not up to date with main (its head tree differs)` };
  const run = (await deps.greenRuns(pr.head.sha)).find((r) => r.event === "pull_request" && r.head_repository?.full_name === repo);
  if (!run) return { ok: false, why: `no green CI run on #${pr.number}'s head ${pr.head.sha.slice(0, 7)}` };
  const record = await deps.record(run.id);
  if (!record) return { ok: false, why: `CI run ${run.html_url} has no readable ${PLAN_ARTIFACT} artifact` };
  return { ok: true, source: { run: run.id, pr: pr.number, url: run.html_url }, record };
}
```

  In `scripts/ci-plan.ts`: add `source?: Source;` (type import from `./ci-complement`) to `CiPlan` with the doc
  comment "A complement run: the green PR run on the same tree that covered the rest."; in `planOutputs` set
  `full: String(plan.full || plan.source !== undefined || (...existing...))` and add
  `source_run: plan.source ? String(plan.source.run) : ""`; add `ci-complement` to the `ci` regex in `CLASSES`
  (`scripts\/(ci-plan|ci-complement|e2e-plan|...)`).
- [x] **Step 4: Run** `bunx vitest run tests/unit/ci-complement.test.ts tests/unit/ci-plan.test.ts tests/unit/e2e-plan.test.ts`: pass.
- [x] **Step 5: Commit** `feat(ci): plan the complement of a green same-tree PR run`.

### Task 3: Wire the lookup and the record into `scripts/ci-plan.ts` `main()`

**Files:**
- Modify: `scripts/ci-plan.ts` (`main()`, the summary title, the planner-failure catch)
- Test: run the planner locally against the real API (no unit test: I/O only, the logic is in Task 2)

**Interfaces:**
- Consumes: `findSource`, `complementPlan`, `recordFor`, `parseRecord`, `PLAN_ARTIFACT`, `PLAN_FILE`, `SourceDeps`.
- Produces: env `SHA` (the run's commit) and `COMPLEMENT_PR` (dispatch input) read by `main()`; `ci-plan.json` in
  the working directory on every run, including the planner-failure path.

- [x] **Step 1: Implement** in `main()`:
  - `const { EVENT, REPO, PR, GH_TOKEN, SHA, COMPLEMENT_PR } = process.env;`
  - When `EVENT === "push"`, or `COMPLEMENT_PR` is a positive integer and the event is not `pull_request`, and
    `REPO`, `SHA`, `GH_TOKEN` are set: `findSource(REPO, SHA, COMPLEMENT_PR ? Number(COMPLEMENT_PR) : null, apiDeps(REPO, GH_TOKEN))`,
    errors caught into `{ ok: false, why }`. On ok: `complementPlan(record, source, { lighthousePaths: Object.keys(LIGHTHOUSE_PAGES), durations: file.e2e, perfDurations: file.perf })`.
    Otherwise the existing `planFor(...)` and `plan.reasons.unshift(\`full run: ${why}\`)`.
  - `apiDeps` uses `fetch` with `apiHeaders(token)` and `AbortSignal.timeout(20_000)` for `commits/{sha}/pulls`,
    `pulls/{n}`, `commits/{sha}` (tree) and `actions/workflows/ci.yml/runs?head_sha=...&status=success&per_page=20`;
    `record(runId)` runs `gh run download <id> --repo <repo> --name ci-plan --dir <mkdtemp>` with `Bun.spawnSync`
    and returns `parseRecord` of `ci-plan.json`, or null on a non-zero exit or a missing file.
  - After `planOutputs`, `writeFileSync(PLAN_FILE, JSON.stringify(recordFor(plan, outputs)))`; the failure catch
    writes the record of its full plan too.
  - Summary title: `complement run` when `plan.source`, else the existing full or selective text.
- [x] **Step 2: Verify locally** against the real API (read-only):

```bash
EVENT=push REPO=ShinyQ/ShinyQ-HQ SHA=b3780ab2b... GH_TOKEN=$(gh auth token) bun scripts/ci-plan.ts
```

  Expected: a full run with the reason "CI run ... has no readable ci-plan artifact" (older runs carry none), and
  `ci-plan.json` written with `"e2e":"all"`. With `EVENT=pull_request PR=210` it plans as before.
- [x] **Step 3: Run** `bun run typecheck && bunx vitest run tests/unit/ci-*.test.ts`: pass.
- [x] **Step 4: Commit** `feat(ci): Plan CI reads the merged PR's record on a push to main`.

### Task 4: `ci.yml` wiring

**Files:**
- Modify: `.github/workflows/ci.yml`

- [x] **Step 1:** `workflow_dispatch.inputs.complement_pr` (string, default empty, description "Plan the complement
  of this pull request's green CI run on the same tree, as a push to main does (measurement)").
- [x] **Step 2:** `changes` job: `actions: read` permission; output `source_run`; plan step env
  `SHA: ${{ github.sha }}` and `COMPLEMENT_PR: ${{ inputs.complement_pr }}`; then upload `ci-plan.json` as the
  `ci-plan` artifact (`if: ${{ !cancelled() }}`, `retention-days: 30`, `if-no-files-found: warn`).
- [x] **Step 3:** `lighthouse` job, after `Run Lighthouse CI` and before the baseline: step `The PR run's reports
  (complement run)` when `!cancelled() && needs.changes.outputs.source_run != ''`, with `GH_TOKEN`, `REPO`,
  `RUN: ${{ needs.changes.outputs.source_run }}`:

```bash
mkdir -p .lighthouseci
if gh run download "$RUN" --repo "$REPO" --name lighthouse-reports --dir source-lhci; then
  find source-lhci -maxdepth 1 -name 'lhr-*' -exec cp -n {} .lighthouseci/ \;
  echo "Merged the Lighthouse reports of CI run $RUN."
else
  echo "::notice::CI run $RUN has no lighthouse-reports artifact; the baseline covers only this run's URLs."
fi
```

  The upload condition becomes `always() && (needs.changes.outputs.lighthouse != 'false' || needs.changes.outputs.source_run != '')`.
- [x] **Step 4:** `build` job: before `actions/download-artifact` of `perf-report-*`, step `The PR run's perf
  report (complement run)` when `needs.changes.outputs.source_run != ''`:

```bash
if gh run download "$RUN" --repo "$REPO" --name perf-report --dir perf-report; then
  echo "Merged the perf report of CI run $RUN."
else
  echo "::notice::CI run $RUN has no perf-report artifact (it ran no perf gate)."
fi
```

  The baseline, summary and `perf-report` upload conditions become
  `needs.changes.outputs.perf != 'false' || needs.changes.outputs.source_run != ''` (the shard download keeps
  `perf != 'false'`). `ci-full.txt` gets a second line `complement of CI run <id>` when `source_run` is set.
- [x] **Step 5:** Header comment: pushes to `main` run the complement; dispatches and the nightly stay full.
- [x] **Step 6: Validate** `bunx --bun actionlint` if present, else `bun -e` YAML parse; `bunx vitest run tests/unit/build-facts.test.ts`.
- [x] **Step 7: Commit** `ci: a push to main runs the complement of its PR run`.

### Task 5: Docs

**Files:**
- Modify: `docs/agents/ci-and-deploy.md` (Jobs, a new "Complement runs on main" section, Full runs and the nightly,
  Production deploy fallback and rollback notes), `docs/agents/performance.md` (line 119 and the baselines),
  `docs/decisions.md` (dated row), `AGENTS.md` (Smart CI bullet), `README.md` (CI bullet), `scripts/ci-status.ts`
  doc comment, `.github/workflows/deploy.yml` header, `docs/deploy.md` (complete run wording),
  `docs/superpowers/README.md` (row, counts).
- [x] **Step 1:** Write them (current state only; the before numbers go into decisions.md and this plan).
- [x] **Step 2: Run** `bun run verify:quick`: pass (the em dash scan, AGENTS.md size and docs tests included).
- [x] **Step 3: Commit** `docs: main CI runs the complement of the merged PR`.

### Task 6: Measure and ship (after #213 merged and no CI in flight)

- [ ] **Step 1:** Push the branch, open PR 1 (ready for review). Its own CI is a full run (CI files).
- [ ] **Step 2:** Measurement: branch `measure/complement` off PR 1 with a one-line comment in `src/ask/protocol.ts`;
  open a throwaway PR, let its selective CI pass, then
  `gh workflow run ci.yml --ref measure/complement -f complement_pr=<n>` and record the dispatch run's wall time
  and runner-minutes (`gh run view <id> --json jobs`). Close the PR, delete the branch.
- [ ] **Step 3:** Merge PR 1 when every required check is green; record the merge sha and the main run numbers.

---

## Part 2 (PR 2): narrower PR perf selection

**Design:** today any `src/` file in the 3D roots' import closure gets the perf keys of an unmatched 3D file
(`ALL_BUT_MEMORY`: every floor and every ride). Instead, a shared file gets the union of `perfKeysFor([f])` over the
3D files `f` that import it directly or through a chain of non-3D files (reverse import edges, stopping at 3D
files). That is exactly the selection an edit of those importers would get: content modules imported only by the
Lobby get the Lobby keys, a module the HUD imports gets the HUD keys (bytes), a module `Experience.tsx` imports gets
everything. Unknown 3D importers fall back to `ALL_BUT_MEMORY` through `perfKeysFor` as today.

### Task 7: `importers` map and `sharedPerfKeys` in `scripts/ci-plan.ts`

**Files:** Modify `scripts/ci-plan.ts` (`reverseImports(roots, read)`, `sharedPerfKeys(file, ...)`, `planFor`'s
`in3d` callback becomes `perf3d: (file) => PerfKey[]`), `scripts/perf-plan.ts` (export a `bytes`, `boot` pair for
`src/ask/` if the HUD rule alone misses boot), Test `tests/unit/ci-plan.test.ts`.

- [ ] Failing tests with an in-memory repo: a module imported only by `src/experience/floors/lobby/X.tsx` maps to
  `["boot", "bytes", "floor:L1", "hover"]`; one imported by `src/hud/A.tsx` through `src/lib/b.ts` maps to
  `["bytes"]`; one imported by `src/experience/Experience.tsx` maps to every key; one imported by an unmatched 3D
  file maps to `ALL_BUT_MEMORY`. Real-repo tests: `src/content/certs.ts` selects `floor:L1` and no other floor;
  `src/ask/client.ts` and `src/ask/protocol.ts` select no floor and no ride.
- [ ] Implement, run `bunx vitest run tests/unit/ci-plan.test.ts`, commit `feat(ci): perf keys of the 3D files that import a shared module`.
- [ ] Docs (`ci-and-deploy.md` perf bullet, decisions row), measure with a throwaway PR touching
  `src/ask/protocol.ts` (before: 2 perf shards 9 to 11 min; target PR wall 7 to 9 min), merge.

## Part 3 (PR 3): Lighthouse on affected URLs, two runs in flight

**Design:** in `pagesFromRepo`, a file in the layouts' static closure moves every URL only when it is a layout,
a stylesheet, a font or message file or a build script (they change what each page ships differently); any other
layout-closure module lands in a chunk every page loads the same way, so the home page (`/en`) measures it. Every
selective PR adds `/en` to its Lighthouse list. `lighthouserc.json` is a `ci` file, so budget changes stay full
runs. The main complement then runs the URLs the PR skipped.

### Task 8: Lighthouse selection

**Files:** Modify `scripts/ci-plan.ts` (`pagesFromRepo`, `planFor` adds `/en`), Test `tests/unit/ci-plan.test.ts`.

- [ ] Failing tests: `src/ask/client.ts` (layout closure, not a layout or CSS) maps to `["/en"]`; `src/app/globals.css`
  and `src/app/[locale]/layout.tsx` map to `"all"`; a page-only file maps to its page plus `/en`.
- [ ] Implement, test, commit `feat(ci): Lighthouse runs the affected URLs plus the home page on pull requests`.

### Task 9: Two CI runs in flight

- [ ] Measure the peak concurrent jobs of a main complement run and a typical PR run (`gh run view --json jobs`,
  overlapping `startedAt` to `completedAt`). The Free plan allows 20 concurrent jobs. If main peak plus PR peak is
  at most 20, change "One CI run at a time" in `AGENTS.md` and `docs/agents/ci-and-deploy.md` to "at most 2 CI
  runs in flight", with the numbers in `docs/decisions.md`; else keep the rule and record why.
- [ ] Measure with a throwaway PR, merge, report.
