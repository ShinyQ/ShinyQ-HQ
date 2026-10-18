import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { OfficeBeatV1 } from "@/lib/office/protocol";
import { hmacHex, signatureOk } from "../../workers/office/src/crypto";
import { cleanTitle, parseAllowlist, parseGithubEvent, repoAllowed, sanitizeBeat } from "../../workers/office/src/ingest";

const ALLOW = parseAllowlist(" ShinyQ/* , other/one ");
const BLOCK = ["acme bank"];
const repository = (extra: Record<string, unknown> = {}) => ({ full_name: "ShinyQ/ShinyQ-HQ", private: false, default_branch: "main", ...extra });

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
});

describe("parseGithubEvent", () => {
  it("ignores private and non-allowlisted repositories", () => {
    expect(parseGithubEvent("ping", { repository: repository({ private: true }) }, ALLOW, BLOCK)).toBeNull();
    expect(parseGithubEvent("ping", { repository: repository({ full_name: "client/app" }) }, ALLOW, BLOCK)).toBeNull();
    expect(parseGithubEvent("ping", { repository: repository() }, ALLOW, BLOCK)).toEqual({ repo: "ShinyQ/ShinyQ-HQ", changes: [] });
  });

  it("maps workflow_run and workflow_job", () => {
    const run = (status: string, conclusion: string | null) => ({ repository: repository(), workflow_run: { id: 42, name: "CI", head_branch: "feat/x", status, conclusion, html_url: "https://github.com/ShinyQ/ShinyQ-HQ/actions/runs/42" } });
    expect(parseGithubEvent("workflow_run", run("in_progress", null), ALLOW, BLOCK)?.changes).toEqual([{ type: "run", id: 42, branch: "feat/x", title: "CI · feat/x", url: "https://github.com/ShinyQ/ShinyQ-HQ/actions/runs/42", status: "running" }]);
    expect(parseGithubEvent("workflow_run", run("completed", "success"), ALLOW, BLOCK)?.changes[0]).toMatchObject({ status: "success" });
    expect(parseGithubEvent("workflow_run", run("completed", "timed_out"), ALLOW, BLOCK)?.changes[0]).toMatchObject({ status: "failure" });
    expect(parseGithubEvent("workflow_run", run("completed", "cancelled"), ALLOW, BLOCK)?.changes[0]).toMatchObject({ status: "cancelled" });
    const job = { repository: repository(), workflow_job: { id: 7, run_id: 42, name: "E2E shard 3/8", status: "completed", conclusion: "failure" } };
    expect(parseGithubEvent("workflow_job", job, ALLOW, BLOCK)?.changes).toEqual([{ type: "job", runId: 42, jobId: "7", name: "E2E shard 3/8", status: "failed" }]);
  });

  it("maps pull requests, default-branch pushes and deployments", () => {
    const pr = (action: string, merged: boolean) => ({ action, number: 7, repository: repository(), pull_request: { number: 7, merged, title: "feat: office", html_url: "https://github.com/ShinyQ/ShinyQ-HQ/pull/7", head: { ref: "feat/office" } } });
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
    const pr = { action: "opened", number: 8, repository: repository(), pull_request: { number: 8, merged: false, title: "Acme Bank fix", html_url: "javascript:alert(1)", head: { ref: "fix/y" } } };
    expect(parseGithubEvent("pull_request", pr, ALLOW, BLOCK)?.changes[0]).toMatchObject({ title: "Pull request #8", url: "https://github.com/ShinyQ/ShinyQ-HQ" });
  });
});
