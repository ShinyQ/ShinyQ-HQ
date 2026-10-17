import { describe, expect, it } from "vitest";
import { CI_CHECK, CI_FULL_ARTIFACT, ciRunning, runIdFromUrl, sameTreeRun, trustedRun, verdictFromChecks, type CheckRun } from "../../scripts/ci-status";

const run = (status: string, conclusion: string | null, url = "https://github.com/o/r/runs/1", name = CI_CHECK): CheckRun => ({ name, status, conclusion, html_url: url });

describe("deploy reuses the CI result", () => {
  it("reuses a green aggregate check", () => {
    expect(verdictFromChecks([run("completed", "success", "u1")])).toEqual({ kind: "reuse", url: "u1" });
  });

  it("prefers a green attempt over a red one (a rerun after a flake)", () => {
    expect(verdictFromChecks([run("completed", "failure", "u1"), run("completed", "success", "u2")])).toEqual({ kind: "reuse", url: "u2" });
  });

  it("waits while CI runs", () => {
    expect(verdictFromChecks([run("in_progress", null)])).toEqual({ kind: "wait" });
    expect(verdictFromChecks([run("queued", null), run("completed", "failure")])).toEqual({ kind: "wait" });
  });

  it("fails on a red CI", () => {
    expect(verdictFromChecks([run("completed", "failure", "u3")])).toEqual({ kind: "red", url: "u3", conclusion: "failure" });
    expect(verdictFromChecks([run("completed", "timed_out", "u4")])).toEqual({ kind: "red", url: "u4", conclusion: "timed_out" });
  });

  it("treats cancelled, skipped and other checks as no result", () => {
    expect(verdictFromChecks([run("completed", "cancelled"), run("completed", "skipped")])).toEqual({ kind: "missing" });
    expect(verdictFromChecks([run("completed", "success", "u5", "Lighthouse CI")])).toEqual({ kind: "missing" });
    expect(verdictFromChecks([])).toEqual({ kind: "missing" });
  });

  it("finds a green run that tested the same tree", () => {
    const runs = [
      { head_sha: "a1", tree: "t1", html_url: "r1" },
      { head_sha: "b2", tree: "t2", html_url: "r2" },
    ];
    expect(sameTreeRun("t2", runs)?.html_url).toBe("r2");
    expect(sameTreeRun("t3", runs)).toBeUndefined();
  });

  it("only trusts CI runs of this repository: pushes to main and pull requests from its own branches", () => {
    const repo = "o/r";
    expect(trustedRun({ event: "push", head_branch: "main", head_repository: { full_name: repo } }, repo)).toBe(true);
    expect(trustedRun({ event: "pull_request", head_branch: "chore/facts", head_repository: { full_name: repo } }, repo)).toBe(true);
    expect(trustedRun({ event: "pull_request", head_branch: "main", head_repository: { full_name: "fork/r" } }, repo)).toBe(false);
    expect(trustedRun({ event: "push", head_branch: "feature", head_repository: { full_name: repo } }, repo)).toBe(false);
    expect(trustedRun({ event: "workflow_dispatch", head_branch: "main", head_repository: { full_name: repo } }, repo)).toBe(false);
    expect(trustedRun({ event: "pull_request", head_branch: "x", head_repository: null }, repo)).toBe(false);
  });

  it("waits while a CI run on the commit has not reached the aggregate job", () => {
    expect(ciRunning([{ status: "in_progress" }])).toBe(true);
    expect(ciRunning([{ status: "queued" }, { status: "completed" }])).toBe(true);
    expect(ciRunning([{ status: "completed" }])).toBe(false);
    expect(ciRunning([])).toBe(false);
  });

  it("reuses a green check only from a complete run, but a red selective check still fails", () => {
    const complete = (c: CheckRun) => c.html_url !== "smart";
    expect(verdictFromChecks([run("completed", "success", "smart")], complete)).toEqual({ kind: "missing" });
    expect(verdictFromChecks([run("completed", "success", "smart"), run("completed", "success", "full")], complete)).toEqual({ kind: "reuse", url: "full" });
    expect(verdictFromChecks([run("completed", "failure", "smart")], complete)).toEqual({ kind: "red", url: "smart", conclusion: "failure" });
    expect(verdictFromChecks([run("completed", "failure", "smart"), run("completed", "success", "full")], complete)).toEqual({ kind: "reuse", url: "full" });
    expect(verdictFromChecks([run("completed", "success", "smart"), run("completed", "failure", "full")], complete)).toEqual({ kind: "red", url: "full", conclusion: "failure" });
    expect(verdictFromChecks([run("in_progress", null, "smart")], complete)).toEqual({ kind: "wait" });
  });

  it("reads the run id from a check run URL", () => {
    expect(runIdFromUrl("https://github.com/o/r/actions/runs/123/job/456")).toBe(123);
    expect(runIdFromUrl("https://github.com/o/r/actions/runs/123?pr=1")).toBe(123);
    expect(runIdFromUrl("https://github.com/o/r/actions/runs/123/job/456#step:3:1")).toBe(123);
    expect(runIdFromUrl("https://github.com/o/r/actions/runs/123#step")).toBe(123);
    expect(runIdFromUrl("https://github.com/o/r/actions/runs/123")).toBe(123);
    expect(runIdFromUrl("https://github.com/o/r/actions/runs/123abc")).toBeNull();
    expect(runIdFromUrl("https://github.com/o/r/runs/1")).toBeNull();
  });

  it("names the marker artifact CI uploads on a complete run", () => {
    expect(CI_FULL_ARTIFACT).toBe("ci-full");
  });
});
