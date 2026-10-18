import { describe, expect, it } from "vitest";
import { parseOfficeResponse, type OfficeBeatV1 } from "@/lib/office/protocol";
import { applyBeat, applyGithub, assignSlots, emptyDoc, effective, TIMING, view, type OfficeDoc, type SessionRecord } from "../../workers/office/src/state";

const T0 = Date.UTC(2026, 9, 18, 8, 0, 0);
const HQ = "ShinyQ/ShinyQ-HQ";
const sid = (n: number) => n.toString(16).padStart(64, "0");
const beat = (n: number, extra: Partial<OfficeBeatV1> = {}): OfficeBeatV1 => ({ v: 1, agent: "copilot", session: sid(n), state: "working", activity: "editing", ts: T0, ...extra });
const publicDoc = (): OfficeDoc => applyGithub(emptyDoc(T0), { repo: HQ, changes: [] }, "ping-1", T0);

describe("time rules", () => {
  const rec = (extra: Partial<SessionRecord>): SessionRecord => ({ id: sid(1), agent: "claude", slot: 0, firstSeen: T0, lastBeat: T0, state: "working", activity: "editing", since: T0, recent: [], ...extra });

  it("shows thinking after a quiet 20 s while working or reviewing", () => {
    expect(effective(rec({}), T0 + TIMING.thinkingAfter - 1)?.state).toBe("working");
    expect(effective(rec({}), T0 + TIMING.thinkingAfter)).toEqual({ state: "thinking", activity: "planning", since: T0 + TIMING.thinkingAfter });
    expect(effective(rec({ state: "reviewing", activity: "reading" }), T0 + 30_000)?.state).toBe("thinking");
  });

  it("falls asleep after 3 min, or 15 min while testing, on CI or waiting for input", () => {
    expect(effective(rec({}), T0 + TIMING.asleepAfter)).toEqual({ state: "asleep", activity: "resting", since: T0 + TIMING.asleepAfter });
    expect(effective(rec({ state: "testing", activity: "testing" }), T0 + TIMING.asleepAfter)?.state).toBe("testing");
    expect(effective(rec({ state: "ci", activity: "ci" }), T0 + TIMING.longWaitAsleepAfter)?.state).toBe("asleep");
  });

  it("shows done for 20 s, holds failed, removes after 30 min", () => {
    expect(effective(rec({ state: "done", activity: "finished" }), T0 + 19_000)?.state).toBe("done");
    expect(effective(rec({ state: "done", activity: "finished" }), T0 + 20_000)?.state).toBe("asleep");
    expect(effective(rec({ state: "failed", activity: "failed" }), T0 + 10 * 60_000)?.state).toBe("failed");
    expect(effective(rec({}), T0 + TIMING.removeAfter)).toBeNull();
  });
});

describe("desks", () => {
  it("keeps slots stable and counts sessions beyond five as extra", () => {
    let doc = emptyDoc(T0);
    for (let n = 1; n <= 6; n++) doc = applyBeat(doc, beat(n), T0 + n);
    const snap = view(doc, T0 + 10);
    expect(snap.desks.map((d) => d.slot)).toEqual([0, 1, 2, 3, 4]);
    expect(snap.extra).toBe(1);
    doc = applyBeat(doc, beat(3, { state: "testing", activity: "testing" }), T0 + 20);
    expect(view(doc, T0 + 21).desks[2]).toMatchObject({ slot: 2, state: "testing" });
  });

  it("lets a waiting awake session take the longest-asleep desk", () => {
    const at = (lastBeat: number, slot: number | null, n: number, state: SessionRecord["state"]): SessionRecord => ({ id: sid(n), agent: "codex", slot, firstSeen: n, lastBeat, state, activity: state === "asleep" ? "resting" : "editing", since: lastBeat, recent: [] });
    const out = assignSlots([at(T0 - 5 * 60_000, 0, 1, "working"), at(T0 - 4 * 60_000, 1, 2, "working"), at(T0, 2, 3, "working"), at(T0, 3, 4, "working"), at(T0, 4, 5, "working"), at(T0, null, 6, "working")], T0);
    expect(out.find((s) => s.id === sid(6))?.slot).toBe(0);
    expect(out.find((s) => s.id === sid(1))?.slot).toBeNull();
  });
});

