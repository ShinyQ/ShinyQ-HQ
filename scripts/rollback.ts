/**
 * Automatic production rollback (rollback.yml, owner decision 2026-10-18). Merges deploy before main CI
 * finishes (scripts/merge-gate.ts); when that main CI then fails, this puts the last good deployment back.
 *
 *   bun scripts/rollback.ts pages --repo o/r --sha <failing commit> --project <pages project> [--site URL] [--dry-run true] [--out result.json]
 *   bun scripts/rollback.ts issue --repo o/r --sha <failing commit> --run-url <CI run> --result result.json [--dry-run true]
 *   bun scripts/rollback.ts clear --repo o/r --sha <green commit> --run-url <CI run>
 *
 * `pages` (needs CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, GH_TOKEN) waits up to 10 minutes while a deploy.yml
 * upload is in flight, then reads what is live (the project's canonical deployment). It rolls back only when the
 * live commit is the failing commit, or a later commit built on it whose own CI is not green. The target is the
 * newest earlier successful production deployment whose commit is a strict ancestor of the failing commit and whose
 * own `Build, CV and e2e` is not red; no state is stored, the Cloudflare and GitHub APIs are the record. It calls the
 * Pages rollback API (POST .../deployments/{id}/rollback), waits until the target is live and /en answers 200.
 * `--dry-run true` does everything except the rollback call. Writes `action`, `target_sha`, `live_sha` to
 * $GITHUB_OUTPUT and the result JSON to --out. Exits 1 when a rollback is needed but impossible.
 * `issue` opens or updates the one `deploy-rollback` issue (it blocks the fast path until main is green again);
 * with `--dry-run true` it only prints the comment. `clear` closes that issue once a green main CI ran on the last
 * failing commit or a later one. Uses fetch only; no dependencies.
 */
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { checkRuns, completeChecks, gh, verdictFromChecks } from "./ci-status";
import { ROLLBACK_LABEL } from "./merge-gate";

export interface PagesDeployment {
  id: string;
  environment: string;
  created_on: string;
  url?: string;
  latest_stage: { name: string; status: string } | null;
  deployment_trigger: { metadata?: { commit_hash?: string | null } | null } | null;
}

/** GitHub compare status of `failing...live`: identical, ahead (live built on failing), behind or diverged. */
export type Relation = "identical" | "ahead" | "behind" | "diverged";

export interface RollbackResult {
  action: "rollback" | "dry-run" | "none" | "stuck";
  note: string;
  live?: { id: string; commit: string | null };
  target?: { id: string; commit: string; url?: string };
  dryRun: boolean;
}

export const commitOf = (d: PagesDeployment): string | null => d.deployment_trigger?.metadata?.commit_hash ?? null;

export function needsRollback({ relation, liveGreen }: { relation: Relation; liveGreen: boolean }): boolean {
  return (relation === "identical" || relation === "ahead") && !liveGreen;
}

export async function pickTarget(
  deployments: readonly PagesDeployment[],
  live: PagesDeployment,
  probes: { isStrictAncestor: (commit: string) => Promise<boolean>; isRed: (commit: string) => Promise<boolean> },
): Promise<PagesDeployment | undefined> {
  const before = Date.parse(live.created_on);
  const candidates = deployments
    .filter((d) => d.id !== live.id && d.environment === "production" && d.latest_stage?.status === "success" && commitOf(d) && Date.parse(d.created_on) < before)
    .sort((a, b) => Date.parse(b.created_on) - Date.parse(a.created_on));
  for (const d of candidates) {
    const commit = commitOf(d) as string;
    if ((await probes.isStrictAncestor(commit)) && !(await probes.isRed(commit))) return d;
  }
  return undefined;
}

const MARKER = /<!-- failing-sha: ([0-9a-f]{7,40}) -->/;

export function failingShaFrom(body: string | null | undefined): string | undefined {
  return MARKER.exec(body ?? "")?.[1];
}

export function withFailingSha(body: string, sha: string): string {
  return MARKER.test(body) ? body.replace(MARKER, `<!-- failing-sha: ${sha} -->`) : `${body}\n\n<!-- failing-sha: ${sha} -->`;
}

