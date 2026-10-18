/**
 * Deploy gate (deploy.yml, owner decision 2026-10-13): reuse the CI result for a commit instead of
 * rerunning e2e.
 *
 *   bun scripts/ci-status.ts --repo owner/name --sha <sha> [--wait-minutes 40] [--grace-minutes 3] [--force-rerun true]
 *
 * Writes `reuse=true|false` to $GITHUB_OUTPUT and one line to the job summary.
 * A green CI run is reused only when it is complete: it carries the `ci-full` artifact, uploaded by the
 * aggregate job when the run ran every e2e shard, the perf gates and Lighthouse (dispatches and
 * schedules always do). A push to main that ran only the complement of its merged PR's green same-tree
 * run (owner decision 2026-10-18, scripts/ci-complement.ts) carries it too, with a second line
 * `complement of CI run <id>`: together with that PR run it covered every e2e spec, perf gate and
 * Lighthouse URL, so this gate treats it like any complete run. A green selective PR run is never
 * reused, even on the same tree; older runs without the marker are not reused either (the deploy then
 * runs the e2e shards itself).
 * A red CI on the commit fails the deploy, marker or not.
 * - reuse=true: CI's aggregate check `Build, CV and e2e` passed on this commit in a complete run, or a
 *   successful complete CI run from a push to main or a same-repository pull request tested a commit
 *   with the same tree. The weekly facts merge (a GITHUB_TOKEN merge starts no push CI on main) finds
 *   none: its PR was tested by a workflow_dispatch run, which is never reused by tree.
 * - reuse=false: no complete CI result for this commit or its tree after the grace period, or
 *   --force-rerun true: the deploy runs the e2e shards itself.
 * While a CI run on the sha is unfinished (its aggregate check does not exist yet), it waits.
 * Exits 1 when CI failed on the commit (complete or selective run), or still runs after --wait-minutes.
 * Uses fetch and GH_TOKEN only (checks: read, actions: read, contents: read); no dependencies.
 */
import { appendFileSync } from "node:fs";

export const CI_CHECK = "Build, CV and e2e";
export const CI_WORKFLOW = "ci.yml";
/**
 * Artifact the aggregate CI job uploads only when the run (with its source PR run, for a complement run)
 * ran every heavy job (.github/workflows/ci.yml).
 */
export const CI_FULL_ARTIFACT = "ci-full";

export interface CheckRun {
  name: string;
  status: string;
  conclusion: string | null;
  html_url: string;
}

export type Verdict = { kind: "reuse"; url: string } | { kind: "wait" } | { kind: "red"; url: string; conclusion: string } | { kind: "missing" };

/** Cancelled or skipped runs (a superseded push, a manual cancel) say nothing about the commit. */
const NO_RESULT = new Set(["cancelled", "skipped", "neutral", "stale"]);

const isCi = (r: CheckRun) => r.name === CI_CHECK && !(r.status === "completed" && NO_RESULT.has(r.conclusion ?? ""));

const isGreen = (r: CheckRun) => r.status === "completed" && r.conclusion === "success";

/**
 * `complete` says whether a green check belongs to a complete CI run (the `ci-full` marker); green checks
 * of selective runs are ignored. A finished red check means red whether or not its run has the marker, and
 * unfinished checks still mean wait (the marker is uploaded inside the aggregate job, before it finishes).
 * A green complete check wins over a red one (a rerun after a flake).
 */
export function verdictFromChecks(runs: readonly CheckRun[], complete: (check: CheckRun) => boolean = () => true): Verdict {
  const mine = runs.filter(isCi);
  const green = mine.find((r) => isGreen(r) && complete(r));
  if (green) return { kind: "reuse", url: green.html_url };
  if (mine.some((r) => r.status !== "completed")) return { kind: "wait" };
  const red = mine.find((r) => !isGreen(r));
  return red ? { kind: "red", url: red.html_url, conclusion: red.conclusion ?? "unknown" } : { kind: "missing" };
}

/** The workflow run id in an Actions check URL (`.../actions/runs/<run_id>/job/<job_id>`), or null. */
export function runIdFromUrl(url: string): number | null {
  const match = /\/actions\/runs\/(\d+)(?:[/?#]|$)/.exec(url);
  return match ? Number(match[1]) : null;
}

export interface TestedRun {
  head_sha: string;
  tree: string;
  html_url: string;
}

export function sameTreeRun(tree: string, runs: readonly TestedRun[]): TestedRun | undefined {
  return runs.find((r) => r.tree === tree);
}

/** The aggregate check only exists once its job starts, so a CI run still busy on the sha means wait. */
export function ciRunning(runs: readonly { status: string }[]): boolean {
  return runs.some((r) => r.status !== "completed");
}

export async function gh<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
  });
  if (!response.ok) throw new Error(`GitHub API ${path}: HTTP ${response.status}`);
  return (await response.json()) as T;
}

const markers = new Map<number, true>();

/**
 * Whether CI run `runId` uploaded the `ci-full` marker (expired artifacts still count). Only `true` is
 * memoized, so a rerun that uploads the marker later is seen on the next poll; an API error means no.
 */
