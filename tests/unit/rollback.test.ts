import { describe, expect, it } from "vitest";
import { failingShaFrom, issueBody, needsRollback, pickTarget, resultComment, withFailingSha, type PagesDeployment } from "../../scripts/rollback";

const dep = (id: string, commit: string | null, created: string, over: Partial<PagesDeployment> = {}): PagesDeployment => ({
  id,
  environment: "production",
  created_on: created,
  url: `https://${id}.p.pages.dev`,
  latest_stage: { name: "deploy", status: "success" },
  deployment_trigger: { metadata: { commit_hash: commit } },
  ...over,
});

describe("whether production needs a rollback", () => {
  it("rolls back when the failing commit or a commit built on it is live and not green", () => {
    expect(needsRollback({ relation: "identical", liveGreen: false })).toBe(true);
    expect(needsRollback({ relation: "ahead", liveGreen: false })).toBe(true);
  });

  it("leaves production alone when the failure never went live, or a later green commit is live", () => {
    expect(needsRollback({ relation: "behind", liveGreen: false })).toBe(false);
    expect(needsRollback({ relation: "diverged", liveGreen: false })).toBe(false);
    expect(needsRollback({ relation: "ahead", liveGreen: true })).toBe(false);
  });
});

describe("rollback target", () => {
  const live = dep("live", "f1", "2026-10-18T10:00:00Z");
  const ancestors = new Set(["p1", "p2", "bad"]);
  const red = new Set(["bad"]);
  const probes = { isStrictAncestor: async (c: string) => ancestors.has(c), isRed: async (c: string) => red.has(c) };

  it("picks the newest earlier production deployment of an ancestor that is not red", async () => {
    const list = [live, dep("d-bad", "bad", "2026-10-18T09:00:00Z"), dep("d-p2", "p2", "2026-10-18T08:00:00Z"), dep("d-p1", "p1", "2026-10-18T07:00:00Z")];
    expect((await pickTarget(list, live, probes))?.id).toBe("d-p2");
  });

  it("skips newer deployments, failed uploads, previews, missing hashes and descendants of the failure", async () => {
    const list = [
      dep("newer", "p2", "2026-10-18T11:00:00Z"),
      dep("failed", "p2", "2026-10-18T09:30:00Z", { latest_stage: { name: "deploy", status: "failure" } }),
      dep("preview", "p2", "2026-10-18T09:20:00Z", { environment: "preview" }),
      dep("nohash", null, "2026-10-18T09:10:00Z"),
      dep("child", "f0", "2026-10-18T09:05:00Z"),
      dep("good", "p1", "2026-10-18T06:00:00Z"),
    ];
    expect((await pickTarget(list, live, probes))?.id).toBe("good");
  });

  it("finds nothing when no earlier deployment qualifies", async () => {
    expect(await pickTarget([live, dep("d-bad", "bad", "2026-10-18T09:00:00Z")], live, probes)).toBeUndefined();
  });
});

describe("deploy-rollback issue", () => {
  it("records the last failing commit in a hidden marker", () => {
    const body = issueBody("abc1234");
    expect(failingShaFrom(body)).toBe("abc1234");
    expect(failingShaFrom(withFailingSha(body, "def5678"))).toBe("def5678");
    expect(failingShaFrom("no marker")).toBeUndefined();
  });

  it("explains the rollback in the comment, with the failing run", () => {
    const text = resultComment({ sha: "f1", runUrl: "https://ci/run/1", result: { action: "rollback", note: "rolled back", live: { id: "live", commit: "f1" }, target: { id: "d-p2", commit: "p2", url: "u" }, dryRun: false } });
    expect(text).toContain("https://ci/run/1");
    expect(text).toContain("d-p2");
    expect(text).not.toMatch(/\u2014/);
  });
});
