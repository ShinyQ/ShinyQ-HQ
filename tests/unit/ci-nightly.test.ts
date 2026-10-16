import { describe, expect, it } from "vitest";
import { applyNightlyAction, failedFromBody, failedJobs, findOpenIssue, type GitHubCall, ISSUE_TITLE, NIGHTLY_LABEL, nightlyAction, nightlyBody, parseNeeds, summaryMarkdown } from "../../scripts/ci-nightly";

const ctx = { runUrl: "https://x/runs/1", sha: "abc1234def", checkedAt: "2026-10-18T20:40:00Z" };

describe("nightly CI issue", () => {
  it("lists failed and cancelled jobs, not skipped ones", () => {
    expect(failedJobs({ e2e: { result: "failure" }, perf: { result: "success" }, visual: { result: "skipped" }, lighthouse: { result: "cancelled" } })).toEqual(["e2e", "lighthouse"]);
  });
  it("opens one issue on failure", () => {
    const a = nightlyAction(["e2e"], null, ctx);
    expect(a.kind).toBe("open");
    if (a.kind === "open") expect(a.body).toContain("https://x/runs/1");
  });
  it("updates the open issue on another failure", () => {
    expect(nightlyAction(["perf"], { number: 7 }, ctx)).toMatchObject({ kind: "update", number: 7 });
  });
  it("closes the open issue on recovery and does nothing when green", () => {
    expect(nightlyAction([], { number: 7 }, ctx)).toMatchObject({ kind: "close", number: 7 });
    expect(nightlyAction([], null, ctx)).toEqual({ kind: "none" });
  });

  it("comments only when the failed job set changed", () => {
    const body = nightlyBody(["e2e", "perf"], ctx);
    const same = nightlyAction(["perf", "e2e"], { number: 7, body }, ctx);
    expect(same).toEqual({ kind: "update", number: 7, body: nightlyBody(["perf", "e2e"], ctx) });
    const changed = nightlyAction(["visual"], { number: 7, body }, ctx);
    expect(changed).toMatchObject({ kind: "update", number: 7 });
    if (changed.kind === "update") expect(changed.comment).toContain("`visual`");
    const unknown = nightlyAction(["perf"], { number: 7 }, ctx);
    if (unknown.kind === "update") expect(unknown.comment).toBeDefined();
  });

  it("writes the failed jobs with their result, the short commit, the time and the closing rule", () => {
    const body = nightlyBody(["e2e", "lighthouse"], { ...ctx, results: { e2e: "failure", lighthouse: "cancelled" } });
    expect(failedFromBody(body)).toEqual(["e2e", "lighthouse"]);
    expect(body).toContain("| `e2e` | failure |");
    expect(body).toContain("| `lighthouse` | cancelled |");
    expect(body).toContain("abc1234");
    expect(body).not.toContain("abc1234def");
    expect(body).toContain("2026-10-18T20:40:00Z");
    expect(body).toContain("The next green nightly closes this issue.");
    expect(body).not.toContain("visual-gate-diffs");
    expect(nightlyBody(["visual"], ctx)).toContain("visual-gate-diffs");
    expect(ISSUE_TITLE).toBe("Nightly CI failed on main");
  });

  it("parses toJSON(needs) and refuses a missing or malformed value", () => {
    expect(parseNeeds('{"e2e":{"result":"failure","outputs":{}},"perf":{"result":"success","outputs":{}}}')).toEqual({ e2e: { result: "failure" }, perf: { result: "success" } });
    expect(parseNeeds('{"x":{}}')).toEqual({ x: { result: "unknown" } });
    expect(() => parseNeeds(undefined)).toThrow(/NEEDS/);
    expect(() => parseNeeds("[]")).toThrow(/NEEDS/);
    expect(summaryMarkdown({ e2e: { result: "failure" } }, "Done.")).toContain("| `e2e` | failure |");
  });
});

describe("applyNightlyAction and findOpenIssue", () => {
  function fakeGh(responses: Record<string, { status: number; data: unknown }> = {}) {
    const calls: [string, string, unknown?][] = [];
    const gh: GitHubCall = async (method, path, body) => {
      calls.push(body === undefined ? [method, path] : [method, path, body]);
      return responses[`${method} ${path.split("?")[0]}`] ?? { status: 200, data: {} };
    };
    return { gh, calls };
  }

  it("finds the open labelled issue and ignores pull requests", async () => {
    const { gh, calls } = fakeGh({ "GET /repos/o/r/issues": { status: 200, data: [{ number: 3, body: "b", pull_request: {} }, { number: 5, body: null }] } });
    expect(await findOpenIssue(gh, "o/r")).toEqual({ number: 5, body: "" });
    expect(calls[0][1]).toBe(`/repos/o/r/issues?labels=${NIGHTLY_LABEL}&state=open&per_page=20`);
  });

  it("opens with the label, updates, comments and closes", async () => {
    const open = fakeGh({ "POST /repos/o/r/labels": { status: 422, data: {} }, "POST /repos/o/r/issues": { status: 201, data: { html_url: "https://i/9" } } });
    expect(await applyNightlyAction(open.gh, "o/r", { kind: "open", title: ISSUE_TITLE, body: "B" })).toContain("https://i/9");
    expect(open.calls[1][2]).toEqual({ title: ISSUE_TITLE, body: "B", labels: ["ci-nightly"] });
    const update = fakeGh();
    await applyNightlyAction(update.gh, "o/r", { kind: "update", number: 7, body: "B" });
    expect(update.calls).toEqual([["PATCH", "/repos/o/r/issues/7", { body: "B" }]]);
    const close = fakeGh();
    await applyNightlyAction(close.gh, "o/r", { kind: "close", number: 7, comment: "C" });
    expect(close.calls).toEqual([
      ["POST", "/repos/o/r/issues/7/comments", { body: "C" }],
      ["PATCH", "/repos/o/r/issues/7", { state: "closed", state_reason: "completed" }],
    ]);
  });

  it("throws on a GitHub error", async () => {
    const { gh } = fakeGh({ "PATCH /repos/o/r/issues/7": { status: 403, data: { message: "no" } } });
    await expect(applyNightlyAction(gh, "o/r", { kind: "update", number: 7, body: "B" })).rejects.toThrow(/HTTP 403/);
  });
});