describe("applyBeat", () => {
  it("keeps repository and title only for repositories a webhook reported public", () => {
    const withRepo = beat(1, { repo: HQ, branch: "feat/x", title: "X" });
    expect(view(applyBeat(emptyDoc(T0), withRepo, T0), T0).desks[0]).not.toHaveProperty("repo");
    expect(view(applyBeat(publicDoc(), withRepo, T0), T0).desks[0]).toMatchObject({ repo: HQ, title: "X" });
  });

  it("records state changes in recent (newest first, five at most) and counts tasks done once", () => {
    let doc = emptyDoc(T0);
    const states: OfficeBeatV1["state"][] = ["thinking", "working", "testing", "working", "reviewing", "done", "done"];
    states.forEach((state, i) => (doc = applyBeat(doc, beat(1, { state }), T0 + i * 1000)));
    const desk = view(doc, T0 + 7000).desks[0];
    expect(desk.recent.map((r) => r.state)).toEqual(["done", "reviewing", "working", "testing", "working"]);
    expect(desk.since).toBe(T0 + 5000);
    expect(view(doc, T0 + 7000).today.tasksDone).toBe(1);
  });

  it("resets today at 00:00 WIB", () => {
    const doc = applyBeat(emptyDoc(T0), beat(1, { state: "done", activity: "finished" }), T0);
    const next = Date.UTC(2026, 9, 18, 17, 0, 0);
    expect(view(doc, next).today).toEqual({ day: "2026-10-19", tasksDone: 0, prsMerged: 0, ciRuns: 0, ciGreen: 0 });
  });
});