async function hasFullMarker(repo: string, runId: number, token: string): Promise<boolean> {
  if (markers.get(runId)) return true;
  try {
    const { total_count } = await gh<{ total_count: number }>(`/repos/${repo}/actions/runs/${runId}/artifacts?name=${CI_FULL_ARTIFACT}&per_page=1`, token);
    const full = total_count > 0;
    if (full) markers.set(runId, true);
    return full;
  } catch (error) {
    console.warn(`::warning::could not read the ${CI_FULL_ARTIFACT} marker of CI run ${runId}: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

/** The html_urls of green CI checks that belong to a complete run (red checks need no marker: they fail the deploy). */
export async function completeChecks(repo: string, checks: readonly CheckRun[], token: string): Promise<Set<string>> {
  const urls = new Set<string>();
  for (const check of checks.filter((c) => isCi(c) && isGreen(c))) {
    const runId = runIdFromUrl(check.html_url);
    if (runId !== null && (await hasFullMarker(repo, runId, token))) urls.add(check.html_url);
  }
  return urls;
}

const treeOf = (repo: string, sha: string, token: string) => gh<{ commit: { tree: { sha: string } } }>(`/repos/${repo}/commits/${sha}`, token).then((c) => c.commit.tree.sha);

export async function checkRuns(repo: string, sha: string, token: string): Promise<CheckRun[]> {
  const { check_runs } = await gh<{ check_runs: CheckRun[] }>(`/repos/${repo}/commits/${sha}/check-runs?check_name=${encodeURIComponent(CI_CHECK)}&per_page=100`, token);
  return check_runs;
}

export async function ciRunsOn(repo: string, sha: string, token: string): Promise<{ status: string }[]> {
  const { workflow_runs } = await gh<{ workflow_runs: { status: string }[] }>(`/repos/${repo}/actions/workflows/${CI_WORKFLOW}/runs?head_sha=${sha}&per_page=20`, token);
  return workflow_runs;
}

export interface RunOrigin {
  event: string;
  head_branch: string | null;
  head_repository: { full_name: string } | null;
}

/** CI runs a deploy may reuse by tree: pushes to main and pull requests from this repository's own branches, never forks. */
export function trustedRun(run: RunOrigin, repo: string): boolean {
  if (run.head_repository?.full_name !== repo) return false;
  if (run.event === "push") return run.head_branch === "main";
  return run.event === "pull_request";
}

/** The newest successful complete CI run (trusted origin, `ci-full` marker) whose commit has the same tree as `sha`. */
async function runWithSameTree(repo: string, sha: string, token: string): Promise<TestedRun | undefined> {
  const tree = await treeOf(repo, sha, token);
  const { workflow_runs } = await gh<{ workflow_runs: (RunOrigin & { id: number; head_sha: string; html_url: string })[] }>(`/repos/${repo}/actions/workflows/${CI_WORKFLOW}/runs?status=success&per_page=30`, token);
  const tested: TestedRun[] = [];
  for (const run of workflow_runs.filter((r) => trustedRun(r, repo))) {
    const runTree = run.head_sha === sha ? tree : await treeOf(repo, run.head_sha, token).catch(() => "");
    if (runTree === tree && !(await hasFullMarker(repo, run.id, token))) continue;
    tested.push({ head_sha: run.head_sha, tree: runTree, html_url: run.html_url });
    if (runTree === tree) break;
  }
  return sameTreeRun(tree, tested);
}

function output(reuse: boolean, note: string) {
  console.log(note);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `reuse=${reuse}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `- E2E: ${note}\n`);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const args = process.argv.slice(2);
  const flag = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const repo = flag("--repo") ?? process.env.GITHUB_REPOSITORY;
  const sha = flag("--sha");
  const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
  if (!repo || !sha || !token) throw new Error("usage: GH_TOKEN=... bun scripts/ci-status.ts --repo owner/name --sha <sha>");
  if (flag("--force-rerun") === "true") return output(false, "rerun_e2e requested: the deploy runs the e2e shards.");
  const deadline = Date.now() + Number(flag("--wait-minutes") ?? 40) * 60_000;
  const graceUntil = Date.now() + Number(flag("--grace-minutes") ?? 3) * 60_000;
  for (;;) {
    const checks = await checkRuns(repo, sha, token);
    const full = await completeChecks(repo, checks, token);
    const verdict = verdictFromChecks(checks, (check) => full.has(check.html_url));
    if (verdict.kind === "reuse") return output(true, `reused complete CI on this commit (${verdict.url}).`);
    if (verdict.kind === "red") {
      console.error(`::error::CI ended with "${verdict.conclusion}" on ${sha} (${verdict.url}). Fix main, or rerun CI, before deploying.`);
      process.exit(1);
    }
    if (verdict.kind === "missing") {
      const same = await runWithSameTree(repo, sha, token);
      if (same) return output(true, `reused complete CI on ${same.head_sha.slice(0, 7)}, same tree (${same.html_url}).`);
      // A push CI can take a moment to register its run after the merge.
      if (!ciRunning(await ciRunsOn(repo, sha, token)) && Date.now() > graceUntil) return output(false, "no complete CI result for this commit or its tree: the deploy runs the e2e shards.");
    }
    if (Date.now() > deadline) {
      console.error(`::error::CI still runs on ${sha} after the wait; rerun the deploy when it finished.`);
      process.exit(1);
    }
    await sleep(30_000);
  }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
