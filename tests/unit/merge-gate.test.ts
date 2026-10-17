import { describe, expect, it } from "vitest";
import { REQUIRED_CHECKS, checksVerdict, decideFastPath, mergedPrFor, requiredFromRules, type GateCheckRun, type MergedPr } from "../../scripts/merge-gate";

const repo = "o/r";
const pr = (over: Partial<MergedPr> = {}): MergedPr => ({
  number: 7,
  merged_at: "2026-10-18T00:00:00Z",
  merge_commit_sha: "m1",
  html_url: "https://github.com/o/r/pull/7",
  base: { ref: "main" },
  head: { sha: "h1", repo: { full_name: repo } },
  ...over,
});
const check = (name: string, conclusion: string | null, id = 1, slug = "github-actions", status = "completed"): GateCheckRun => ({ id, name, status, conclusion, app: { slug } });
const allGreen = () => REQUIRED_CHECKS.map((name, i) => check(name, "success", i + 1));

describe("merged pull request for a main commit", () => {
  it("finds the same-repository PR merged into main as this commit", () => {
    expect(mergedPrFor("m1", [pr()], repo)?.number).toBe(7);
  });

  it("ignores open PRs, other bases, other merge commits and forks", () => {
    expect(mergedPrFor("m1", [pr({ merged_at: null })], repo)).toBeUndefined();
    expect(mergedPrFor("m1", [pr({ base: { ref: "dev" } })], repo)).toBeUndefined();
    expect(mergedPrFor("m1", [pr({ merge_commit_sha: "m2" })], repo)).toBeUndefined();
    expect(mergedPrFor("m1", [pr({ head: { sha: "h1", repo: { full_name: "fork/r" } } })], repo)).toBeUndefined();
    expect(mergedPrFor("m1", [pr({ head: { sha: "h1", repo: null } })], repo)).toBeUndefined();
  });
});

describe("required checks on the PR head", () => {
  it("passes when every required check is green", () => {
    expect(checksVerdict(REQUIRED_CHECKS, allGreen())).toEqual({ ok: true });
  });

  it("uses the newest attempt per check name (a rerun after a flake)", () => {
    const runs = [...allGreen(), check("Lighthouse CI", "failure", 0)];
    expect(checksVerdict(REQUIRED_CHECKS, runs)).toEqual({ ok: true });
    const later = [...allGreen(), check("Lighthouse CI", "failure", 99)];
    expect(checksVerdict(REQUIRED_CHECKS, later)).toEqual({ ok: false, missing: [], failed: ["Lighthouse CI"] });
  });

  it("only trusts GitHub Actions check runs", () => {
    const runs = allGreen().filter((r) => r.name !== "Build, CV and e2e");
    runs.push(check("Build, CV and e2e", "success", 50, "someone-else"));
    expect(checksVerdict(REQUIRED_CHECKS, runs)).toEqual({ ok: false, missing: ["Build, CV and e2e"], failed: [] });
  });

  it("reports missing, unfinished and red checks", () => {
    const runs = allGreen().filter((r) => r.name !== "3D perf gates 2/2");
    runs.push(check("3D perf gates 2/2", null, 60, "github-actions", "in_progress"));
    runs.push(check("Typecheck, lint, unit tests", "cancelled", 61));
    expect(checksVerdict([...REQUIRED_CHECKS, "New check"], runs)).toEqual({ ok: false, missing: ["New check"], failed: ["Typecheck, lint, unit tests", "3D perf gates 2/2"] });
  });

  it("reads the required checks from the branch rules, else the known five", () => {
    const rules = [{ type: "deletion" }, { type: "required_status_checks", parameters: { required_status_checks: [{ context: "A" }, { context: "B" }] } }];
    expect(requiredFromRules(rules)).toEqual(["A", "B"]);
    expect(requiredFromRules([{ type: "deletion" }])).toEqual([...REQUIRED_CHECKS]);
  });
});

describe("fast-path verdict", () => {
  const base = { mergedTree: "t1", prTree: "t1", pr: pr(), checks: { ok: true as const } };

  it("deploys at once when the merged PR was green on the same tree", () => {
    const verdict = decideFastPath(base);
    expect(verdict.fast).toBe(true);
    expect(verdict.fast && verdict.pr).toBe(7);
  });

  it("waits for main CI while a deploy-rollback issue is open", () => {
    expect(decideFastPath({ ...base, blockedBy: 12 })).toEqual({ fast: false, note: expect.stringContaining("#12") });
  });

  it("waits for main CI without a merged PR, on another tree, or with red checks", () => {
    expect(decideFastPath({ ...base, pr: undefined }).fast).toBe(false);
    expect(decideFastPath({ ...base, prTree: "t2" })).toEqual({ fast: false, note: expect.stringContaining("tree") });
    expect(decideFastPath({ ...base, checks: { ok: false, missing: ["Lighthouse CI"], failed: ["3D perf gates 1/2"] } })).toEqual({ fast: false, note: expect.stringContaining("Lighthouse CI") });
  });
});