describe("applyGithub", () => {
  const run = (status: "running" | "success" | "failure" | "cancelled") => ({ type: "run" as const, id: 42, branch: "feat/x", title: "CI · feat/x", url: "https://github.com/ShinyQ/ShinyQ-HQ/actions/runs/42", status });

  it("tracks job progress for the desk on that branch and counts CI runs once", () => {
    let doc = applyBeat(publicDoc(), beat(1, { repo: HQ, branch: "feat/x", state: "ci", activity: "ci" }), T0);
    doc = applyGithub(doc, { repo: HQ, changes: [run("running")] }, "d1", T0);
    doc = applyGithub(doc, { repo: HQ, changes: [{ type: "job", runId: 42, jobId: "1", name: "Lint", status: "done" }, { type: "job", runId: 42, jobId: "2", name: "E2E", status: "running" }] }, "d2", T0);
    const snap = view(doc, T0);
    expect(snap.desks[0].progress).toEqual({ done: 1, total: 2 });
    expect(snap.github[0]).toMatchObject({ kind: "run", status: "running", progress: { done: 1, total: 2 } });
    doc = applyGithub(doc, { repo: HQ, changes: [run("success")] }, "d3", T0);
    doc = applyGithub(doc, { repo: HQ, changes: [run("success")] }, "d3", T0);
    expect(view(doc, T0).today).toMatchObject({ ciRuns: 1, ciGreen: 1 });
  });

  it("fails the waiting desk with the failed job's name", () => {
    let doc = applyBeat(publicDoc(), beat(1, { repo: HQ, branch: "feat/x", state: "ci", activity: "ci" }), T0);
    doc = applyGithub(doc, { repo: HQ, changes: [run("running"), { type: "job", runId: 42, jobId: "9", name: "E2E shard 3/8", status: "failed" }] }, "d1", T0);
    doc = applyGithub(doc, { repo: HQ, changes: [run("failure")] }, "d2", T0 + 1000);
    expect(view(doc, T0 + 2000).desks[0]).toMatchObject({ state: "failed", activity: "failed", job: "E2E shard 3/8" });
  });

  it("uses the PR title for the desk's branch, counts merges and drops cancelled runs", () => {
    let doc = applyBeat(publicDoc(), beat(1, { repo: HQ, branch: "feat/x", title: "X" }), T0);
    doc = applyGithub(doc, { repo: HQ, changes: [{ type: "pr", number: 7, branch: "feat/x", title: "feat: the real title", url: "https://github.com/ShinyQ/ShinyQ-HQ/pull/7", action: "merged" }] }, "p1", T0);
    expect(view(doc, T0).desks[0].title).toBe("feat: the real title");
    expect(view(doc, T0).today.prsMerged).toBe(1);
    doc = applyGithub(doc, { repo: HQ, changes: [run("running")] }, "r1", T0);
    doc = applyGithub(doc, { repo: HQ, changes: [run("cancelled")] }, "r2", T0);
    expect(view(doc, T0).github.map((g) => g.kind)).toEqual(["pr"]);
  });

  it("ignores jobs of unknown runs, so jobs of dropped fork runs add no progress", () => {
    let doc = applyBeat(publicDoc(), beat(1, { repo: HQ, branch: "feat/x", state: "ci", activity: "ci" }), T0);
    doc = applyGithub(doc, { repo: HQ, changes: [run("running")] }, "d1", T0);
    const before = view(doc, T0);
    const after = applyGithub(doc, { repo: HQ, changes: [{ type: "job", runId: 999, jobId: "1", name: "Fork job", status: "failed" }] }, "d2", T0);
    expect(after.runs).toEqual(doc.runs);
    expect(view(after, T0)).toEqual(before);
  });

  it("forgets a privatized repository: no runs, pull requests, feed items or session details, and later beats lose their title", () => {
    let doc = applyBeat(publicDoc(), beat(1, { repo: HQ, branch: "feat/x", title: "X", state: "ci", activity: "ci" }), T0);
    doc = applyGithub(doc, { repo: "ShinyQ/other", changes: [{ type: "push", sha: "abc1234", title: "main · other", url: "https://github.com/ShinyQ/other" }] }, "o1", T0);
    doc = applyGithub(doc, { repo: HQ, changes: [run("running"), { type: "pr", number: 7, branch: "feat/x", title: "feat: x", url: "https://github.com/ShinyQ/ShinyQ-HQ/pull/7", action: "opened" }] }, "d1", T0);
    doc = applyGithub(doc, { repo: HQ, changes: [{ type: "privatized" }] }, "priv-1", T0 + 1);
    expect(doc.publicRepos).toEqual(["ShinyQ/other"]);
    expect(doc.runs).toEqual([]);
    expect(doc.prs).toEqual([]);
    expect(doc.feed.map((f) => f.repo)).toEqual(["ShinyQ/other"]);
    const desk = view(doc, T0 + 1).desks[0];
    expect(desk).not.toHaveProperty("repo");
    expect(desk).not.toHaveProperty("title");
    expect(doc.sessions[0]).not.toHaveProperty("branch");
    doc = applyBeat(doc, beat(1, { repo: HQ, branch: "feat/x", title: "X" }), T0 + 2);
    expect(view(doc, T0 + 2).desks[0]).not.toHaveProperty("title");
    expect(view(doc, T0 + 2).desks[0]).not.toHaveProperty("repo");
  });

  it("returns the same document for a repeated delivery", () => {
    const doc = publicDoc();
    expect(applyGithub(doc, { repo: HQ, changes: [] }, "ping-1", T0 + 1)).toBe(doc);
  });
});

describe("view", () => {
  it("is valid under the public contract, live with sessions and semi-live without", () => {
    const empty = view(publicDoc(), T0);
    expect(empty.mode).toBe("semi-live");
    expect(parseOfficeResponse(JSON.parse(JSON.stringify(empty)))).not.toBeNull();
    const live = view(applyBeat(publicDoc(), beat(1, { repo: HQ, branch: "feat/x", title: "X" }), T0), T0);
    expect(live.mode).toBe("live");
    expect(parseOfficeResponse(JSON.parse(JSON.stringify(live)))).not.toBeNull();
  });
});
