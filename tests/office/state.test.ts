import { describe, expect, it } from "vitest";
import { OFFICE_DESKS, OFFICE_SEATS, parseOfficeResponse, parseOfficeResponseV2, parseOfficeResponseV3, type OfficeBeatV1 } from "@/lib/office/protocol";
import { applyBeat, applyGithub, assignSlots, effectiveHelpers, emptyDoc, effective, TIMING, view, viewV2, viewV3, type OfficeDoc, type SessionRecord } from "../../workers/office/src/state";

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

  const at = (lastBeat: number, slot: number | null, n: number, state: SessionRecord["state"]): SessionRecord => ({ id: sid(n), agent: "codex", slot, firstSeen: n, lastBeat, state, activity: state === "asleep" ? "resting" : "editing", since: lastBeat, recent: [] });

  it("lets a waiting awake session take the longest-asleep seat only when all ten are taken", () => {
    const ten = Array.from({ length: OFFICE_SEATS }, (_, n) => at(n < 2 ? T0 - (5 - n) * 60_000 : T0, n, n + 1, "working"));
    const out = assignSlots([...ten, at(T0, null, 11, "working")], T0);
    expect(out.find((s) => s.id === sid(11))?.slot).toBe(0);
    expect(out.find((s) => s.id === sid(1))?.slot).toBeNull();
    // With a free back-row seat the newcomer sits there and every sleeper keeps its desk.
    const six = assignSlots([...ten.slice(0, 5), at(T0, null, 11, "working")], T0);
    expect(six.find((s) => s.id === sid(11))?.slot).toBe(5);
    expect(six.slice(0, 5).map((s) => s.slot)).toEqual([0, 1, 2, 3, 4]);
    // An asleep newcomer never takes a seat from anyone.
    expect(assignSlots([...ten, at(T0 - 5 * 60_000, null, 11, "working")], T0).find((s) => s.id === sid(11))?.slot).toBeNull();
  });

  it("fills the front row (slots 0 to 4) first, then the back row (5 to 9), oldest first", () => {
    let doc = emptyDoc(T0);
    for (let n = 1; n <= 12; n++) doc = applyBeat(doc, beat(n), T0 + n);
    expect(doc.sessions.map((s) => [parseInt(s.id, 16), s.slot]).sort((a, b) => (a[0] as number) - (b[0] as number))).toEqual([
      [1, 0], [2, 1], [3, 2], [4, 3], [5, 4], [6, 5], [7, 6], [8, 7], [9, 8], [10, 9], [11, null], [12, null],
    ]);
  });

  it("moves the oldest back-row session to a front-row seat as soon as one is free", () => {
    const out = assignSlots([at(T0, 0, 1, "working"), at(T0, 1, 2, "working"), at(T0, 3, 4, "working"), at(T0, 4, 5, "working"), at(T0, 8, 9, "working"), at(T0, 6, 7, "asleep"), at(T0, null, 10, "working")], T0);
    const slot = (n: number) => out.find((s) => s.id === sid(n))?.slot;
    expect([slot(1), slot(2), slot(4), slot(5)]).toEqual([0, 1, 3, 4]);
    expect(slot(7)).toBe(2);
    expect(slot(9)).toBe(8);
    expect(slot(10)).toBe(5);
  });

  it("drops a stored slot outside the ten seats and gives the session a free one", () => {
    const out = assignSlots([at(T0, 12, 1, "working"), at(T0, 2.5, 2, "working")], T0);
    expect(out.map((s) => s.slot)).toEqual([0, 1]);
  });
});