export function issueBody(sha: string): string {
  return [
    "CI failed on `main` after a merge. While this issue is open, merges do not take the fast path: `deploy.yml` waits for a green complete CI on `main` before it deploys (scripts/merge-gate.ts).",
    "",
    "When production served the failing commit, `rollback.yml` rolled Cloudflare Pages back to the last good deployment (comments below). The issue closes by itself once CI on `main` is green on the failing commit or a later one.",
    "",
    "Manual rollback and recovery: docs/deploy.md section 6.",
    "",
    `<!-- failing-sha: ${sha} -->`,
  ].join("\n");
}

export function resultComment({ sha, runUrl, result }: { sha: string; runUrl: string; result: RollbackResult }): string {
  const lines = [`CI failed on \`main\` at \`${sha.slice(0, 7)}\`: ${runUrl}`, ""];
  const live = result.live ? `\`${result.live.id}\` (commit \`${(result.live.commit ?? "unknown").slice(0, 7)}\`)` : "unknown";
  const target = result.target ? `\`${result.target.id}\` (commit \`${result.target.commit.slice(0, 7)}\`)` : "none";
  if (result.action === "rollback") lines.push(`Rolled production back from ${live} to ${target}.`);
  else if (result.action === "dry-run") lines.push(`Dry run: would roll production back from ${live} to ${target}.`);
  else if (result.action === "stuck") lines.push(`Production serves ${live}, which contains the failure, but no earlier good deployment was found. Roll back by hand (docs/deploy.md section 6).`);
  else lines.push(`No rollback: ${result.note}`);
  return lines.join("\n");
}

async function cf<T>(method: string, path: string, token: string): Promise<T> {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } });
  const json = (await response.json().catch(() => ({}))) as { success?: boolean; result: T; errors?: { message: string }[] };
  if (!response.ok || !json.success) throw new Error(`Cloudflare ${method} ${path}: HTTP ${response.status} ${(json.errors ?? []).map((e) => e.message).join("; ")}`);
  return json.result;
}

