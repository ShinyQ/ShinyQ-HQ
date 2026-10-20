import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { OfficeBeatV1 } from "@/lib/office/protocol";
import { hmacHex, signatureOk } from "../../workers/office/src/crypto";
import { cleanTitle, DEFAULT_GITHUB_ACTORS, parseActors, parseAllowlist, parseGithubEvent, repoAllowed, sanitizeBeat } from "../../workers/office/src/ingest";

const ALLOW = parseAllowlist(" ShinyQ/* , other/one ");
const BLOCK = ["acme bank"];
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

  it("drops blocked titles and cleans markup, control characters and em dashes", () => {
    expect(cleanTitle("Fix login for Acme Bank", BLOCK)).toBeNull();
    expect(cleanTitle("  Fix <b>login</b>\n now  ", BLOCK)).toBe("Fix b login /b now");
    expect(cleanTitle("Wake up \u2014 then orbit", BLOCK)).toBe("Wake up, then orbit");
    expect(cleanTitle("x".repeat(200), BLOCK)).toHaveLength(120);
  });

  it("sanitizes a beat: no repository data outside the allowlist, blocked titles removed", () => {
    const beat: OfficeBeatV1 = { v: 1, agent: "claude", session: "b".repeat(64), state: "working", activity: "editing", repo: "client/app", branch: "feat/x", title: "X", ts: 1 };
    expect(sanitizeBeat(beat, ALLOW, BLOCK)).toEqual({ v: 1, agent: "claude", session: "b".repeat(64), state: "working", activity: "editing", ts: 1 });
    expect(sanitizeBeat({ ...beat, repo: "ShinyQ/ShinyQ-HQ", title: "Acme Bank login" }, ALLOW, BLOCK)).toEqual({ ...beat, repo: "ShinyQ/ShinyQ-HQ", title: undefined });
    expect(sanitizeBeat({ ...beat, repo: "ShinyQ/ShinyQ-HQ" }, ALLOW, BLOCK)).toEqual({ ...beat, repo: "ShinyQ/ShinyQ-HQ" });
  });

  it("keeps the helper count of a beat, with or without a repository", () => {
    const beat: OfficeBeatV1 = { v: 1, agent: "claude", session: "b".repeat(64), state: "working", activity: "editing", helpers: 3, ts: 1 };
    expect(sanitizeBeat(beat, ALLOW, BLOCK)).toEqual(beat);
    expect(sanitizeBeat({ ...beat, helpers: 0, repo: "client/app" }, ALLOW, BLOCK)).toEqual({ ...beat, helpers: 0 });
    expect(sanitizeBeat({ ...beat, repo: "ShinyQ/ShinyQ-HQ", branch: "fix/acme-bank" }, ALLOW, BLOCK)).toEqual({ ...beat, repo: "ShinyQ/ShinyQ-HQ" });
    expect(sanitizeBeat({ ...beat, helpers: undefined }, ALLOW, BLOCK)).not.toHaveProperty("helpers");
    expect(sanitizeBeat({ ...beat, repo: "ShinyQ/ShinyQ-HQ", branch: "feat/x", title: "X" }, ALLOW, BLOCK)).toEqual({ ...beat, repo: "ShinyQ/ShinyQ-HQ", branch: "feat/x", title: "X" });
    expect(sanitizeBeat({ ...beat, helpers: 9, repo: "ShinyQ/ShinyQ-HQ", title: "Acme Bank login" }, ALLOW, BLOCK)).toMatchObject({ helpers: 9 });
  });
});

