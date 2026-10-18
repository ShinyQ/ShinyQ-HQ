import { describe, expect, it } from "vitest";
import { complementPlan, findSource, parseRecord, perfSeconds, perfShardsFor, recordFor, type PlanRecord, type SourceDeps } from "../../scripts/ci-complement";
import { LIGHTHOUSE_PAGES, lookupComplement, planFor, planOutputs } from "../../scripts/ci-plan";
import { ALL_SPECS } from "../../scripts/e2e-plan";
import { ALL_BUT_MEMORY, ALL_PERF_KEYS } from "../../scripts/perf-plan";

const paths = Object.keys(LIGHTHOUSE_PAGES);
const source = { run: 7, pr: 210, url: "https://github.com/o/r/actions/runs/7" };
const opts = { lighthousePaths: paths };

describe("recordFor", () => {
  it("records a full run as all", () => {
    const plan = planFor(null, () => false);
    expect(recordFor(plan, planOutputs(plan))).toEqual({ version: 1, e2e: "all", perf: "all", lighthouse: "all" });
  });
  it("records the specs, smoke tests, perf keys and Lighthouse paths of a selective run", () => {
    const plan = { ...planFor(null, () => false), full: false, e2e: ["ask" as const], e2eTests: ["e2e/ride.spec.ts:93"], perf: ["bytes" as const], lighthouse: ["/en"] };
    const urls = ["http://h/en?lhci-warmup=1", "http://h/en"];
    expect(recordFor(plan, planOutputs(plan, urls))).toEqual({ version: 1, e2e: { specs: ["ask"], tests: ["e2e/ride.spec.ts:93"] }, perf: ["bytes"], lighthouse: ["/en"] });
  });
  it("records no heavy work as empty lists", () => {
    const plan = { ...planFor(null, () => false), full: false, e2e: [], e2eTests: [], perf: false as const, lighthouse: false as const };
    expect(recordFor(plan, planOutputs(plan))).toEqual({ version: 1, e2e: { specs: [], tests: [] }, perf: [], lighthouse: [] });
  });
});

describe("parseRecord", () => {
  it("round-trips a record and rejects anything else", () => {
    const r: PlanRecord = { version: 1, e2e: { specs: ["ask"], tests: [] }, perf: ["bytes"], lighthouse: "all" };
    expect(parseRecord(JSON.stringify(r))).toEqual(r);
    expect(parseRecord("nope")).toBeNull();
    expect(parseRecord(JSON.stringify({ ...r, version: 2 }))).toBeNull();
    expect(parseRecord(JSON.stringify({ ...r, perf: ["warp"] }))).toBeNull();
    expect(parseRecord(JSON.stringify({ ...r, e2e: { specs: ["nope"], tests: [] } }))).toBeNull();
  });
});

describe("complementPlan", () => {
  it("runs nothing heavy after a full PR run, and still counts as complete", () => {
    const plan = complementPlan({ version: 1, e2e: "all", perf: "all", lighthouse: "all" }, source, opts);
    const out = planOutputs(plan);
    expect(out).toMatchObject({ full: "true", e2e: "none", perf: "false", lighthouse: "false", source_run: "7" });
  });
  it("runs the specs, perf keys and URLs the PR run did not, and partly run specs whole", () => {
    const record: PlanRecord = { version: 1, e2e: { specs: ["ask", "seo"], tests: ["e2e/ride.spec.ts:93"] }, perf: [...ALL_BUT_MEMORY], lighthouse: ["/en", "/id"] };
    const plan = complementPlan(record, source, opts);
    expect(plan.e2e).toEqual(ALL_SPECS.filter((s) => s !== "ask" && s !== "seo"));
    expect(plan.e2e).toContain("ride");
    expect(plan.perf).toEqual(["memory"]);
    expect(plan.lighthouse).toEqual(paths.filter((p) => p !== "/en" && p !== "/id"));
    expect(plan.e2eShards).toBe(8);
    expect(plan.perfShards).toBe(1);
  });
  it("runs everything when the PR run ran no heavy job", () => {
    const plan = complementPlan({ version: 1, e2e: { specs: [], tests: [] }, perf: [], lighthouse: [] }, source, opts);
    expect(plan.e2e).toBe("all");
    expect(plan.perf).toEqual([...ALL_PERF_KEYS]);
    expect(plan.lighthouse).toBe("all");
    expect(plan.perfShards).toBe(4);
  });
  it("says so when the PR run listed every spec whole", () => {
    const plan = complementPlan({ version: 1, e2e: { specs: [...ALL_SPECS], tests: [] }, perf: "all", lighthouse: "all" }, source, opts);
    expect(plan.e2e).toEqual([]);
    expect(plan.reasons).toContain("e2e: the PR run ran every spec whole");
  });
  it("covers every spec, perf key and URL together with the record", () => {
    const record: PlanRecord = { version: 1, e2e: { specs: ["hud", "labs"], tests: [] }, perf: ["bytes", "floor:L3"], lighthouse: ["/en/quick"] };
    const plan = complementPlan(record, source, opts);
    const e2e = new Set([...(record.e2e as { specs: string[] }).specs, ...(plan.e2e as string[])]);
    expect([...e2e].sort()).toEqual([...ALL_SPECS].sort());
    expect(new Set([...(record.perf as string[]), ...(plan.perf || [])]).size).toBe(ALL_PERF_KEYS.length);
    expect(new Set([...(record.lighthouse as string[]), ...(plan.lighthouse as string[])]).size).toBe(paths.length);
  });
});