async function ghWrite<T>(method: string, path: string, token: string, body: unknown): Promise<T> {
  const response = await fetch(`https://api.github.com${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`GitHub API ${method} ${path}: HTTP ${response.status}`);
  return (await response.json()) as T;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const relationOf = (repo: string, base: string, head: string, token: string) => gh<{ status: Relation }>(`/repos/${repo}/compare/${base}...${head}`, token).then((c) => c.status);

/** A deploy.yml upload in flight could make its commit live right after this reads production. */
async function uploadInFlight(repo: string, token: string): Promise<boolean> {
  const { workflow_runs } = await gh<{ workflow_runs: { id: number }[] }>(`/repos/${repo}/actions/workflows/deploy.yml/runs?status=in_progress&per_page=10`, token);
  for (const run of workflow_runs) {
    const { jobs } = await gh<{ jobs: { name: string; status: string }[] }>(`/repos/${repo}/actions/runs/${run.id}/jobs?per_page=50`, token);
    if (jobs.some((j) => j.name === "Cloudflare Pages production" && j.status === "in_progress")) return true;
  }
  return false;
}

async function pages(flag: (name: string) => string | undefined): Promise<RollbackResult> {
  const repo = flag("--repo") ?? process.env.GITHUB_REPOSITORY;
  const sha = flag("--sha");
  const project = flag("--project") ?? process.env.CF_PAGES_PROJECT;
  const site = flag("--site");
  const dryRun = flag("--dry-run") === "true";
  const ghToken = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
  const cfToken = process.env.CLOUDFLARE_API_TOKEN;
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!repo || !sha || !project || !ghToken || !cfToken || !account) throw new Error("usage: GH_TOKEN, CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID; bun scripts/rollback.ts pages --repo o/r --sha <sha> --project <name>");
  const base = `/accounts/${account}/pages/projects/${project}`;

  const until = Date.now() + Number(flag("--wait-minutes") ?? 10) * 60_000;
  while ((await uploadInFlight(repo, ghToken)) && Date.now() < until) {
    console.log("A production upload is in flight; waiting for it before reading what is live.");
    await sleep(20_000);
  }

  const { canonical_deployment: live } = await cf<{ canonical_deployment: PagesDeployment | null }>("GET", base, cfToken);
  if (!live) return { action: "none", note: `project ${project} has no production deployment.`, dryRun };
  const liveCommit = commitOf(live);
  const summary = { id: live.id, commit: liveCommit };
  if (!liveCommit) return { action: "none", note: `the live deployment ${live.id} has no commit hash; check it by hand.`, live: summary, dryRun };
  const relation = await relationOf(repo, sha, liveCommit, ghToken).catch((): Relation => "diverged");
  let liveGreen = false;
  if (relation === "ahead") {
    const checks = await checkRuns(repo, liveCommit, ghToken);
    const full = await completeChecks(repo, checks, ghToken);
    liveGreen = verdictFromChecks(checks, (c) => full.has(c.html_url)).kind === "reuse";
  }
  if (!needsRollback({ relation, liveGreen })) {
    const why = liveGreen ? `the live commit ${liveCommit.slice(0, 7)} is built on it and its own CI is green.` : `production serves ${liveCommit.slice(0, 7)}, which does not contain ${sha.slice(0, 7)} (${relation}).`;
    return { action: "none", note: why, live: summary, dryRun };
  }

  const deployments: PagesDeployment[] = [];
  for (let page = 1; page <= 4; page++) {
    const batch = await cf<PagesDeployment[]>("GET", `${base}/deployments?env=production&per_page=25&page=${page}`, cfToken);
    deployments.push(...batch);
    if (batch.length < 25) break;
  }
  const red = new Map<string, boolean>();
  const target = await pickTarget(deployments, live, {
    isStrictAncestor: async (commit) => (await relationOf(repo, commit, sha, ghToken).catch(() => "diverged")) === "ahead",
    isRed: async (commit) => {
      if (!red.has(commit)) red.set(commit, verdictFromChecks(await checkRuns(repo, commit, ghToken)).kind === "red");
      return red.get(commit) as boolean;
    },
  });
  if (!target) return { action: "stuck", note: "no earlier good production deployment found.", live: summary, dryRun };
  const chosen = { id: target.id, commit: commitOf(target) as string, url: target.url };
  if (dryRun) return { action: "dry-run", note: `would roll back to ${target.id}.`, live: summary, target: chosen, dryRun };

  await cf("POST", `${base}/deployments/${target.id}/rollback`, cfToken);
  const deadline = Date.now() + 3 * 60_000;
  for (;;) {
    const now = await cf<{ canonical_deployment: PagesDeployment | null }>("GET", base, cfToken);
    const answers = site ? await fetch(`${site.replace(/\/$/, "")}/en`, { redirect: "follow" }).then((r) => r.status === 200).catch(() => false) : true;
    if (now.canonical_deployment?.id === target.id && answers) break;
    if (Date.now() > deadline) throw new Error(`rolled back to ${target.id}, but production did not settle (live ${now.canonical_deployment?.id}, /en ok ${answers}).`);
    await sleep(10_000);
  }
  return { action: "rollback", note: `rolled back to ${target.id}.`, live: summary, target: chosen, dryRun };
}

async function openIssue(repo: string, token: string): Promise<{ number: number; body: string | null } | undefined> {
  const issues = await gh<{ number: number; body: string | null; pull_request?: unknown }[]>(`/repos/${repo}/issues?labels=${ROLLBACK_LABEL}&state=open&per_page=5`, token);
  return issues.find((i) => !i.pull_request);
}

async function issue(flag: (name: string) => string | undefined) {
  const repo = flag("--repo") ?? process.env.GITHUB_REPOSITORY;
  const sha = flag("--sha");
  const runUrl = flag("--run-url") ?? "";
  const resultFile = flag("--result");
  const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
  if (!repo || !sha || !token) throw new Error("usage: GH_TOKEN=... bun scripts/rollback.ts issue --repo o/r --sha <sha> --run-url <url> --result <file>");
  let result: RollbackResult = { action: "stuck", note: "the rollback step did not report; check production by hand.", dryRun: flag("--dry-run") === "true" };
  try {
    if (resultFile) result = JSON.parse(readFileSync(resultFile, "utf8")) as RollbackResult;
  } catch {
    // Keep the "did not report" result: the rollback step failed before writing it.
  }
  const comment = resultComment({ sha, runUrl, result });
  if (flag("--dry-run") === "true") return console.log(`Dry run, no issue written. Comment:\n${comment}`);
  await ghWrite("POST", `/repos/${repo}/labels`, token, { name: ROLLBACK_LABEL, color: "B60205", description: "Main CI failed after a fast-path deploy; fast path blocked (rollback.yml)" }).catch(() => undefined);
  const open = await openIssue(repo, token);
  if (open) {
    await ghWrite("PATCH", `/repos/${repo}/issues/${open.number}`, token, { body: withFailingSha(open.body ?? issueBody(sha), sha) });
    await ghWrite("POST", `/repos/${repo}/issues/${open.number}/comments`, token, { body: comment });
    console.log(`Updated #${open.number}.`);
  } else {
    const created = await ghWrite<{ number: number }>("POST", `/repos/${repo}/issues`, token, { title: "Main CI failed: fast-path deploys blocked", labels: [ROLLBACK_LABEL], body: issueBody(sha) });
    await ghWrite("POST", `/repos/${repo}/issues/${created.number}/comments`, token, { body: comment });
    console.log(`Opened #${created.number}.`);
  }
}

