/**
 * Fast-path deploy gate (deploy.yml on a push to main, owner decision 2026-10-18): deploy a merge at once,
 * without waiting for the push CI on main, when the merged pull request already proved the same code.
 *
 *   bun scripts/merge-gate.ts --repo owner/name --sha <merge commit> [--check-block-only true]
 *
 * Fast (writes `fast=true` and `pr=<number>` to $GITHUB_OUTPUT) only when all of these hold:
 * - no open issue labelled `deploy-rollback` (a red main CI rolled production back; scripts/rollback.ts);
 * - the commit is the merge commit of a pull request from this repository merged into main
 *   (GET /repos/{repo}/commits/{sha}/pulls);
 * - the PR head has the same tree as the merge commit (a squash of an up-to-date PR), so the checks ran on
 *   exactly the code that landed;
 * - every required status check of the main ruleset (GET /repos/{repo}/rules/branches/main) has a green
 *   newest attempt from GitHub Actions on the PR head. Selective smart CI runs count: the owner accepted
 *   that weaker guarantee, mitigated by the full main CI and the automatic rollback (rollback.yml).
 * Otherwise `fast=false`: the deploy waits for the complete main CI (scripts/ci-status.ts), as before.
 * `--check-block-only true` only checks the `deploy-rollback` label (the deploy job, right before upload) and
 * writes `blocked=true|false`; when blocked, the deploy job waits for the complete main CI instead. API errors mean
 * not fast (and blocked). Uses fetch and GH_TOKEN only; no dependencies.
 */
import { appendFileSync } from "node:fs";
import { gh } from "./ci-status";

export const REQUIRED_CHECKS = ["Typecheck, lint, unit tests", "Build, CV and e2e", "Lighthouse CI", "3D perf gates 1/2", "3D perf gates 2/2"] as const;
export const ROLLBACK_LABEL = "deploy-rollback";
const ACTIONS_APP = "github-actions";

export interface MergedPr {
  number: number;
  merged_at: string | null;
  merge_commit_sha: string | null;
  html_url: string;
  base: { ref: string };
  head: { sha: string; repo: { full_name: string } | null };
}

export interface GateCheckRun {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  app: { slug: string } | null;
}

export type ChecksVerdict = { ok: true } | { ok: false; missing: string[]; failed: string[] };

export type FastPath = { fast: true; pr: number; note: string } | { fast: false; note: string };

export function mergedPrFor(sha: string, prs: readonly MergedPr[], repo: string): MergedPr | undefined {
  return prs.find((p) => p.merged_at && p.base.ref === "main" && p.merge_commit_sha === sha && p.head.repo?.full_name === repo);
}

interface Rule {
  type: string;
  parameters?: { required_status_checks?: { context: string }[] };
}

export function requiredFromRules(rules: readonly Rule[]): string[] {
  const names = rules.filter((r) => r.type === "required_status_checks").flatMap((r) => r.parameters?.required_status_checks?.map((c) => c.context) ?? []);
  return names.length ? [...new Set(names)] : [...REQUIRED_CHECKS];
}

/** The newest GitHub Actions attempt of each required check must have completed green. */
export function checksVerdict(required: readonly string[], runs: readonly GateCheckRun[]): ChecksVerdict {
  const missing: string[] = [];
  const failed: string[] = [];
  for (const name of required) {
    const newest = runs.filter((r) => r.name === name && r.app?.slug === ACTIONS_APP).sort((a, b) => b.id - a.id)[0];
    if (!newest) missing.push(name);
    else if (newest.status !== "completed" || newest.conclusion !== "success") failed.push(name);
  }
  return missing.length || failed.length ? { ok: false, missing, failed } : { ok: true };
}

