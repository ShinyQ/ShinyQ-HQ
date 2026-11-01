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
    if (rest.length === 0) reasons.push("e2e: the PR run ran every spec whole");
    else if (rest.length === ALL_SPECS.length) {
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
  /** Waits between merged pull request lookups (default a timer; tests pass a no-op). */
  sleep?(ms: number): Promise<void>;
}

/**
 * GitHub links a merge commit to its pull request a few seconds after the push: Plan CI once asked 2 s after it, found
 * none and ran everything (owner decision 2026-11-01). Ask again every 5 s for about 30 s while no pull request names
 * the commit as its merge.
 */
export const PR_LOOKUP_RETRIES = 6;
export const PR_LOOKUP_DELAY_MS = 5_000;

export type SourceResult = { ok: true; source: Source; record: PlanRecord } | { ok: false; why: string };

/**
 * The merged pull request of `sha` (or pull request `prNumber`, for a measuring dispatch), its head on the same
 * tree, its newest green same-repository `pull_request` CI run and that run's record.
 */
export async function findSource(repo: string, sha: string, prNumber: number | null, deps: SourceDeps): Promise<SourceResult> {
  let pr: MergedPr | undefined;
  if (prNumber !== null) pr = await deps.pull(prNumber);
  else {
    const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
    for (let attempt = 0; ; attempt++) {
      const prs = await deps.pullsFor(sha);
      pr = mergedPrFor(sha, prs, repo);
      // A merge GitHub already linked (a fork's included) or the last try: decide now.
      if (pr || prs.some((p) => p.merge_commit_sha === sha) || attempt >= PR_LOOKUP_RETRIES) break;
      await sleep(PR_LOOKUP_DELAY_MS);
    }
  }
  if (!pr || pr.head.repo?.full_name !== repo) return { ok: false, why: prNumber !== null ? `#${prNumber} is not a pull request from this repository` : "no pull request from this repository was merged as this commit" };
  const [tree, prTree] = await Promise.all([deps.treeOf(sha), deps.treeOf(pr.head.sha)]);
  if (tree !== prTree) return { ok: false, why: `#${pr.number} was not up to date with main (its head tree differs)` };
  const run = (await deps.greenRuns(pr.head.sha)).find((r) => r.event === "pull_request" && r.head_repository?.full_name === repo);
  if (!run) return { ok: false, why: `no green CI run on #${pr.number}'s head ${pr.head.sha.slice(0, 7)}` };
  const record = await deps.record(run.id);
  if (!record) return { ok: false, why: `CI run ${run.html_url} has no readable ${PLAN_ARTIFACT} artifact` };
  return { ok: true, source: { run: run.id, pr: pr.number, url: run.html_url }, record };
}
