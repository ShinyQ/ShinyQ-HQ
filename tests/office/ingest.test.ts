import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { OfficeBeatV1 } from "@/lib/office/protocol";
import { hmacHex, signatureOk } from "../../workers/office/src/crypto";
import { cleanTitle, DEFAULT_GITHUB_ACTORS, parseActors, parseAllowlist, parseGithubEvent, repoAllowed, sanitizeBeat } from "../../workers/office/src/ingest";

const ALLOW = parseAllowlist(" ShinyQ/* , other/one ");
const repository = (extra: Record<string, unknown> = {}) => ({ full_name: "ShinyQ/ShinyQ-HQ", private: false, default_branch: "main", ...extra });
const headRepo = { full_name: "ShinyQ/ShinyQ-HQ" };
const owner = { login: "ShinyQ" };

describe("signatures", () => {
  it("matches node's HMAC-SHA256 hex and checks the sha256= header", async () => {
    const body = '{"a":1}';
    const hex = createHmac("sha256", "k").update(body).digest("hex");
    expect(await hmacHex("k", body)).toBe(hex);
    expect(await signatureOk("k", body, `sha256=${hex}`)).toBe(true);
    expect(await signatureOk("k", body, hex)).toBe(false);
    expect(await signatureOk("k", `${body} `, `sha256=${hex}`)).toBe(false);
    expect(await signatureOk("k", body, null)).toBe(false);
  });
});

describe("allowlist and titles", () => {
  it("matches owner wildcards and exact names, case-insensitively", () => {
    expect(ALLOW).toEqual(["ShinyQ/*", "other/one"]);
    expect(repoAllowed("shinyq/ShinyQ-HQ", ALLOW)).toBe(true);
    expect(repoAllowed("other/one", ALLOW)).toBe(true);
    expect(repoAllowed("other/two", ALLOW)).toBe(false);
    expect(repoAllowed("ShinyQ-evil/x", ALLOW)).toBe(false);
  });

  it("cleans markup, control characters and em dashes, and drops an empty title", () => {
    expect(cleanTitle(" \n <> ")).toBeNull();
    expect(cleanTitle("  Fix <b>login</b>\n now  ")).toBe("Fix b login /b now");
    expect(cleanTitle("Wake up \u2014 then orbit")).toBe("Wake up, then orbit");
    expect(cleanTitle("x".repeat(200))).toHaveLength(120);
  });

  it("sanitizes a beat: no repository data outside the allowlist, titles cleaned", () => {
    const beat: OfficeBeatV1 = { v: 1, agent: "claude", session: "b".repeat(64), state: "working", activity: "editing", repo: "client/app", branch: "feat/x", title: "X", ts: 1 };
    expect(sanitizeBeat(beat, ALLOW)).toEqual({ v: 1, agent: "claude", session: "b".repeat(64), state: "working", activity: "editing", ts: 1 });
    expect(sanitizeBeat({ ...beat, repo: "ShinyQ/ShinyQ-HQ", title: " <> " }, ALLOW)).toEqual({ ...beat, repo: "ShinyQ/ShinyQ-HQ", title: undefined });
    expect(sanitizeBeat({ ...beat, repo: "ShinyQ/ShinyQ-HQ" }, ALLOW)).toEqual({ ...beat, repo: "ShinyQ/ShinyQ-HQ" });
  });

  it("keeps the helper count of a beat, with or without a repository", () => {
    const beat: OfficeBeatV1 = { v: 1, agent: "claude", session: "b".repeat(64), state: "working", activity: "editing", helpers: 3, ts: 1 };
    expect(sanitizeBeat(beat, ALLOW)).toEqual(beat);
    expect(sanitizeBeat({ ...beat, helpers: 0, repo: "client/app" }, ALLOW)).toEqual({ ...beat, helpers: 0 });
    expect(sanitizeBeat({ ...beat, repo: "ShinyQ/ShinyQ-HQ", branch: "fix/login" }, ALLOW)).toEqual({ ...beat, repo: "ShinyQ/ShinyQ-HQ", branch: "fix/login" });
    expect(sanitizeBeat({ ...beat, helpers: undefined }, ALLOW)).not.toHaveProperty("helpers");
    expect(sanitizeBeat({ ...beat, repo: "ShinyQ/ShinyQ-HQ", branch: "feat/x", title: "X" }, ALLOW)).toEqual({ ...beat, repo: "ShinyQ/ShinyQ-HQ", branch: "feat/x", title: "X" });
    expect(sanitizeBeat({ ...beat, helpers: 9, repo: "ShinyQ/ShinyQ-HQ", title: "Login" }, ALLOW)).toMatchObject({ helpers: 9 });
  });
});