describe("ten seats in v1, v2 and v3", () => {
  const sevenDoc = () => {
    let doc = publicDoc();
    for (let n = 1; n <= 7; n++) doc = applyBeat(doc, beat(n, n === 7 ? { state: "input", activity: "asking", helpers: 2 } : { helpers: n === 6 ? 4 : 0 }), T0 + n);
    return doc;
  };

  it("with seven sessions v1 and v2 carry five desks (slots 0 to 4) and extra 2; v3 carries seven", () => {
    const doc = sevenDoc();
    for (const snap of [view(doc, T0 + 10), viewV2(doc, T0 + 10)]) {
      expect(snap.desks.map((d) => d.slot)).toEqual([0, 1, 2, 3, 4]);
      expect(snap.extra).toBe(2);
    }
    const v3 = viewV3(doc, T0 + 10);
    expect(v3.v).toBe(3);
    expect(v3.desks.map((d) => d.slot)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(v3.desks.map((d) => d.helpers ?? 0)).toEqual([0, 0, 0, 0, 0, 4, 2]);
    expect(v3.desks[6]).toMatchObject({ slot: 6, state: "input" });
    expect(v3.extra).toBe(0);
    expect(parseOfficeResponseV3(JSON.parse(JSON.stringify(v3)))).toEqual(v3);
    // v2 is v3's front row: the same desks for slots 0 to 4, with their helpers.
    expect(viewV2(doc, T0 + 10)).toEqual({ ...v3, v: 2, desks: v3.desks.slice(0, 5), extra: 2 });
  });

  it("never puts a slot above 4 or more than five desks in v1 or v2, at any session count; v3 seats ten and counts the rest", () => {
    let doc = publicDoc();
    for (let n = 1; n <= 14; n++) {
      doc = applyBeat(doc, beat(n, { helpers: n % 3 }), T0 + n);
      const v1 = view(doc, T0 + 20);
      const v2 = viewV2(doc, T0 + 20);
      const v3 = viewV3(doc, T0 + 20);
      for (const snap of [v1, v2]) {
        expect(snap.desks.length).toBe(Math.min(n, OFFICE_DESKS));
        expect(Math.max(...snap.desks.map((d) => d.slot))).toBeLessThanOrEqual(OFFICE_DESKS - 1);
        expect(snap.extra).toBe(Math.max(0, n - OFFICE_DESKS));
      }
      expect(parseOfficeResponse(JSON.parse(JSON.stringify(v1)))).not.toBeNull();
      expect(parseOfficeResponseV2(JSON.parse(JSON.stringify(v2)))).not.toBeNull();
      expect(v3.desks.length).toBe(Math.min(n, OFFICE_SEATS));
      expect(v3.extra).toBe(Math.max(0, n - OFFICE_SEATS));
      expect(parseOfficeResponseV3(JSON.parse(JSON.stringify(v3)))).not.toBeNull();
    }
  });

  it("keeps v1 and v2 unchanged for at most five sessions: v3 shows the same desks", () => {
    let doc = publicDoc();
    for (let n = 1; n <= 5; n++) doc = applyBeat(doc, beat(n, { helpers: n }), T0 + n);
    const v2 = viewV2(doc, T0 + 10);
    expect(viewV3(doc, T0 + 10)).toEqual({ ...v2, v: 3 });
    expect(JSON.stringify(view(doc, T0 + 10))).not.toContain("helpers");
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
  const run = (status: "running" | "success" | "failure" | "cancelled", attempt = 1) => ({ type: "run" as const, id: 42, attempt, branch: "feat/x", title: "CI · feat/x", url: "https://github.com/ShinyQ/ShinyQ-HQ/actions/runs/42", status });

  it("tracks job progress for the desk on that branch and counts CI runs once", () => {
    let doc = applyBeat(publicDoc(), beat(1, { repo: HQ, branch: "feat/x", state: "ci", activity: "ci" }), T0);
    doc = applyGithub(doc, { repo: HQ, changes: [run("running")] }, "d1", T0);
    doc = applyGithub(doc, { repo: HQ, changes: [{ type: "job", runId: 42, attempt: 1, jobId: "1", name: "Lint", status: "done" }, { type: "job", runId: 42, attempt: 1, jobId: "2", name: "E2E", status: "running" }] }, "d2", T0);
    const snap = view(doc, T0);
    expect(snap.desks[0].progress).toEqual({ done: 1, total: 2 });
    expect(snap.github[0]).toMatchObject({ kind: "run", status: "running", progress: { done: 1, total: 2 } });
    doc = applyGithub(doc, { repo: HQ, changes: [run("success")] }, "d3", T0);
    doc = applyGithub(doc, { repo: HQ, changes: [run("success")] }, "d3", T0);
    expect(view(doc, T0).today).toMatchObject({ ciRuns: 1, ciGreen: 1 });
  });

  it("fails the waiting desk with the failed job's name", () => {
    let doc = applyBeat(publicDoc(), beat(1, { repo: HQ, branch: "feat/x", state: "ci", activity: "ci" }), T0);
    doc = applyGithub(doc, { repo: HQ, changes: [run("running"), { type: "job", runId: 42, attempt: 1, jobId: "9", name: "E2E shard 3/8", status: "failed" }] }, "d1", T0);
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
    const after = applyGithub(doc, { repo: HQ, changes: [{ type: "job", runId: 999, attempt: 1, jobId: "1", name: "Fork job", status: "failed" }] }, "d2", T0);
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

  it("ignores a late running delivery of a completed attempt", () => {
    let doc = applyGithub(publicDoc(), { repo: HQ, changes: [run("running"), { type: "job", runId: 42, attempt: 1, jobId: "1", name: "Lint", status: "done" }] }, "a0", T0);
    doc = applyGithub(doc, { repo: HQ, changes: [run("success")] }, "a", T0 + 1000);
    const feed = doc.feed;
    doc = applyGithub(doc, { repo: HQ, changes: [run("running")] }, "b", T0 + 2000);
    expect(doc.runs[0]).toMatchObject({ id: 42, attempt: 1, status: "success", jobs: { "1": "done" }, updated: T0 + 1000 });
    expect(doc.feed).toEqual(feed);
    expect(view(doc, T0 + 2000).github[0]).toMatchObject({ kind: "run", status: "success" });
  });

  it("restarts a run on a newer attempt: jobs cleared, feed back to running", () => {
    let doc = applyGithub(publicDoc(), { repo: HQ, changes: [run("running"), { type: "job", runId: 42, attempt: 1, jobId: "9", name: "E2E", status: "failed" }] }, "a0", T0);
    doc = applyGithub(doc, { repo: HQ, changes: [run("failure")] }, "a1", T0 + 1000);
    doc = applyGithub(doc, { repo: HQ, changes: [run("running", 2)] }, "b0", T0 + 2000);
    expect(doc.runs[0]).toMatchObject({ id: 42, attempt: 2, status: "running", jobs: {} });
    expect(doc.runs[0]).not.toHaveProperty("failedJob");
    expect(view(doc, T0 + 2000).github[0]).toMatchObject({ kind: "run", status: "running" });
    expect(doc.today).toMatchObject({ ciRuns: 1, ciGreen: 0 });
    const direct = applyGithub(doc, { repo: HQ, changes: [run("success", 3)] }, "c1", T0 + 3000);
    expect(direct.runs[0]).toMatchObject({ attempt: 3, status: "success" });
    expect(direct.today).toMatchObject({ ciRuns: 2, ciGreen: 1 });
  });

  it("ignores an older attempt after a newer one, cancelled included", () => {
    let doc = applyGithub(publicDoc(), { repo: HQ, changes: [run("running", 2)] }, "b0", T0);
    const before = { runs: doc.runs, feed: doc.feed, today: doc.today };
    for (const [i, status] of (["failure", "success", "running", "cancelled"] as const).entries()) doc = applyGithub(doc, { repo: HQ, changes: [run(status, 1)] }, `old-${i}`, T0 + 1000);
    expect({ runs: doc.runs, feed: doc.feed, today: doc.today }).toEqual(before);
  });

  it("ignores a late running delivery of a cancelled attempt: no run, no feed item", () => {
    let doc = applyGithub(publicDoc(), { repo: HQ, changes: [run("running")] }, "c0", T0);
    doc = applyGithub(doc, { repo: HQ, changes: [run("cancelled")] }, "c1", T0 + 1000);
    expect(doc.cancelled).toEqual([{ id: 42, attempt: 1 }]);
    doc = applyGithub(doc, { repo: HQ, changes: [run("running")] }, "c2", T0 + 2000);
    expect(doc.runs).toEqual([]);
    expect(doc.feed).toEqual([]);
    expect(view(doc, T0 + 2000).github).toEqual([]);
  });

  it("starts a re-run after a cancel as a new run and forgets the cancel", () => {
    let doc = applyGithub(publicDoc(), { repo: HQ, changes: [run("running"), run("cancelled")] }, "c0", T0);
    doc = applyGithub(doc, { repo: HQ, changes: [run("running", 2)] }, "c1", T0 + 1000);
    expect(doc.runs[0]).toMatchObject({ id: 42, attempt: 2, status: "running", jobs: {} });
    expect(view(doc, T0 + 1000).github[0]).toMatchObject({ kind: "run", status: "running" });
    expect(doc.cancelled).toEqual([]);
  });

  it("keeps only the newest cancelled records", () => {
    let doc = publicDoc();
    for (let id = 1; id <= TIMING.runsKept + 5; id++) doc = applyGithub(doc, { repo: HQ, changes: [{ ...run("cancelled"), id }] }, `x-${id}`, T0);
    expect(doc.cancelled).toHaveLength(TIMING.runsKept);
    expect(doc.cancelled[0]).toEqual({ id: TIMING.runsKept + 5, attempt: 1 });
  });

  it("ignores a late job of an older attempt after a restart", () => {
    let doc = applyBeat(publicDoc(), beat(1, { repo: HQ, branch: "feat/x", state: "ci", activity: "ci" }), T0);
    doc = applyGithub(doc, { repo: HQ, changes: [run("running"), run("failure"), run("running", 2)] }, "j0", T0);
    const before = { runs: doc.runs, feed: doc.feed };
    doc = applyGithub(doc, { repo: HQ, changes: [{ type: "job", runId: 42, attempt: 1, jobId: "9", name: "E2E", status: "failed" }] }, "j1", T0 + 1000);
    expect({ runs: doc.runs, feed: doc.feed }).toEqual(before);
    expect(doc.runs[0].jobs).toEqual({});
    expect(doc.runs[0]).not.toHaveProperty("failedJob");
    doc = applyGithub(doc, { repo: HQ, changes: [{ type: "job", runId: 42, attempt: 2, jobId: "10", name: "E2E", status: "running" }] }, "j2", T0 + 2000);
    expect(doc.runs[0].jobs).toEqual({ "10": "running" });
  });

  it("reads an older stored document without cancelled records", () => {
    const stored: Partial<OfficeDoc> = publicDoc();
    delete stored.cancelled;
    const legacy = stored as OfficeDoc;
    expect(legacy).not.toHaveProperty("cancelled");
    let doc = applyGithub(legacy, { repo: HQ, changes: [run("running")] }, "l0", T0);
    expect(view(doc, T0).github[0]).toMatchObject({ kind: "run", status: "running" });
    doc = applyGithub(doc, { repo: HQ, changes: [run("cancelled")] }, "l1", T0 + 1000);
    expect(doc.cancelled).toEqual([{ id: 42, attempt: 1 }]);
    expect(view(applyGithub(legacy, { repo: HQ, changes: [] }, "l2", T0), T0).github).toEqual([]);
  });

  it("returns the same document for a repeated delivery", () => {
    const doc = publicDoc();
    expect(applyGithub(doc, { repo: HQ, changes: [] }, "ping-1", T0 + 1)).toBe(doc);
  });
});

describe("helpers", () => {
  const helpersOf = (doc: OfficeDoc, now: number) => viewV2(doc, now).desks.map((d) => d.helpers);

  it("stores helpers from a beat that carries them and keeps them for a beat without", () => {
    let doc = applyBeat(emptyDoc(T0), beat(1, { helpers: 3 }), T0);
    expect(doc.sessions[0].helpers).toBe(3);
    doc = applyBeat(doc, beat(1, { state: "testing", activity: "testing" }), T0 + 1000);
    expect(doc.sessions[0].helpers).toBe(3);
    expect(helpersOf(doc, T0 + 2000)).toEqual([3]);
  });

  it("clears them on a beat with helpers 0 (nothing stored, nothing shown)", () => {
    let doc = applyBeat(emptyDoc(T0), beat(1, { helpers: 4 }), T0);
    doc = applyBeat(doc, beat(1, { helpers: 0 }), T0 + 1000);
    expect(doc.sessions[0]).not.toHaveProperty("helpers");
    expect(viewV2(doc, T0 + 1000).desks[0]).not.toHaveProperty("helpers");
    doc = applyBeat(doc, beat(1), T0 + 2000);
    expect(doc.sessions[0]).not.toHaveProperty("helpers");
  });

  it("adds no recent entry and keeps since when only the helper count changes", () => {
    let doc = applyBeat(emptyDoc(T0), beat(1), T0);
    doc = applyBeat(doc, beat(1, { helpers: 2 }), T0 + 1000);
    doc = applyBeat(doc, beat(1, { helpers: 5 }), T0 + 2000);
    const desk = viewV2(doc, T0 + 2000).desks[0];
    expect(desk.recent).toHaveLength(1);
    expect(desk.since).toBe(T0);
    expect(desk.helpers).toBe(5);
  });

  it("shows nothing while asleep, after 10 min without a beat, or once the session is removed", () => {
    const ci = applyBeat(emptyDoc(T0), beat(1, { state: "ci", activity: "ci", helpers: 2 }), T0);
    expect(helpersOf(ci, T0 + TIMING.helpersTtl - 1)).toEqual([2]);
    expect(viewV2(ci, T0 + TIMING.helpersTtl).desks[0]).toMatchObject({ state: "ci" });
    expect(viewV2(ci, T0 + TIMING.helpersTtl).desks[0]).not.toHaveProperty("helpers");
    const working = applyBeat(emptyDoc(T0), beat(1, { helpers: 2 }), T0);
    expect(viewV2(working, T0 + TIMING.asleepAfter).desks[0]).toMatchObject({ state: "asleep" });
    expect(viewV2(working, T0 + TIMING.asleepAfter).desks[0]).not.toHaveProperty("helpers");
    const done = applyBeat(emptyDoc(T0), beat(1, { state: "done", activity: "finished", helpers: 1 }), T0);
    expect(viewV2(done, T0 + TIMING.doneFor).desks[0]).not.toHaveProperty("helpers");
    expect(viewV2(ci, T0 + TIMING.removeAfter).desks).toEqual([]);
  });

  it("caps the count at 9 and reads 0 without a stored count", () => {
    const rec: SessionRecord = { id: sid(1), agent: "codex", slot: 0, firstSeen: T0, lastBeat: T0, state: "working", activity: "editing", since: T0, recent: [], helpers: 12 };
    expect(effectiveHelpers(rec, effective(rec, T0)!, T0)).toBe(9);
    expect(effectiveHelpers({ ...rec, helpers: undefined }, effective(rec, T0)!, T0)).toBe(0);
  });

  it("keeps helpers when a repository goes private", () => {
    let doc = applyBeat(publicDoc(), beat(1, { repo: HQ, branch: "feat/x", title: "X", helpers: 3 }), T0);
    doc = applyGithub(doc, { repo: HQ, changes: [{ type: "privatized" }] }, "priv-1", T0 + 1);
    expect(doc.sessions[0]).not.toHaveProperty("repo");
    expect(viewV2(doc, T0 + 1).desks[0]).toMatchObject({ helpers: 3 });
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

/** A fixed stored document (sessions with and without helpers) for the v1 byte-for-byte golden. */
function goldenDoc(): OfficeDoc {
  const s = (n: number, slot: number | null, lastBeat: number, extra: Partial<SessionRecord> = {}): SessionRecord => ({
    id: sid(n),
    agent: (["copilot", "claude", "codex"] as const)[n % 3],
    slot,
    firstSeen: T0 - 60 * 60_000 + n,
    lastBeat,
    state: "working",
    activity: "editing",
    since: lastBeat - 60_000,
    recent: [{ state: "working", activity: "editing", at: lastBeat - 60_000 }],
    ...extra,
  });
  return {
    v: 1,
    sessions: [
      s(1, 0, T0 - 5_000, { repo: HQ, branch: "feat/x", title: "Office crew", helpers: 3, state: "ci", activity: "ci" }),
      s(2, 1, T0 - 30_000, { helpers: 6 }),
      s(3, 2, T0 - 10 * 60_000, { helpers: 2 }),
      s(4, 3, T0 - 1_000),
      s(5, 4, T0 - 2_000, { repo: HQ, branch: "fix/y", state: "failed", activity: "failed", helpers: 9 }),
      s(6, null, T0 - 3_000, { helpers: 1 }),
    ],
    runs: [
      { id: 42, attempt: 1, repo: HQ, branch: "feat/x", title: "CI · feat/x", url: "https://github.com/ShinyQ/ShinyQ-HQ/actions/runs/42", status: "running", jobs: { a: "done", b: "running" }, updated: T0 - 4_000 },
      { id: 41, attempt: 1, repo: HQ, branch: "fix/y", title: "CI · fix/y", url: "https://github.com/ShinyQ/ShinyQ-HQ/actions/runs/41", status: "failure", jobs: { c: "failed" }, failedJob: "Lint", updated: T0 - 6_000 },
    ],
    prs: [{ repo: HQ, branch: "fix/y", number: 9, title: "fix: y", updated: T0 - 7_000 }],
    feed: [
      { key: "run:42", kind: "run", status: "running", repo: HQ, title: "CI · feat/x", at: T0 - 4_000, url: "https://github.com/ShinyQ/ShinyQ-HQ/actions/runs/42", progress: { done: 1, total: 2 } },
      { key: "pr:ShinyQ/ShinyQ-HQ#9", kind: "pr", status: "opened", repo: HQ, title: "#9 fix: y", at: T0 - 7_000, url: "https://github.com/ShinyQ/ShinyQ-HQ/pull/9" },
    ],
    publicRepos: [HQ],
    deliveries: ["d1"],
    cancelled: [],
    today: { day: "2026-10-18", tasksDone: 2, prsMerged: 1, ciRuns: 3, ciGreen: 2 },
  };
}

/** `JSON.stringify(view(goldenDoc(), T0))` captured from the v1 `view` before snapshot v2 existed: v1 never changes. */
const GOLDEN_V1 = "{\"v\":1,\"enabled\":true,\"mode\":\"live\",\"updatedAt\":1792310400000,\"desks\":[{\"slot\":0,\"agent\":\"claude\",\"state\":\"ci\",\"activity\":\"ci\",\"since\":1792310335000,\"repo\":\"ShinyQ/ShinyQ-HQ\",\"title\":\"Office crew\",\"progress\":{\"done\":1,\"total\":2},\"recent\":[{\"state\":\"working\",\"activity\":\"editing\",\"at\":1792310335000}]},{\"slot\":1,\"agent\":\"codex\",\"state\":\"thinking\",\"activity\":\"planning\",\"since\":1792310390000,\"recent\":[{\"state\":\"working\",\"activity\":\"editing\",\"at\":1792310310000}]},{\"slot\":2,\"agent\":\"copilot\",\"state\":\"asleep\",\"activity\":\"resting\",\"since\":1792309980000,\"recent\":[{\"state\":\"working\",\"activity\":\"editing\",\"at\":1792309740000}]},{\"slot\":3,\"agent\":\"claude\",\"state\":\"working\",\"activity\":\"editing\",\"since\":1792310339000,\"recent\":[{\"state\":\"working\",\"activity\":\"editing\",\"at\":1792310339000}]},{\"slot\":4,\"agent\":\"codex\",\"state\":\"failed\",\"activity\":\"failed\",\"since\":1792310338000,\"repo\":\"ShinyQ/ShinyQ-HQ\",\"title\":\"fix: y\",\"job\":\"Lint\",\"recent\":[{\"state\":\"working\",\"activity\":\"editing\",\"at\":1792310338000}]}],\"extra\":1,\"github\":[{\"kind\":\"run\",\"status\":\"running\",\"repo\":\"ShinyQ/ShinyQ-HQ\",\"title\":\"CI · feat/x\",\"at\":1792310396000,\"url\":\"https://github.com/ShinyQ/ShinyQ-HQ/actions/runs/42\",\"progress\":{\"done\":1,\"total\":2}},{\"kind\":\"pr\",\"status\":\"opened\",\"repo\":\"ShinyQ/ShinyQ-HQ\",\"title\":\"#9 fix: y\",\"at\":1792310393000,\"url\":\"https://github.com/ShinyQ/ShinyQ-HQ/pull/9\"}],\"today\":{\"day\":\"2026-10-18\",\"tasksDone\":2,\"prsMerged\":1,\"ciRuns\":3,\"ciGreen\":2}}";

describe("view (v1) and viewV2", () => {
  it("keeps v1 byte for byte, with no helpers anywhere", () => {
    const body = JSON.stringify(view(goldenDoc(), T0));
    expect(body).toBe(GOLDEN_V1);
    expect(body).not.toContain("helpers");
    expect(parseOfficeResponse(JSON.parse(body))).not.toBeNull();
  });

  it("is v1 plus helpers 1 to 9 on awake desks", () => {
    const v2 = viewV2(goldenDoc(), T0);
    expect(v2.v).toBe(2);
    const v1 = JSON.parse(GOLDEN_V1);
    const withoutHelpers = v2.desks.map((d) => {
      const copy = { ...d };
      delete copy.helpers;
      return copy;
    });
    expect({ ...v2, v: 1, desks: withoutHelpers }).toEqual(v1);
    expect(v2.desks.map((d) => d.helpers)).toEqual([3, 6, undefined, undefined, 9]);
    expect(v2.desks[2]).not.toHaveProperty("helpers");
    expect(v2.desks[3]).not.toHaveProperty("helpers");
    expect(parseOfficeResponseV2(JSON.parse(JSON.stringify(v2)))).toEqual(v2);
  });

  it("keeps the golden v1 byte for byte with ten seats, and v3 of the same document is v2 with v: 3", () => {
    // The sixth session (no slot, stored before ten seats) stays in extra until the next beat seats it.
    expect(JSON.stringify(view(goldenDoc(), T0))).toBe(GOLDEN_V1);
    expect(viewV3(goldenDoc(), T0)).toEqual({ ...viewV2(goldenDoc(), T0), v: 3 });
  });
});
