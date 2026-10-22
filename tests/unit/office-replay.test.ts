import { describe, expect, it } from "vitest";
import { parseOfficeResponseV4 } from "@/lib/office/protocolV4";
import { clockOf, dayLabel, dayTime, planReplay, playable, playTime, REPLAY, RULES, snapshotAt } from "@/experience/floors/lobby/office/replay";
import { dayStart, parseOfficeHistory, type OfficeHistoryV1 } from "@/lib/office/protocolHistory";
import type { OfficeActivity, OfficeState } from "@/lib/office/protocol";
import { historyDay, logDoc, startLog } from "../../workers/office/src/history";
import { applyBeat, emptyDoc, TIMING } from "../../workers/office/src/state";
import { expectedState, makeHistory, ordinalAt } from "../helpers/office-history";

const EPOCH = Date.UTC(2026, 9, 21, 3, 0, 0);

/**
 * A day with carry-ins, built by the Worker: session A finished (done) 60 s before midnight, B is working through it;
 * after midnight B works on and is done at 00:10 (`afterMidnight` false: only the carry-ins).
 */
function carryDay(afterMidnight = true): OfficeHistoryV1 {
  const day = "2026-10-21";
  const base = dayStart(day);
  const A = "a".repeat(64);
  const B = "b".repeat(64);
  let doc = emptyDoc(base - 600_000);
  const beat = (session: string, state: OfficeState, activity: OfficeActivity, s: number) => {
    const before = doc;
    doc = applyBeat(doc, { v: 1, agent: session === A ? "claude" : "codex", session, state, activity, ts: base + s * 1000 }, base + s * 1000);
    return before;
  };
  beat(A, "working", "editing", -300);
  beat(A, "done", "finished", -60);
  beat(B, "working", "editing", -10);
  let log = startLog(day, doc);
  if (afterMidnight) {
    for (let s = 60; s < 600; s += 60) log = logDoc(log, beat(B, "working", "editing", s), doc, base + s * 1000);
    log = logDoc(log, beat(B, "done", "finished", 600), doc, base + 600_000);
  }
  const h = parseOfficeHistory(historyDay(log, doc));
  if (!h || !("events" in h)) throw new Error("carryDay built an invalid day");
  return h;
}

