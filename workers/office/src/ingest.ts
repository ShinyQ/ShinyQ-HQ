import { findBlockedTerms } from "../../../src/content/safety-match";
import { OFFICE_FEED_TITLE_MAX, type OfficeBeatV1 } from "../../../src/lib/office/protocol";
import type { GithubChange, GithubUpdate, JobStatus, RunStatus } from "./state";

const REPO = /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/;
const BRANCH = /^[A-Za-z0-9._/-]{1,120}$/;
const SAFE_URL = /^https:\/\/[^\s"'<>\\]{1,300}$/;
const SHA = /^[0-9a-f]{7,40}$/;

/** `OFFICE_REPO_ALLOWLIST`: comma-separated `owner/*` or `owner/name` entries. */
export function parseAllowlist(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function repoAllowed(repo: string, allow: readonly string[]): boolean {
  const name = repo.toLowerCase();
  return allow.some((entry) => {
    const e = entry.toLowerCase();
    return e.endsWith("/*") ? name.startsWith(e.slice(0, -1)) : name === e;
  });
}

/** One clean line of at most `max` characters, or null when empty or when it contains a blocklisted term. */
export function cleanTitle(text: string, blocklist: readonly string[], max = OFFICE_FEED_TITLE_MAX): string | null {
  const line = text
    .replace(/\s*\u2014\s*/g, ", ")
    .replace(/[\u0000-\u001f\u007f<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
    .trim();
  if (!line || findBlockedTerms(line, blocklist).length > 0) return null;
  return line;
}

/** True when a branch name holds a blocklisted term, also with "/", "-" and "_" read as word breaks. */
function branchBlocked(branch: string, blocklist: readonly string[]): boolean {
  return findBlockedTerms(branch, blocklist).length > 0 || findBlockedTerms(branch.replace(/[/_-]/g, " "), blocklist).length > 0;
}

/** Server re-check of a parsed beat: repository data only for allowlisted names, titles through the blocklist. */
export function sanitizeBeat(beat: OfficeBeatV1, allow: readonly string[], blocklist: readonly string[]): OfficeBeatV1 {
  const base: OfficeBeatV1 = { v: 1, agent: beat.agent, session: beat.session, state: beat.state, activity: beat.activity, ts: beat.ts };
  if (!beat.repo || !repoAllowed(beat.repo, allow)) return base;
  if (beat.branch && branchBlocked(beat.branch, blocklist)) return { ...base, repo: beat.repo };
  const title = beat.title ? cleanTitle(beat.title, blocklist) : null;
  return { ...base, repo: beat.repo, ...(beat.branch ? { branch: beat.branch } : {}), ...(beat.title ? { title: title ?? undefined } : {}) };
}

type Json = Record<string, unknown>;
const obj = (x: unknown): Json | null => (typeof x === "object" && x !== null && !Array.isArray(x) ? (x as Json) : null);
const text = (x: unknown): string => (typeof x === "string" ? x : "");
const int = (x: unknown): number | null => (typeof x === "number" && Number.isSafeInteger(x) ? x : null);

function runStatus(status: string, conclusion: string): RunStatus {
  if (status !== "completed") return "running";
  if (conclusion === "success") return "success";
  if (conclusion === "failure" || conclusion === "timed_out" || conclusion === "startup_failure") return "failure";
  return "cancelled";
}

function jobStatus(status: string, conclusion: string): JobStatus {
  if (status === "completed") return conclusion === "failure" || conclusion === "timed_out" ? "failed" : "done";
  return status === "in_progress" ? "running" : "queued";
}

function deployStatus(state: string): "running" | "success" | "failure" | null {
  if (state === "success") return "success";
  if (state === "failure" || state === "error") return "failure";
  if (state === "pending" || state === "queued" || state === "in_progress") return "running";
  return null;
}

/**
 * One GitHub webhook delivery to office changes, for allowlisted public repositories only (null otherwise, which also
 * keeps private repositories out of the known-public list). Titles go through the blocklist; URLs must be https.
 */
export function parseGithubEvent(event: string, payload: unknown, allow: readonly string[], blocklist: readonly string[]): GithubUpdate | null {
  const body = obj(payload);
  const repository = obj(body?.repository);
  const repo = text(repository?.full_name);
  if (!body || !repository || repository.private !== false || !REPO.test(repo) || !repoAllowed(repo, allow)) return null;
  const home = `https://github.com/${repo}`;
  const url = (x: unknown) => (SAFE_URL.test(text(x)) ? text(x) : home);
  const title = (raw: string, fallback: string) => cleanTitle(raw, blocklist) ?? fallback;
  const changes: GithubChange[] = [];
  switch (event) {
    case "workflow_run": {
      const run = obj(body.workflow_run);
      const id = int(run?.id);
      const branch = text(run?.head_branch);
      if (!run || id === null || !BRANCH.test(branch) || branchBlocked(branch, blocklist)) break;
      changes.push({ type: "run", id, branch, title: title(`${text(run.name)} · ${branch}`, "Workflow run"), url: url(run.html_url), status: runStatus(text(run.status), text(run.conclusion)) });
      break;
    }
    case "workflow_job": {
      const job = obj(body.workflow_job);
      const runId = int(job?.run_id);
      const jobId = int(job?.id);
      if (!job || runId === null || jobId === null) break;
      changes.push({ type: "job", runId, jobId: String(jobId), name: title(text(job.name), "Job"), status: jobStatus(text(job.status), text(job.conclusion)) });
      break;
    }
    case "pull_request": {
      const pr = obj(body.pull_request);
      const number = int(pr?.number);
      const branch = text(obj(pr?.head)?.ref);
      const action = text(body.action);
      if (!pr || number === null || !BRANCH.test(branch) || branchBlocked(branch, blocklist)) break;
      const kind = action === "opened" || action === "reopened" || action === "ready_for_review" ? "opened" : action === "closed" && pr.merged === true ? "merged" : null;
      if (kind) changes.push({ type: "pr", number, branch, title: title(text(pr.title), `Pull request #${number}`), url: url(pr.html_url), action: kind });
      break;
    }
    case "push": {
      const main = text(repository.default_branch);
      const head = obj(body.head_commit);
      const sha = text(head?.id);
      if (!head || !main || text(body.ref) !== `refs/heads/${main}` || !SHA.test(sha)) break;
      const firstLine = text(head.message).split("\n")[0] ?? "";
      changes.push({ type: "push", sha, title: title(`${main} · ${firstLine}`, `Commit to ${main}`), url: url(head.url) });
      break;
    }
    case "deployment_status": {
      const status = obj(body.deployment_status);
      const deployment = obj(body.deployment);
      const id = int(deployment?.id);
      const state = deployStatus(text(status?.state));
      if (!status || id === null || !state) break;
      const environment = text(status.environment) || text(deployment?.environment) || "production";
      changes.push({ type: "deploy", id, title: title(`Deploy · ${environment}`, "Deploy"), url: url(status.target_url ?? status.log_url), status: state });
      break;
    }
    default:
      break;
  }
  return { repo, changes };
}