export function decideFastPath(input: { blockedBy?: number; pr?: MergedPr; mergedTree: string; prTree?: string; checks?: ChecksVerdict }): FastPath {
  const wait = (why: string): FastPath => ({ fast: false, note: `${why}: waiting for the complete main CI.` });
  if (input.blockedBy) return wait(`the ${ROLLBACK_LABEL} issue #${input.blockedBy} is open (main CI was red)`);
  if (!input.pr) return wait("no pull request from this repository was merged as this commit");
  if (!input.prTree || input.prTree !== input.mergedTree) return wait(`#${input.pr.number} was not up to date with main (its head tree differs from the merged tree)`);
  const checks = input.checks;
  if (!checks || !checks.ok) {
    const problems = checks ? [...checks.missing.map((n) => `${n} missing`), ...checks.failed.map((n) => `${n} not green`)] : ["checks unreadable"];
    return wait(`required checks on #${input.pr.number}: ${problems.join(", ")}`);
  }
  return { fast: true, pr: input.pr.number, note: `fast path: #${input.pr.number} passed every required check on the same tree (${input.pr.html_url}).` };
}

const treeOf = (repo: string, sha: string, token: string) => gh<{ commit: { tree: { sha: string } } }>(`/repos/${repo}/commits/${sha}`, token).then((c) => c.commit.tree.sha);

export async function openRollbackIssue(repo: string, token: string): Promise<number | undefined> {
  const issues = await gh<{ number: number; pull_request?: unknown }[]>(`/repos/${repo}/issues?labels=${ROLLBACK_LABEL}&state=open&per_page=5`, token);
  return issues.find((i) => !i.pull_request)?.number;
}

async function gate(repo: string, sha: string, token: string): Promise<FastPath> {
  const blockedBy = await openRollbackIssue(repo, token);
  const mergedTree = await treeOf(repo, sha, token);
  if (blockedBy) return decideFastPath({ blockedBy, mergedTree });
  const pr = mergedPrFor(sha, await gh<MergedPr[]>(`/repos/${repo}/commits/${sha}/pulls?per_page=10`, token), repo);
  if (!pr) return decideFastPath({ mergedTree });
  const prTree = await treeOf(repo, pr.head.sha, token);
  if (prTree !== mergedTree) return decideFastPath({ pr, mergedTree, prTree });
  const required = requiredFromRules(await gh<Rule[]>(`/repos/${repo}/rules/branches/main`, token).catch(() => []));
  const { check_runs } = await gh<{ check_runs: GateCheckRun[] }>(`/repos/${repo}/commits/${pr.head.sha}/check-runs?filter=all&per_page=100`, token);
  return decideFastPath({ pr, mergedTree, prTree, checks: checksVerdict(required, check_runs) });
}

function output(verdict: FastPath) {
  console.log(verdict.note);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `fast=${verdict.fast}\npr=${verdict.fast ? verdict.pr : ""}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `- Fast path: ${verdict.note}\n`);
}

async function main() {
  const args = process.argv.slice(2);
  const flag = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const repo = flag("--repo") ?? process.env.GITHUB_REPOSITORY;
  const sha = flag("--sha");
  const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
  if (!repo || !token) throw new Error("usage: GH_TOKEN=... bun scripts/merge-gate.ts --repo owner/name --sha <sha> [--check-block-only true]");
  if (flag("--check-block-only") === "true") {
    const open = await openRollbackIssue(repo, token).catch(() => -1);
    const note = open ? `the ${ROLLBACK_LABEL} issue ${open === -1 ? "could not be read" : `#${open} opened`} while this fast-path deploy ran: waiting for the complete main CI before the upload.` : `no open ${ROLLBACK_LABEL} issue.`;
    console.log(note);
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `blocked=${Boolean(open)}\n`);
    return;
  }
  if (!sha) throw new Error("--sha is required");
  const verdict = await gate(repo, sha, token).catch((error: unknown): FastPath => ({ fast: false, note: `fast-path check failed (${error instanceof Error ? error.message : String(error)}): waiting for the complete main CI.` }));
  output(verdict);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