describe("parseGithubEvent", () => {
  it("ignores private and non-allowlisted repositories", () => {
    expect(parseGithubEvent("ping", { repository: repository({ private: true }) }, ALLOW, BLOCK)).toBeNull();
    expect(parseGithubEvent("ping", { repository: repository({ full_name: "client/app" }) }, ALLOW, BLOCK)).toBeNull();
    expect(parseGithubEvent("ping", { repository: repository() }, ALLOW, BLOCK)).toEqual({ repo: "ShinyQ/ShinyQ-HQ", changes: [] });
  });

  it("maps workflow_run and workflow_job", () => {
    const run = (status: string, conclusion: string | null) => ({ repository: repository(), workflow_run: { id: 42, run_attempt: 1, name: "CI", head_branch: "feat/x", head_repository: headRepo, status, conclusion, html_url: "https://github.com/ShinyQ/ShinyQ-HQ/actions/runs/42" } });
    expect(parseGithubEvent("workflow_run", run("in_progress", null), ALLOW, BLOCK)?.changes).toEqual([{ type: "run", id: 42, attempt: 1, branch: "feat/x", title: "CI · feat/x", url: "https://github.com/ShinyQ/ShinyQ-HQ/actions/runs/42", status: "running" }]);
    expect(parseGithubEvent("workflow_run", run("completed", "success"), ALLOW, BLOCK)?.changes[0]).toMatchObject({ status: "success" });
    expect(parseGithubEvent("workflow_run", run("completed", "timed_out"), ALLOW, BLOCK)?.changes[0]).toMatchObject({ status: "failure" });
    expect(parseGithubEvent("workflow_run", run("completed", "cancelled"), ALLOW, BLOCK)?.changes[0]).toMatchObject({ status: "cancelled" });
    const job = { repository: repository(), workflow_job: { id: 7, run_id: 42, run_attempt: 2, name: "E2E shard 3/8", status: "completed", conclusion: "failure" } };
    expect(parseGithubEvent("workflow_job", job, ALLOW, BLOCK)?.changes).toEqual([{ type: "job", runId: 42, attempt: 2, jobId: "7", name: "E2E shard 3/8", status: "failed" }]);
  });

  it("maps run_attempt, defaulting to 1 when missing or not a positive integer", () => {
    const run = (attempt: unknown) => ({ repository: repository(), workflow_run: { id: 42, run_attempt: attempt, name: "CI", head_branch: "feat/x", head_repository: headRepo, status: "in_progress", conclusion: null, html_url: "https://github.com/ShinyQ/ShinyQ-HQ/actions/runs/42" } });
    expect(parseGithubEvent("workflow_run", run(3), ALLOW, BLOCK)?.changes[0]).toMatchObject({ type: "run", attempt: 3 });
    for (const bad of [undefined, 0, -1, 1.5, "2", null]) expect(parseGithubEvent("workflow_run", run(bad), ALLOW, BLOCK)?.changes[0]).toMatchObject({ type: "run", attempt: 1 });
  });

  it("maps a job's run_attempt, defaulting to 1 when missing or not a positive integer", () => {
    const job = (attempt: unknown) => ({ repository: repository(), workflow_job: { id: 7, run_id: 42, run_attempt: attempt, name: "Lint", status: "in_progress", conclusion: null } });
    expect(parseGithubEvent("workflow_job", job(3), ALLOW, BLOCK)?.changes[0]).toMatchObject({ type: "job", attempt: 3 });
    for (const bad of [undefined, 0, -1, 1.5, "2", null]) expect(parseGithubEvent("workflow_job", job(bad), ALLOW, BLOCK)?.changes[0]).toMatchObject({ type: "job", attempt: 1 });
  });

  it("maps pull requests, default-branch pushes and deployments", () => {
    const pr = (action: string, merged: boolean) => ({ action, number: 7, repository: repository(), sender: owner, pull_request: { number: 7, merged, title: "feat: office", html_url: "https://github.com/ShinyQ/ShinyQ-HQ/pull/7", head: { ref: "feat/office", repo: headRepo } } });
    expect(parseGithubEvent("pull_request", pr("opened", false), ALLOW, BLOCK)?.changes).toEqual([{ type: "pr", number: 7, branch: "feat/office", title: "feat: office", url: "https://github.com/ShinyQ/ShinyQ-HQ/pull/7", action: "opened" }]);
    expect(parseGithubEvent("pull_request", pr("closed", true), ALLOW, BLOCK)?.changes[0]).toMatchObject({ action: "merged" });
    expect(parseGithubEvent("pull_request", pr("closed", false), ALLOW, BLOCK)?.changes).toEqual([]);
    const push = (ref: string) => ({ ref, repository: repository(), head_commit: { id: "abc1234def", message: "feat: office (#230)\n\nbody", url: "https://github.com/ShinyQ/ShinyQ-HQ/commit/abc1234def" } });
    expect(parseGithubEvent("push", push("refs/heads/main"), ALLOW, BLOCK)?.changes).toEqual([{ type: "push", sha: "abc1234def", title: "main · feat: office (#230)", url: "https://github.com/ShinyQ/ShinyQ-HQ/commit/abc1234def" }]);
    expect(parseGithubEvent("push", push("refs/heads/feat/x"), ALLOW, BLOCK)?.changes).toEqual([]);
    const deploy = { repository: repository(), deployment: { id: 9, environment: "production" }, deployment_status: { state: "success", environment: "production", target_url: "https://github.com/ShinyQ/ShinyQ-HQ/actions/runs/43" } };
    expect(parseGithubEvent("deployment_status", deploy, ALLOW, BLOCK)?.changes).toEqual([{ type: "deploy", id: 9, title: "Deploy · production", url: "https://github.com/ShinyQ/ShinyQ-HQ/actions/runs/43", status: "success" }]);
  });

  it("replaces a blocked title with a generic one and an unsafe URL with the repository URL", () => {
    const pr = { action: "opened", number: 8, repository: repository(), sender: owner, pull_request: { number: 8, merged: false, title: "Acme Bank fix", html_url: "javascript:alert(1)", head: { ref: "fix/y", repo: headRepo } } };
    expect(parseGithubEvent("pull_request", pr, ALLOW, BLOCK)?.changes[0]).toMatchObject({ title: "Pull request #8", url: "https://github.com/ShinyQ/ShinyQ-HQ" });
  });

  it("drops runs, pull requests and beat branches whose branch name holds a blocked term", () => {
    const run = { repository: repository(), workflow_run: { id: 42, name: "CI", head_branch: "feat/acme_bank-login", head_repository: headRepo, status: "in_progress", conclusion: null, html_url: "https://github.com/ShinyQ/ShinyQ-HQ/actions/runs/42" } };
    expect(parseGithubEvent("workflow_run", run, ALLOW, BLOCK)?.changes).toEqual([]);
    const pr = { action: "opened", number: 9, repository: repository(), sender: owner, pull_request: { number: 9, merged: false, title: "Login fix", html_url: "https://github.com/ShinyQ/ShinyQ-HQ/pull/9", head: { ref: "fix/acme-bank", repo: headRepo } } };
    expect(parseGithubEvent("pull_request", pr, ALLOW, BLOCK)?.changes).toEqual([]);
    const blockedRun = { repository: repository(), workflow_run: { ...run.workflow_run, name: "Acme Bank CI", head_branch: "feat/x" } };
    expect(parseGithubEvent("workflow_run", blockedRun, ALLOW, BLOCK)?.changes[0]).toMatchObject({ branch: "feat/x", title: "Workflow run" });
    const beat: OfficeBeatV1 = { v: 1, agent: "claude", session: "b".repeat(64), state: "working", activity: "editing", repo: "ShinyQ/ShinyQ-HQ", branch: "fix/acme-bank", title: "Login fix", ts: 1 };
    expect(sanitizeBeat(beat, ALLOW, BLOCK)).toEqual({ v: 1, agent: "claude", session: "b".repeat(64), state: "working", activity: "editing", repo: "ShinyQ/ShinyQ-HQ", ts: 1 });
  });

  it("reads dots in branch names as word breaks", () => {
    const run = { repository: repository(), workflow_run: { id: 43, name: "CI", head_branch: "feat/acme.bank", head_repository: headRepo, status: "in_progress", conclusion: null, html_url: "https://github.com/ShinyQ/ShinyQ-HQ/actions/runs/43" } };
    expect(parseGithubEvent("workflow_run", run, ALLOW, BLOCK)?.changes).toEqual([]);
  });

  it("skips pushes whose default branch holds a blocked term", () => {
    const push = { ref: "refs/heads/acme", repository: repository({ default_branch: "acme" }), head_commit: { id: "abc1234def", message: "feat: office", url: "https://github.com/ShinyQ/ShinyQ-HQ/commit/abc1234def" } };
    expect(parseGithubEvent("push", push, ALLOW, ["acme"])?.changes).toEqual([]);
    const dotted = { ...push, ref: "refs/heads/acme.bank", repository: repository({ default_branch: "acme.bank" }) };
    expect(parseGithubEvent("push", dotted, ALLOW, BLOCK)?.changes).toEqual([]);
  });

  it("ignores fork pull requests and pull requests from outside actors", () => {
    const pr = (sender: string, association: string, head = "ShinyQ/ShinyQ-HQ") => ({ action: "opened", number: 10, repository: repository(), sender: { login: sender }, pull_request: { number: 10, merged: false, title: "feat: x", author_association: association, html_url: "https://github.com/ShinyQ/ShinyQ-HQ/pull/10", head: { ref: "feat/x", repo: { full_name: head } } } });
    expect(parseGithubEvent("pull_request", pr("ShinyQ", "OWNER", "stranger/ShinyQ-HQ"), ALLOW, BLOCK)?.changes).toEqual([]);
    expect(parseGithubEvent("pull_request", pr("stranger", "NONE"), ALLOW, BLOCK)?.changes).toEqual([]);
    expect(parseGithubEvent("pull_request", pr("ShinyQ", "NONE"), ALLOW, BLOCK)?.changes[0]).toMatchObject({ type: "pr", number: 10 });
    expect(parseGithubEvent("pull_request", pr("shinyq", "NONE", "shinyq/shinyq-hq"), ALLOW, BLOCK)?.changes[0]).toMatchObject({ type: "pr", number: 10 });
    expect(parseGithubEvent("pull_request", pr("helper", "COLLABORATOR"), ALLOW, BLOCK)?.changes[0]).toMatchObject({ type: "pr", number: 10 });
    expect(parseGithubEvent("pull_request", pr("helper", "NONE"), ALLOW, BLOCK, ["Helper"])?.changes[0]).toMatchObject({ type: "pr", number: 10 });
    expect(parseGithubEvent("pull_request", pr("ShinyQ", "NONE"), ALLOW, BLOCK, ["helper"])?.changes).toEqual([]);
  });

  it("reads the actor allowlist, falling back to the defaults", () => {
    expect(DEFAULT_GITHUB_ACTORS).toEqual(["ShinyQ", "Copilot"]);
    expect(parseActors(undefined)).toEqual(["ShinyQ", "Copilot"]);
    expect(parseActors(" , ")).toEqual(["ShinyQ", "Copilot"]);
    expect(parseActors(" a , b ")).toEqual(["a", "b"]);
  });

  it("ignores workflow runs from forks", () => {
    const run = (head: string) => ({ repository: repository(), workflow_run: { id: 44, name: "CI", head_branch: "feat/x", head_repository: { full_name: head }, status: "completed", conclusion: "failure", html_url: "https://github.com/ShinyQ/ShinyQ-HQ/actions/runs/44" } });
    expect(parseGithubEvent("workflow_run", run("stranger/ShinyQ-HQ"), ALLOW, BLOCK)?.changes).toEqual([]);
    expect(parseGithubEvent("workflow_run", run("shinyq/shinyq-hq"), ALLOW, BLOCK)?.changes[0]).toMatchObject({ type: "run", id: 44, status: "failure" });
  });

  it("reports a privatized allowlisted repository even though it is now private", () => {
    const event = (full: string) => ({ action: "privatized", repository: repository({ full_name: full, private: true }) });
    expect(parseGithubEvent("repository", event("ShinyQ/ShinyQ-HQ"), ALLOW, BLOCK)).toEqual({ repo: "ShinyQ/ShinyQ-HQ", changes: [{ type: "privatized" }] });
    expect(parseGithubEvent("repository", event("client/app"), ALLOW, BLOCK)).toBeNull();
    expect(parseGithubEvent("repository", { action: "edited", repository: repository({ private: true }) }, ALLOW, BLOCK)).toBeNull();
  });
});
