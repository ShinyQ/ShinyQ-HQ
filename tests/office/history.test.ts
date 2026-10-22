import { describe, expect, it } from "vitest";
import { cleanHistory, closeLog, emptyLog, HISTORY, historyDay, historyIndex, logDoc, logKey, scrubRepo, secondsOf, startLog } from "../../workers/office/src/history";
import { applyBeat, applyGithub, emptyDoc, type OfficeDoc } from "../../workers/office/src/state";
import { historyWindow, parseOfficeHistory, parseOfficeHistoryIndex } from "../../src/lib/office/protocolHistory";
import type { OfficeBeatV1 } from "../../src/lib/office/protocol";

const DAY = "2026-10-20";
const T0 = Date.UTC(2026, 9, 19, 17, 0, 0); // 00:00 WIB on 20 Oct
const id = (c: string) => c.repeat(64);
const beat = (session: string, over: Partial<OfficeBeatV1> = {}): OfficeBeatV1 => ({ v: 1, agent: "copilot", session, state: "working", activity: "editing", ts: 0, ...over });
const size = (x: unknown) => new TextEncoder().encode(JSON.stringify(x)).length;
const publicDoc = (): OfficeDoc => ({ ...emptyDoc(T0), publicRepos: ["ShinyQ/ShinyQ-HQ"] });
/** Applies beats in order, logging each step like the Durable Object does. */
function play(steps: [number, OfficeBeatV1][], doc = publicDoc()) {
  let log = emptyLog(DAY);
  for (const [at, b] of steps) {
    const next = applyBeat(doc, b, T0 + at);
    log = logDoc(log, doc, next, T0 + at);
    doc = next;
  }
  return { log, doc };
}

