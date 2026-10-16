/**
 * Nightly CI report (the `nightly` job of .github/workflows/ci.yml, smart CI task 4).
 *
 *   NEEDS='{"e2e":{"result":"failure"}}' REPO=owner/name SHA=<sha> RUN_URL=<url> [APPLY=true] [GH_TOKEN=...] bun scripts/ci-nightly.ts
 *
 * Reads the results of every job of the nightly run (`NEEDS` is `toJSON(needs)`), then opens one issue
 * labelled `ci-nightly` when a job failed, updates it on the next failing night (a comment only when the
 * failed job set changed) and closes it with a comment once a nightly run is green again (GitHub emails
 * the owner). `APPLY=true` (main only) writes to GitHub; anything else is a dry run that prints the
 * action. Uses fetch and GH_TOKEN only (issues: write); no dependencies, so the job skips `bun install`.
 */
import { appendFileSync } from "node:fs";

export const NIGHTLY_LABEL = "ci-nightly";
export const ISSUE_TITLE = "Nightly CI failed on main";
const LABEL_COLOR = "B60205";
const LABEL_DESCRIPTION = "Nightly full CI run failing on main (ci.yml schedule)";
const MARKER = /<!-- ci-nightly:failed=([\w,-]*) -->/;
const FETCH_TIMEOUT_MS = 20_000;
/** Results that are not failures: a job skipped by its own condition (the preview). */
const PASSING = new Set(["success", "skipped"]);

export type Needs = Record<string, { result: string; outputs?: Record<string, string> }>;
export interface OpenIssue {
  number: number;
  body?: string;
}
export interface NightlyContext {
  runUrl: string;
  sha: string;
  checkedAt: string;
  /** Result per job id, for the body; a failed job without an entry shows "failure". */
  results?: Record<string, string>;
}
export type NightlyAction =
  | { kind: "none" }
  | { kind: "open"; title: string; body: string }
  | { kind: "update"; number: number; body: string; comment?: string }
  | { kind: "close"; number: number; comment: string };

/** Job ids whose result is neither `success` nor `skipped` (failure, cancelled), in input order. */
export function failedJobs(needs: Record<string, { result: string }>): string[] {
  return Object.entries(needs)
    .filter(([, job]) => !PASSING.has(job.result))
    .map(([id]) => id);
}

export function failedFromBody(body: string): string[] | null {
  const m = MARKER.exec(body);
  return m ? m[1].split(",").filter(Boolean) : null;
}

const short = (sha: string) => sha.slice(0, 7);

export function nightlyBody(failed: readonly string[], ctx: NightlyContext): string {
  const lines = [
    `<!-- ci-nightly:failed=${failed.join(",")} -->`,
    `The nightly full CI run on main failed on commit ${short(ctx.sha)}.`,
    "",
    "| Job | Result |",
    "|---|---|",
    ...failed.map((id) => `| \`${id}\` | ${ctx.results?.[id] ?? "failure"} |`),
    "",
  ];
  lines.push(`Last run ${ctx.checkedAt} ([run](${ctx.runUrl})). The next green nightly closes this issue.`);
  return lines.join("\n");
}

export function nightlyAction(failed: readonly string[], open: OpenIssue | null, ctx: NightlyContext): NightlyAction {
  if (failed.length === 0) {
    return open ? { kind: "close", number: open.number, comment: `The nightly CI run on ${short(ctx.sha)} passes again (${ctx.checkedAt}, [run](${ctx.runUrl})). Closing.` } : { kind: "none" };
  }
  const body = nightlyBody(failed, ctx);
  if (!open) return { kind: "open", title: ISSUE_TITLE, body };
  const before = (failedFromBody(open.body ?? "") ?? []).slice().sort().join(",");
  const now = failed.slice().sort().join(",");
  if (before === now) return { kind: "update", number: open.number, body };
  const comment = `Failed jobs changed on ${short(ctx.sha)} (${ctx.checkedAt}, [run](${ctx.runUrl})): ${failed.map((id) => `\`${id}\``).join(", ")}.`;
  return { kind: "update", number: open.number, body, comment };
}

export type GitHubCall = (method: string, path: string, body?: unknown) => Promise<{ status: number; data: unknown }>;

export function githubClient(fetchImpl: typeof fetch, token: string): GitHubCall {
  return async (method, path, body) => {
    const r = await fetchImpl(`https://api.github.com${path}`, {
      method,
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "x-github-api-version": "2022-11-28",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    const text = await r.text();
    let data: unknown = text;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      // Keep the text.
    }
    return { status: r.status, data };
  };
}

async function must(gh: GitHubCall, method: string, path: string, body?: unknown): Promise<unknown> {
  const res = await gh(method, path, body);
  if (res.status >= 300) throw new Error(`GitHub ${method} ${path} returned HTTP ${res.status}: ${JSON.stringify(res.data).slice(0, 200)}`);
  return res.data;
}