describe("parseGithubEvent", () => {
  it("ignores private and non-allowlisted repositories", () => {
    expect(parseGithubEvent("ping", { repository: repository({ private: true }) }, ALLOW)).toBeNull();
    expect(parseGithubEvent("ping", { repository: repository({ full_name: "client/app" }) }, ALLOW)).toBeNull();
    // A ping (the webhook was just added) is an owner action, so it also lifts a revoked name (audit 2026-10-24).
    expect(parseGithubEvent("ping", { repository: repository() }, ALLOW)).toEqual({ repo: "ShinyQ/ShinyQ-HQ", changes: [], restored: true });
  });

  it("maps workflow_run and workflow_job", () => {
    const run = (status: string, conclusion: string | null) => ({ repository: repository(), workflow_run: { id: 42, run_attempt: 1, name: "CI", head_branch: "feat/x", head_repository: headRepo, status, conclusion, html_url: "https://github.com/ShinyQ/ShinyQ-HQ/actions/runs/42" } });
    expect(parseGithubEvent("workflow_run", run("in_progress", null), ALLOW)?.changes).toEqual([{ type: "run", id: 42, attempt: 1, branch: "feat/x", title: "CI · feat/x", url: "https://github.com/ShinyQ/ShinyQ-HQ/actions/runs/42", status: "running" }]);
    expect(parseGithubEvent("workflow_run", run("completed", "success"), ALLOW)?.changes[0]).toMatchObject({ status: "success" });
    expect(parseGithubEvent("workflow_run", run("completed", "timed_out"), ALLOW)?.changes[0]).toMatchObject({ status: "failure" });
    expect(parseGithubEvent("workflow_run", run("completed", "cancelled"), ALLOW)?.changes[0]).toMatchObject({ status: "cancelled" });
    const job = { repository: repository(), workflow_job: { id: 7, run_id: 42, run_attempt: 2, name: "E2E shard 3/8", status: "completed", conclusion: "failure" } };
    expect(parseGithubEvent("workflow_job", job, ALLOW)?.changes).toEqual([{ type: "job", runId: 42, attempt: 2, jobId: "7", name: "E2E shard 3/8", status: "failed" }]);
  });

  it("maps run_attempt, defaulting to 1 when missing or not a positive integer", () => {
    const run = (attempt: unknown) => ({ repository: repository(), workflow_run: { id: 42, run_attempt: attempt, name: "CI", head_branch: "feat/x", head_repository: headRepo, status: "in_progress", conclusion: null, html_url: "https://github.com/ShinyQ/ShinyQ-HQ/actions/runs/42" } });
    expect(parseGithubEvent("workflow_run", run(3), ALLOW)?.changes[0]).toMatchObject({ type: "run", attempt: 3 });
    for (const bad of [undefined, 0, -1, 1.5, "2", null]) expect(parseGithubEvent("workflow_run", run(bad), ALLOW)?.changes[0]).toMatchObject({ type: "run", attempt: 1 });
  });

  it("maps a job's run_attempt, defaulting to 1 when missing or not a positive integer", () => {
    const job = (attempt: unknown) => ({ repository: repository(), workflow_job: { id: 7, run_id: 42, run_attempt: attempt, name: "Lint", status: "in_progress", conclusion: null } });
    expect(parseGithubEvent("workflow_job", job(3), ALLOW)?.changes[0]).toMatchObject({ type: "job", attempt: 3 });
    for (const bad of [undefined, 0, -1, 1.5, "2", null]) expect(parseGithubEvent("workflow_job", job(bad), ALLOW)?.changes[0]).toMatchObject({ type: "job", attempt: 1 });
  });

  it("maps pull requests, default-branch pushes and deployments", () => {
    const pr = (action: string, merged: boolean) => ({ action, number: 7, repository: repository(), sender: owner, pull_request: { number: 7, merged, title: "feat: office", html_url: "https://github.com/ShinyQ/ShinyQ-HQ/pull/7", head: { ref: "feat/office", repo: headRepo } } });
    expect(parseGithubEvent("pull_request", pr("opened", false), ALLOW)?.changes).toEqual([{ type: "pr", number: 7, branch: "feat/office", title: "feat: office", url: "https://github.com/ShinyQ/ShinyQ-HQ/pull/7", action: "opened" }]);
    expect(parseGithubEvent("pull_request", pr("closed", true), ALLOW)?.changes[0]).toMatchObject({ action: "merged" });
    expect(parseGithubEvent("pull_request", pr("closed", false), ALLOW)?.changes).toEqual([]);
    const push = (ref: string) => ({ ref, repository: repository(), head_commit: { id: "abc1234def", message: "feat: office (#230)\n\nbody", url: "https://github.com/ShinyQ/ShinyQ-HQ/commit/abc1234def" } });
    expect(parseGithubEvent("push", push("refs/heads/main"), ALLOW)?.changes).toEqual([{ type: "push", sha: "abc1234def", title: "main · feat: office (#230)", url: "https://github.com/ShinyQ/ShinyQ-HQ/commit/abc1234def" }]);
    expect(parseGithubEvent("push", push("refs/heads/feat/x"), ALLOW)?.changes).toEqual([]);
    const deploy = { repository: repository(), deployment: { id: 9, environment: "production", ref: "main" }, deployment_status: { state: "success", environment: "production", target_url: "https://github.com/ShinyQ/ShinyQ-HQ/actions/runs/43" } };
    expect(parseGithubEvent("deployment_status", deploy, ALLOW)?.changes).toEqual([{ type: "deploy", id: 9, title: "Deploy · production", url: "https://github.com/ShinyQ/ShinyQ-HQ/actions/runs/43", status: "success", production: true }]);
    const preview = { ...deploy, deployment: { id: 10, environment: "Preview", ref: "refs/heads/main" }, deployment_status: { ...deploy.deployment_status, environment: "Preview" } };
    expect(parseGithubEvent("deployment_status", preview, ALLOW)?.changes[0]).toMatchObject({ type: "deploy", title: "Deploy · Preview", production: false });
  });

  it("ignores deployments that are not of the default branch, such as a fork pull request job (audit 2026-10-24)", () => {
    const deploy = (ref: unknown) => ({ repository: repository(), sender: { login: "stranger" }, deployment: { id: 11, environment: "office-probe", ref, creator: { login: "stranger" } }, deployment_status: { state: "success", environment: "office-probe", target_url: "https://github.com/ShinyQ/ShinyQ-HQ/actions/runs/1" } });
    for (const ref of ["refs/pull/1/merge", "feat/x", "", undefined, "refs/heads/main-ish"]) expect(parseGithubEvent("deployment_status", deploy(ref), ALLOW)?.changes).toEqual([]);
  });

  it("revokes a name that is deleted, renamed away or transferred away, and restores only on publicized (audit 2026-10-24)", () => {
    const repoEvent = (action: string, extra: Record<string, unknown> = {}, repo = repository()) => ({ action, repository: repo, ...extra });
    const revoked = (repo: string) => ({ repo, changes: [{ type: "privatized" }] });
    expect(parseGithubEvent("repository", repoEvent("deleted"), ALLOW)).toEqual(revoked("ShinyQ/ShinyQ-HQ"));
    expect(parseGithubEvent("repository", repoEvent("renamed", { changes: { repository: { name: { from: "Old-HQ" } } } }), ALLOW)).toEqual(revoked("ShinyQ/Old-HQ"));
    const moved = repository({ full_name: "elsewhere/ShinyQ-HQ" });
    expect(parseGithubEvent("repository", repoEvent("transferred", { changes: { owner: { from: { user: { login: "ShinyQ" } } } } }, moved), ALLOW)).toEqual(revoked("ShinyQ/ShinyQ-HQ"));
    expect(parseGithubEvent("repository", repoEvent("transferred", { changes: { owner: { from: { organization: { login: "client" } } } } }, moved), ALLOW)).toBeNull();
    expect(parseGithubEvent("repository", repoEvent("publicized"), ALLOW)).toEqual({ repo: "ShinyQ/ShinyQ-HQ", changes: [], restored: true });
    expect(parseGithubEvent("repository", repoEvent("edited"), ALLOW)).toEqual({ repo: "ShinyQ/ShinyQ-HQ", changes: [] });
  });

  it("replaces an empty title with a generic one and an unsafe URL with the repository URL", () => {
    const pr = { action: "opened", number: 8, repository: repository(), sender: owner, pull_request: { number: 8, merged: false, title: " <> ", html_url: "javascript:alert(1)", head: { ref: "fix/y", repo: headRepo } } };
    expect(parseGithubEvent("pull_request", pr, ALLOW)?.changes[0]).toMatchObject({ title: "Pull request #8", url: "https://github.com/ShinyQ/ShinyQ-HQ" });
  });

  it("ignores fork pull requests and pull requests from outside actors", () => {
    const pr = (sender: string, association: string, head = "ShinyQ/ShinyQ-HQ") => ({ action: "opened", number: 10, repository: repository(), sender: { login: sender }, pull_request: { number: 10, merged: false, title: "feat: x", author_association: association, html_url: "https://github.com/ShinyQ/ShinyQ-HQ/pull/10", head: { ref: "feat/x", repo: { full_name: head } } } });
    expect(parseGithubEvent("pull_request", pr("ShinyQ", "OWNER", "stranger/ShinyQ-HQ"), ALLOW)?.changes).toEqual([]);
    expect(parseGithubEvent("pull_request", pr("stranger", "NONE"), ALLOW)?.changes).toEqual([]);
    expect(parseGithubEvent("pull_request", pr("ShinyQ", "NONE"), ALLOW)?.changes[0]).toMatchObject({ type: "pr", number: 10 });
    expect(parseGithubEvent("pull_request", pr("shinyq", "NONE", "shinyq/shinyq-hq"), ALLOW)?.changes[0]).toMatchObject({ type: "pr", number: 10 });
    expect(parseGithubEvent("pull_request", pr("helper", "COLLABORATOR"), ALLOW)?.changes[0]).toMatchObject({ type: "pr", number: 10 });
    expect(parseGithubEvent("pull_request", pr("helper", "NONE"), ALLOW, ["Helper"])?.changes[0]).toMatchObject({ type: "pr", number: 10 });
    expect(parseGithubEvent("pull_request", pr("ShinyQ", "NONE"), ALLOW, ["helper"])?.changes).toEqual([]);
  });

  it("reads the actor allowlist, falling back to the defaults", () => {
    expect(DEFAULT_GITHUB_ACTORS).toEqual(["ShinyQ", "Copilot"]);
    expect(parseActors(undefined)).toEqual(["ShinyQ", "Copilot"]);
    expect(parseActors(" , ")).toEqual(["ShinyQ", "Copilot"]);
    expect(parseActors(" a , b ")).toEqual(["a", "b"]);
  });

  it("ignores workflow runs from forks", () => {
    const run = (head: string) => ({ repository: repository(), workflow_run: { id: 44, name: "CI", head_branch: "feat/x", head_repository: { full_name: head }, status: "completed", conclusion: "failure", html_url: "https://github.com/ShinyQ/ShinyQ-HQ/actions/runs/44" } });
    expect(parseGithubEvent("workflow_run", run("stranger/ShinyQ-HQ"), ALLOW)?.changes).toEqual([]);
    expect(parseGithubEvent("workflow_run", run("shinyq/shinyq-hq"), ALLOW)?.changes[0]).toMatchObject({ type: "run", id: 44, status: "failure" });
  });

  it("reports a privatized allowlisted repository even though it is now private", () => {
    const event = (full: string) => ({ action: "privatized", repository: repository({ full_name: full, private: true }) });
    expect(parseGithubEvent("repository", event("ShinyQ/ShinyQ-HQ"), ALLOW)).toEqual({ repo: "ShinyQ/ShinyQ-HQ", changes: [{ type: "privatized" }] });
    expect(parseGithubEvent("repository", event("client/app"), ALLOW)).toBeNull();
    expect(parseGithubEvent("repository", { action: "edited", repository: repository({ private: true }) }, ALLOW)).toBeNull();
  });
});