describe("day log", () => {
  it("logs a change with an ordinal, closes the previous event at the last beat, never serves the hash", () => {
    const { log, doc } = play([[1_000, beat(id("a"))], [50_000, beat(id("a"))], [60_000, beat(id("a"), { state: "ci", activity: "ci" })]]);
    expect(log.events).toEqual([[1, 0, 0, 0, 0, 50, 0], [60, 0, 0, 4, 6, null, 0]]);
    expect(log.keys).toEqual([id("a")]);
    const served = historyDay(log, doc);
    expect(JSON.stringify(served)).not.toMatch(/[0-9a-f]{64}/);
    expect(served.events.at(-1)?.[5]).toBe(60);
    expect(parseOfficeHistory(served)).not.toBeNull();
  });
  it("ignores keepalives and logs helper count changes", () => {
    const { log } = play([[0, beat(id("a"))], [15_000, beat(id("a"))], [20_000, beat(id("a"), { helpers: 3 })]]);
    expect(log.events.map((e) => e[6])).toEqual([0, 3]);
  });
  it("logs ten seats through seatOf, and a seat that moves without a beat of its own", () => {
    const ten: [number, OfficeBeatV1][] = Array.from({ length: 10 }, (_, i) => [i * 1000, beat(id(String.fromCharCode(97 + i)))]);
    expect(play(ten).log.events.map((e) => e[2])).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    // a (seat 0) goes quiet past 30 min; at b's next beat a is removed and f, the oldest back-row session, moves to seat 0.
    const six: [number, OfficeBeatV1][] = [..."abcdef"].map((c, i) => [i * 1000, beat(id(c))]);
    const keep: [number, OfficeBeatV1][] = [..."bcdef"].map((c) => [20 * 60_000, beat(id(c))]);
    const { log } = play([...six, ...keep, [31 * 60_000, beat(id("b"))]]);
    expect(log.events.find((e) => e[1] === 5 && e[0] === 1860)).toEqual([1860, 5, 0, 0, 0, null, 0]);
    // b itself was quiet for 11 min (asleep), so its beat logs a return too.
    expect(log.events.find((e) => e[1] === 1 && e[0] === 1860)).toEqual([1860, 1, 1, 0, 0, null, 0]);
    expect(log.events.find((e) => e[1] === 0)?.[5]).toBe(0);
    expect(log.events.filter((e) => e[1] === 5 && e[2] === 5).map((e) => e[5])).toEqual([5, 1200]);
  });
  it("logs -1 for a session past the ten seats", () => {
    const steps: [number, OfficeBeatV1][] = Array.from({ length: 11 }, (_, i) => [i * 1000, beat(id(String.fromCharCode(97 + i)))]);
    expect(play(steps).log.events.at(-1)?.[2]).toBe(-1);
  });
  it("keeps a task only for a public repository, never a branch", () => {
    const { log } = play([[0, beat(id("a"), { repo: "ShinyQ/ShinyQ-HQ", branch: "feat/x", title: "Thing" })], [0, beat(id("b"), { repo: "ShinyQ/private-thing", title: "Secret" })]]);
    expect(log.tasks).toEqual({ "0": { repo: "ShinyQ/ShinyQ-HQ", title: "Thing" } });
  });
  it("logs merges, finished runs and production deploys only", () => {
    const { doc, log: first } = play([[0, beat(id("a"), { repo: "ShinyQ/ShinyQ-HQ", branch: "feat/x" })]]);
    const changes = [
      { type: "run", id: 9, attempt: 1, branch: "feat/x", title: "CI", url: "https://github.com/ShinyQ/ShinyQ-HQ/actions/runs/9", status: "running" },
      { type: "run", id: 9, attempt: 1, branch: "feat/x", title: "CI", url: "https://github.com/ShinyQ/ShinyQ-HQ/actions/runs/9", status: "failure" },
      { type: "pr", number: 7, branch: "feat/x", title: "Thing", url: "https://github.com/ShinyQ/ShinyQ-HQ/pull/7", action: "merged" },
      { type: "deploy", id: 3, title: "Deploy · preview", url: "https://github.com/ShinyQ/ShinyQ-HQ/deployments", status: "success", production: false },
      { type: "deploy", id: 4, title: "Deploy · production", url: "https://github.com/ShinyQ/ShinyQ-HQ/deployments", status: "success", production: true },
    ] as const;
    let log = first;
    let d = doc;
    changes.forEach((c, i) => {
      const next = applyGithub(d, { repo: "ShinyQ/ShinyQ-HQ", changes: [c] }, `d${i}`, T0 + (i + 1) * 10_000);
      log = logDoc(log, d, next, T0 + (i + 1) * 10_000);
      d = next;
    });
    expect(log.runs).toEqual([[10, 20, 0, 0, 0]]);
    expect(log.prs).toEqual([[30, 0, "ShinyQ/ShinyQ-HQ", 7, "Thing"]]);
    expect(log.deploys).toEqual([[50, 1]]);
    const scrubbed = scrubRepo(log, "ShinyQ/ShinyQ-HQ");
    expect(scrubbed.prs).toEqual([[30, 0, "", 7, ""]]);
    expect(log.tasks).toEqual({ "0": { repo: "ShinyQ/ShinyQ-HQ" } });
    expect(scrubbed.tasks).toEqual({});
  });
  it("caps every list, marks the day truncated and stays under the byte cap", () => {
    const states = ["working", "thinking"] as const;
    const steps: [number, OfficeBeatV1][] = Array.from({ length: HISTORY.events + 20 }, (_, i) => [i * 1000, beat(id("a"), { state: states[i % 2], repo: "ShinyQ/ShinyQ-HQ", title: "T".repeat(80) })]);
    const { log } = play(steps);
    expect(log.events.length).toBeLessThanOrEqual(HISTORY.events);
    expect(log.truncated).toBe(true);
    expect(size(log)).toBeLessThanOrEqual(HISTORY.maxBytes - HISTORY.headroom);
  });
  it("falls back at the byte cap: keeps the closes, drops what the change added, stays under the hard cap", () => {
    const doc0 = applyBeat(publicDoc(), beat(id("a")), T0);
    const base = logDoc(emptyLog(DAY), publicDoc(), doc0, T0);
    const pad = HISTORY.maxBytes - HISTORY.headroom - 5 - size({ ...base, tasks: { "0": { repo: "ShinyQ/ShinyQ-HQ", title: "" } } });
    const full = { ...base, tasks: { "0": { repo: "ShinyQ/ShinyQ-HQ", title: "x".repeat(pad) } } };
    expect(size(full)).toBe(HISTORY.maxBytes - HISTORY.headroom - 5);
    const doc1 = applyBeat(applyBeat(doc0, beat(id("a"), { state: "ci", activity: "ci" }), T0 + 60_000), beat(id("b")), T0 + 60_000);
    const out = logDoc(full, doc0, doc1, T0 + 60_000);
    expect(out.events).toEqual([[0, 0, 0, 0, 0, 0, 0]]);
    expect(out.keys).toEqual([id("a")]);
    expect(out.truncated).toBe(true);
    expect(size(out)).toBeLessThanOrEqual(HISTORY.maxBytes);
  });
  it("caps the sessions at 200 and logs nothing more for a session past the cap", () => {
    const hex = (i: number) => i.toString(16).padStart(64, "0");
    const steps: [number, OfficeBeatV1][] = Array.from({ length: HISTORY.sessions + 1 }, (_, i) => [i * 50, beat(hex(i))]);
    const { log, doc } = play(steps);
    expect(log.keys).toHaveLength(HISTORY.sessions);
    expect(log.events).toHaveLength(HISTORY.sessions);
    expect(log.truncated).toBe(true);
    const next = applyBeat(doc, beat(hex(HISTORY.sessions), { state: "ci", activity: "ci" }), T0 + 11_000);
    expect(logDoc(log, doc, next, T0 + 11_000)).toBe(log);
  });
  it("logs a quiet gap that ends in the same state: the replay sees sleep and removal", () => {
    const { log } = play([[0, beat(id("a"))], [60_000, beat(id("a"))], [45 * 60_000, beat(id("a"))], [46 * 60_000, beat(id("a"))]]);
    expect(log.events).toEqual([[0, 0, 0, 0, 0, 60, 0], [2700, 0, 0, 0, 0, null, 0]]);
    // asleep after 3 min, but not when another session's beat finds it quiet
    const two = play([[0, beat(id("a"))], [0, beat(id("b"))], [4 * 60_000, beat(id("b"))], [5 * 60_000, beat(id("a"))]]);
    expect(two.log.events).toEqual([[0, 0, 0, 0, 0, 0, 0], [0, 1, 1, 0, 0, 0, 0], [240, 1, 1, 0, 0, null, 0], [300, 0, 0, 0, 0, null, 0]]);
  });
  it("logs a long wait only past its own sleep, and helpers decaying past their window", () => {
    const ci = (over: Partial<OfficeBeatV1> = {}) => beat(id("a"), { state: "ci", activity: "ci", ...over });
    expect(play([[0, ci()], [5 * 60_000, ci()]]).log.events).toHaveLength(1);
    expect(play([[0, ci()], [16 * 60_000, ci()]]).log.events).toEqual([[0, 0, 0, 4, 6, 0, 0], [960, 0, 0, 4, 6, null, 0]]);
    expect(play([[0, ci({ helpers: 2 })], [11 * 60_000, ci()]]).log.events).toEqual([[0, 0, 0, 4, 6, 0, 2], [660, 0, 0, 4, 6, null, 2]]);
  });
  it("logs a session that returns after the rollover in the same state", () => {
    const dead = applyBeat(publicDoc(), beat(id("a")), T0 - 2 * 3_600_000);
    const today = startLog(DAY, dead);
    expect(today.events).toEqual([]);
    const back = applyBeat(dead, beat(id("a")), T0 + 8 * 3_600_000);
    expect(logDoc(today, dead, back, T0 + 8 * 3_600_000).events).toEqual([[28_800, 0, 0, 0, 0, null, 0]]);
    // a live session missing from the row (it started empty) is logged on its next beat, even unchanged
    const live = applyBeat(publicDoc(), beat(id("a")), T0 - 60_000);
    const next = applyBeat(live, beat(id("a")), T0 + 10_000);
    expect(logDoc(emptyLog(DAY), live, next, T0 + 10_000).events).toEqual([[10, 0, 0, 0, 0, null, 0]]);
  });
  it("never logs backwards when the clock steps back", () => {
    const { log, doc } = play([[100_000, beat(id("a"))], [50_000, beat(id("a"), { state: "ci", activity: "ci" })]]);
    expect(log.events.map((e) => e[0])).toEqual([100, 100]);
    expect(parseOfficeHistory(historyDay(log, doc))).not.toBeNull();
  });
  it("serves a carried-in day with a negative until", () => {
    const doc = applyBeat(publicDoc(), beat(id("a"), { repo: "ShinyQ/ShinyQ-HQ", title: "Thing" }), T0 - 60_000);
    const served = historyDay(startLog(DAY, doc), doc);
    expect(served.events).toEqual([[0, 0, 0, 0, 0, -60, 0]]);
    expect(served.tasks).toEqual({ "0": { repo: "ShinyQ/ShinyQ-HQ", title: "Thing" } });
    expect(parseOfficeHistory(served)).not.toBeNull();
  });
  it("rolls over: closes yesterday from the doc and carries live sessions into today at t 0", () => {
    const { log, doc } = play([[86_000_000, beat(id("a"))]]);
    const closed = closeLog(log, doc);
    expect(closed.events[0][5]).toBe(86_000);
    const today = startLog("2026-10-21", doc);
    expect(today.events).toEqual([[0, 0, 0, 0, 0, null, 0]]);
    expect(secondsOf("2026-10-21", T0 + 86_000_000)).toBe(-400);
  });
  it("serves an index of 8 days, newest first, empty days as zeros", () => {
    const now = T0 + 3_600_000;
    const w = historyWindow(now);
    const idx = historyIndex(w, new Map([[logKey(DAY), play([[0, beat(id("a"))]]).log]]));
    expect(idx.days.map((d) => d.day)).toEqual(w);
    expect(idx.days[0]).toEqual({ day: DAY, events: 1, prs: 0, runs: 0, deploys: 0 });
    expect(idx.days[1]).toEqual({ day: w[1], events: 0, prs: 0, runs: 0, deploys: 0 });
    expect(parseOfficeHistoryIndex(idx)).not.toBeNull();
  });
  it("drops a repository no longer public and cleans titles at read time", () => {
    const { log, doc } = play([[0, beat(id("a"), { repo: "ShinyQ/ShinyQ-HQ", title: "Ship <the> fix" })]]);
    expect(historyDay(log, { ...doc, publicRepos: [] }).tasks).toEqual({});
    const h = cleanHistory(historyDay(log, doc), ["ShinyQ/*"]);
    expect(h.tasks["0"]).toEqual({ repo: "ShinyQ/ShinyQ-HQ", title: "Ship the fix" });
    expect(cleanHistory(historyDay(log, doc), ["Other/*"]).tasks).toEqual({});
  });
});