async function clear(flag: (name: string) => string | undefined) {
  const repo = flag("--repo") ?? process.env.GITHUB_REPOSITORY;
  const sha = flag("--sha");
  const runUrl = flag("--run-url") ?? "";
  const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
  if (!repo || !sha || !token) throw new Error("usage: GH_TOKEN=... bun scripts/rollback.ts clear --repo o/r --sha <sha> --run-url <url>");
  const open = await openIssue(repo, token);
  if (!open) return console.log(`No open ${ROLLBACK_LABEL} issue.`);
  const failing = failingShaFrom(open.body);
  const relation = failing ? await relationOf(repo, failing, sha, token).catch(() => "diverged") : "ahead";
  if (relation !== "identical" && relation !== "ahead") return console.log(`#${open.number} stays open: ${sha.slice(0, 7)} does not contain the failing ${failing?.slice(0, 7)} (${relation}).`);
  await ghWrite("POST", `/repos/${repo}/issues/${open.number}/comments`, token, { body: `CI is green on \`main\` at \`${sha.slice(0, 7)}\`: ${runUrl}\n\nThe fast path is open again.` });
  await ghWrite("PATCH", `/repos/${repo}/issues/${open.number}`, token, { state: "closed", state_reason: "completed" });
  console.log(`Closed #${open.number}.`);
}

function report(result: RollbackResult, out: string | undefined) {
  console.log(`${result.action}: ${result.note}`);
  if (out) writeFileSync(out, JSON.stringify(result, null, 2));
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `action=${result.action}\ntarget_sha=${result.target?.commit ?? ""}\nlive_sha=${result.live?.commit ?? ""}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    const target = result.target ? ` Target: \`${result.target.id}\` (commit \`${result.target.commit.slice(0, 7)}\`).` : "";
    const live = result.live ? ` Live before: \`${result.live.id}\` (commit \`${(result.live.commit ?? "unknown").slice(0, 7)}\`).` : "";
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `- Rollback (${result.action}${result.dryRun ? ", dry run" : ""}): ${result.note}${live}${target}\n`);
  }
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const flag = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  if (command === "pages") {
    const result = await pages(flag);
    report(result, flag("--out"));
    if (result.action === "stuck") process.exit(1);
  } else if (command === "issue") await issue(flag);
  else if (command === "clear") await clear(flag);
  else throw new Error("usage: bun scripts/rollback.ts pages|issue|clear ...");
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