describe("replay engine", () => {
  it("mirrors the Worker's time rules", () => {
    expect(RULES).toEqual({ thinkingAfter: TIMING.thinkingAfter / 1000, asleepAfter: TIMING.asleepAfter / 1000, longWaitAsleepAfter: TIMING.longWaitAsleepAfter / 1000, removeAfter: TIMING.removeAfter / 1000, doneFor: TIMING.doneFor / 1000, helpersTtl: TIMING.helpersTtl / 1000 });
  });
  it("compresses quiet gaps and clamps every day to 30 to 60 s; nothing to play is null", () => {
    for (const h of [makeHistory({ seats: 10, hours: 12, changesPerHour: 240 }), makeHistory({ seats: 1, hours: 1, changesPerHour: 2 }), makeHistory({ seats: 3, hours: 8, changesPerHour: 30, quietGaps: 6 })]) {
      const p = planReplay(h)!;
      expect(p.duration).toBeGreaterThanOrEqual(REPLAY.minS - 1e-9);
      expect(p.duration).toBeLessThanOrEqual(REPLAY.maxS + 1e-9);
      for (let s = 0; s <= p.duration; s += 0.5) expect(playTime(p, dayTime(p, s))).toBeCloseTo(s, 6);
    }
    expect(planReplay(makeHistory({ seats: 0, hours: 0, changesPerHour: 0 }))).toBeNull();
  });
  it("matches the live rules (effective) for every desk at every sampled moment, both rows, helpers included", () => {
    const h = makeHistory({ seats: 10, hours: 3, changesPerHour: 60, quietGaps: 2, helpers: true });
    const p = planReplay(h)!;
    for (let s = 0; s < p.duration; s += 0.25) {
      const snap = snapshotAt(h, p, s, EPOCH);
      const T = dayTime(p, s);
      for (const d of snap.desks) {
        const want = expectedState(h, ordinalAt(h, d.slot, T), T);
        expect(d.state).toBe(want?.state);
        expect(d.helpers ?? 0).toBe(want?.helpers ?? 0);
      }
      expect(snap.desks.every((d) => d.slot >= 0 && d.slot < 10)).toBe(true);
      expect(new Set(snap.desks.map((d) => d.slot)).size).toBe(snap.desks.length);
    }
  });
  it("is a valid v4 snapshot apart from the replay-only run fields, and never shows a hash or a non-public title", () => {
    const h = makeHistory({ seats: 4, hours: 2, changesPerHour: 20, prs: 5, privatePrs: 2, runs: 3, deploys: 1 });
    const p = planReplay(h)!;
    const snap = snapshotAt(h, p, p.duration / 2, EPOCH);
    const plain = { ...snap, pipeline: { runs: [], ships: snap.pipeline!.ships } };
    expect(parseOfficeResponseV4(plain)).not.toBeNull();
    expect(JSON.stringify(snap)).not.toMatch(/[0-9a-f]{64}/);
    expect(snap.github.every((g) => g.repo !== "" && g.title !== "")).toBe(true);
  });
  it("counts merges for the tiles and the dock in merge order, runs and deploys as pipeline state", () => {
    const h = makeHistory({ seats: 1, hours: 2, changesPerHour: 10, prs: 5, runs: 2, deploys: 1 });
    const p = planReplay(h)!;
    expect(snapshotAt(h, p, 0, EPOCH).today.prsMerged).toBe(0);
    expect(snapshotAt(h, p, p.duration, EPOCH).today.prsMerged).toBe(5);
    const [run] = h.runs;
    const mid = snapshotAt(h, p, playTime(p, (run[0] + run[1]) / 2), EPOCH).pipeline!.runs.find((r) => r.status === "running")!;
    expect(mid.jobs.filter((j) => j.status === "done").length).toBeGreaterThan(0);
    expect(mid.jobs.some((j) => j.status === "queued" || j.status === "running")).toBe(true);
    const [deploy] = h.deploys;
    const before = snapshotAt(h, p, playTime(p, deploy[0]) - 1, EPOCH).pipeline!.ships.find((s) => s.kind === "deploy");
    expect(before?.status).toBe("running");
    const after = snapshotAt(h, p, playTime(p, deploy[0]) + 0.1, EPOCH).pipeline!.ships.find((s) => s.kind === "deploy");
    expect(after?.status).toBe(deploy[1] ? "success" : "failure");
  });
  it("starts a session over after a removal, and keeps one desk per seat on a day with a clash", () => {
    const h = makeHistory({ seats: 0, hours: 0, changesPerHour: 0 });
    h.agents.push("copilot", "claude", "codex");
    // Ordinal 0 is done, removed (30 min quiet), then done again; ordinals 1 and 2 both claim seat 5 (a truncated day).
    h.events.push([50, 1, 5, 0, 0, 3100, 0], [100, 0, 3, 6, 9, 110, 0], [3000, 0, 3, 6, 9, 3010, 0], [3002, 2, 5, 4, 6, 3100, 0]);
    const p = planReplay(h)!;
    const snap = snapshotAt(h, p, playTime(p, 3005), EPOCH);
    expect(snap.desks.map((d) => [d.slot, d.agent, d.state])).toEqual([
      [3, "copilot", "done"],
      [5, "codex", "ci"],
    ]);
    expect(snap.extra).toBe(1);
    expect(snap.today.tasksDone).toBe(2);
  });
  it("shows a session carried over midnight in done as asleep, and never counts or plays it as a new done", () => {
    const h = carryDay();
    expect(h.events.filter((e) => e[0] === 0)).toHaveLength(2);
    const p = planReplay(h)!;
    // B's carry-in opens the day at 0; A finished before midnight.
    expect(p.spans[0].from).toBe(0);
    expect(p.doneAt).toEqual([600]);
    for (const s of [0, 0.1, playTime(p, 10)]) expect(snapshotAt(h, p, s, EPOCH).desks.find((d) => d.agent === "claude")?.state).toBe("asleep");
    expect(snapshotAt(h, p, p.duration, EPOCH).today.tasksDone).toBe(1);
    // Only the carry-in done: nothing to play.
    const only = carryDay(false);
    only.events = only.events.filter((e) => e[1] === 0);
    expect(planReplay(only)).toBeNull();
  });
  it("times every snapshot on the playback clock", () => {
    const h = makeHistory({ seats: 2, hours: 1, changesPerHour: 10 });
    const p = planReplay(h)!;
    expect(snapshotAt(h, p, 12, EPOCH).updatedAt).toBe(EPOCH + 12_000);
  });
});

describe("replay labels", () => {
  it("formats a day and a day time for the scene chunk (the banner, the chips, the pill)", () => {
    expect(dayLabel("2026-10-19", "en")).toBe("Mon 19 Oct");
    expect(dayLabel("2026-10-19", "id")).toBe("Sen 19 Okt");
    expect(clockOf(50_700)).toBe("14:05");
    expect(clockOf(0)).toBe("00:00");
    expect(clockOf(86_399)).toBe("23:59");
  });

  it("tells an index day with nothing to play", () => {
    expect(playable({ events: 0, prs: 0, runs: 0, deploys: 0 })).toBe(false);
    expect(playable({ events: 0, prs: 0, runs: 0, deploys: 1 })).toBe(true);
  });
});
