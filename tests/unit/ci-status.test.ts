import { describe, expect, it } from "vitest";
import { CI_CHECK, ciRunning, sameTreeRun, verdictFromChecks, type CheckRun } from "../../scripts/ci-status";

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

  it("waits while a CI run on the commit has not reached the aggregate job", () => {
    expect(ciRunning([{ status: "in_progress" }])).toBe(true);
    expect(ciRunning([{ status: "queued" }, { status: "completed" }])).toBe(true);
    expect(ciRunning([{ status: "completed" }])).toBe(false);
    expect(ciRunning([])).toBe(false);
  });
});