describe("perf sizing", () => {
  const durations = { "memory-full.spec.ts › full tier, Motion Full: Lobby to Roof round trips leave renderer memory at its baseline": 900, "floors.spec.ts › L1 full: settled draw calls and shader programs": 156 };
  it("sums the durations of the tests the keys grep", () => {
    expect(perfSeconds(durations, ["memory"])).toBe(900);
    expect(perfSeconds(durations, [...ALL_PERF_KEYS])).toBe(1056);
  });
  it("sizes ceil(seconds / 960), 1 to 4", () => {
    expect(perfShardsFor(0)).toBe(1);
    expect(perfShardsFor(900)).toBe(1);
    expect(perfShardsFor(3211)).toBe(4);
    expect(perfShardsFor(99999)).toBe(4);
  });
});

describe("findSource", () => {
  const repo = "o/r";
  const pr = { number: 210, merged_at: "x", merge_commit_sha: "m", html_url: "u", base: { ref: "main" }, head: { sha: "h", repo: { full_name: repo } } };
  const record: PlanRecord = { version: 1, e2e: "all", perf: "all", lighthouse: "all" };
  const deps = (over: Partial<SourceDeps> = {}): SourceDeps => ({
    pullsFor: async () => [pr],
    pull: async () => pr,
    treeOf: async () => "t",
    greenRuns: async () => [{ id: 7, html_url: "r7", event: "pull_request", head_repository: { full_name: repo } }],
    record: async () => record,
    ...over,
  });
  it("finds the newest green same-repo PR run on the same tree", async () => {
    expect(await findSource(repo, "m", null, deps())).toEqual({ ok: true, source: { run: 7, pr: 210, url: "r7" }, record });
  });
  it("uses the given pull request for a dispatch", async () => {
    expect(await findSource(repo, "x", 210, deps({ pullsFor: async () => [] }))).toMatchObject({ ok: true });
  });
  it.each([
    ["no merged PR", { pullsFor: async () => [] }],
    ["a different tree", { treeOf: async (s: string) => (s === "h" ? "t1" : "t2") }],
    ["no green PR run", { greenRuns: async () => [] }],
    ["a fork run", { greenRuns: async () => [{ id: 7, html_url: "r7", event: "pull_request", head_repository: { full_name: "fork/r" } }] }],
    ["no record", { record: async () => null }],
  ])("falls back on %s", async (_, over) => {
    expect((await findSource(repo, "m", null, deps(over as Partial<SourceDeps>))).ok).toBe(false);
  });
  it("rejects when a dep throws, and lookupComplement turns that into a full run with the reason", async () => {
    const failing = deps({ greenRuns: async () => Promise.reject(new Error("GitHub API actions/workflows/ci.yml/runs: HTTP 502")) });
    await expect(findSource(repo, "m", null, failing)).rejects.toThrow("HTTP 502");
    const plan = await lookupComplement(() => findSource(repo, "m", null, failing), () => planFor(null, () => false, { event: "other" }));
    expect(plan.source).toBeUndefined();
    expect(plan.reasons[0]).toBe("full run: GitHub API actions/workflows/ci.yml/runs: HTTP 502");
    expect(planOutputs(plan)).toMatchObject({ full: "true", e2e: "all", perf: "true", perf_grep: "", lighthouse: "true", lighthouse_urls: "", source_run: "" });
  });
  it("lookupComplement plans the complement of a found run", async () => {
    const plan = await lookupComplement(() => findSource(repo, "m", null, deps()), () => planFor(null, () => false));
    expect(plan.source).toEqual({ run: 7, pr: 210, url: "r7" });
    expect(planOutputs(plan)).toMatchObject({ e2e: "none", perf: "false", lighthouse: "false", source_run: "7" });
  });
});