export async function findOpenIssue(gh: GitHubCall, repo: string): Promise<OpenIssue | null> {
  const data = (await must(gh, "GET", `/repos/${repo}/issues?labels=${NIGHTLY_LABEL}&state=open&per_page=20`)) as { number: number; body?: string | null; pull_request?: unknown }[];
  const issue = data.find((i) => !i.pull_request);
  return issue ? { number: issue.number, body: issue.body ?? "" } : null;
}

export async function applyNightlyAction(gh: GitHubCall, repo: string, action: NightlyAction): Promise<string> {
  switch (action.kind) {
    case "none":
      return "No open ci-nightly issue; nothing to do.";
    case "open": {
      const label = await gh("POST", `/repos/${repo}/labels`, { name: NIGHTLY_LABEL, color: LABEL_COLOR, description: LABEL_DESCRIPTION });
      if (label.status >= 300 && label.status !== 422) throw new Error(`GitHub POST label returned HTTP ${label.status}`);
      const issue = (await must(gh, "POST", `/repos/${repo}/issues`, { title: action.title, body: action.body, labels: [NIGHTLY_LABEL] })) as { html_url?: string };
      return `Opened ${issue.html_url ?? "the ci-nightly issue"}.`;
    }
    case "update":
      if (action.comment) await must(gh, "POST", `/repos/${repo}/issues/${action.number}/comments`, { body: action.comment });
      await must(gh, "PATCH", `/repos/${repo}/issues/${action.number}`, { body: action.body });
      return `Updated issue #${action.number}${action.comment ? " with a comment" : ""}.`;
    case "close":
      await must(gh, "POST", `/repos/${repo}/issues/${action.number}/comments`, { body: action.comment });
      await must(gh, "PATCH", `/repos/${repo}/issues/${action.number}`, { state: "closed", state_reason: "completed" });
      return `Closed issue #${action.number} (recovered).`;
  }
}

export function describeAction(action: NightlyAction): string {
  switch (action.kind) {
    case "none":
      return "do nothing (green, no open issue)";
    case "open":
      return `open an issue "${action.title}"`;
    case "update":
      return `update issue #${action.number}${action.comment ? " with a comment" : ""}`;
    case "close":
      return `close issue #${action.number}`;
  }
}

export function parseNeeds(raw: string | undefined): Needs {
  if (!raw) throw new Error("NEEDS is missing: pass toJSON(needs)");
  const parsed = JSON.parse(raw) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("NEEDS is not an object keyed by job id");
  const needs: Needs = {};
  for (const [id, job] of Object.entries(parsed as Record<string, unknown>)) {
    const result = (job as { result?: unknown } | null)?.result;
    needs[id] = { result: typeof result === "string" ? result : "unknown" };
  }
  return needs;
}

export function summaryMarkdown(needs: Needs, outcome: string): string {
  return ["## Nightly CI", "", "| Job | Result |", "|---|---|", ...Object.entries(needs).map(([id, job]) => `| \`${id}\` | ${job.result} |`), "", outcome, ""].join("\n");
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

async function main() {
  const needs = parseNeeds(process.env.NEEDS);
  const repo = process.env.REPO ?? process.env.GITHUB_REPOSITORY ?? "ShinyQ/ShinyQ-HQ";
  const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
  const apply = process.env.APPLY === "true";
  if (process.env.GITHUB_ACTIONS === "true" && apply && !token) throw new Error("GH_TOKEN is missing in GitHub Actions: refusing to skip the ci-nightly issue");
  const server = process.env.GITHUB_SERVER_URL ?? "https://github.com";
  const runUrl = process.env.RUN_URL ?? (process.env.GITHUB_RUN_ID ? `${server}/${repo}/actions/runs/${process.env.GITHUB_RUN_ID}` : `${server}/${repo}/actions/workflows/ci.yml`);
  const sha = process.env.SHA ?? process.env.GITHUB_SHA ?? "unknown";
  const failed = failedJobs(needs);
  const ctx: NightlyContext = { runUrl, sha, checkedAt: new Date().toISOString().replace(/\.\d+Z$/, "Z"), results: Object.fromEntries(Object.entries(needs).map(([id, job]) => [id, job.result])) };
  for (const [id, job] of Object.entries(needs)) console.log(`${PASSING.has(job.result) ? "ok  " : "FAIL"}  ${id}: ${job.result}`);
  const writeSummary = (outcome: string) => {
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summaryMarkdown(needs, outcome));
  };
  let outcome: string;
  try {
    const gh = token ? githubClient(fetch, token) : null;
    const open = gh ? await findOpenIssue(gh, repo) : null;
    const action = nightlyAction(failed, open, ctx);
    if (apply && gh) {
      outcome = await applyNightlyAction(gh, repo, action);
    } else {
      const why = apply ? "no GH_TOKEN" : "APPLY is not true, main only";
      const known = gh ? "" : " (no GH_TOKEN: open issue unknown)";
      outcome = `Dry run (${why}): would ${describeAction(action)}${known}.`;
      if (action.kind === "open" || action.kind === "update") console.log(`\n${action.body}\n`);
    }
  } catch (error) {
    writeSummary(`Issue handling failed: ${message(error)}`);
    throw error;
  }
  console.log(outcome);
  writeSummary(outcome);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
