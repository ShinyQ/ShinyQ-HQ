import { describe, expect, it } from "vitest";
import { cleanHistory, closeLog, emptyLog, HISTORY, historyDay, historyIndex, logDoc, logKey, scrubRepo, secondsOf, startLog } from "../../workers/office/src/history";
import { applyBeat, applyGithub, emptyDoc, type OfficeDoc } from "../../workers/office/src/state";
import { historyWindow, parseOfficeHistory, parseOfficeHistoryIndex } from "../../src/lib/office/protocolHistory";
import type { OfficeBeatV1 } from "../../src/lib/office/protocol";

const DAY = "2026-10-20";
const T0 = Date.UTC(2026, 9, 19, 17, 0, 0); // 00:00 WIB on 20 Oct
const id = (c: string) => c.repeat(64);
const beat = (session: string, over: Partial<OfficeBeatV1> = {}): OfficeBeatV1 => ({ v: 1, agent: "copilot", session, state: "working", activity: "editing", ts: 0, ...over });
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
    expect(log.events.at(-1)).toEqual([1860, 5, 0, 0, 0, null, 0]);
    expect(log.events.find((e) => e[1] === 0)?.[5]).toBe(0);
    expect(log.events.find((e) => e[1] === 5 && e[2] === 5)?.[5]).toBe(1200);
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
    const { doc } = play([[0, beat(id("a"), { repo: "ShinyQ/ShinyQ-HQ", branch: "feat/x" })]]);
    const changes = [
      { type: "run", id: 9, attempt: 1, branch: "feat/x", title: "CI", url: "https://github.com/ShinyQ/ShinyQ-HQ/actions/runs/9", status: "running" },
      { type: "run", id: 9, attempt: 1, branch: "feat/x", title: "CI", url: "https://github.com/ShinyQ/ShinyQ-HQ/actions/runs/9", status: "failure" },
      { type: "pr", number: 7, branch: "feat/x", title: "Thing", url: "https://github.com/ShinyQ/ShinyQ-HQ/pull/7", action: "merged" },
      { type: "deploy", id: 3, title: "Deploy · preview", url: "https://github.com/ShinyQ/ShinyQ-HQ/deployments", status: "success", production: false },
      { type: "deploy", id: 4, title: "Deploy · production", url: "https://github.com/ShinyQ/ShinyQ-HQ/deployments", status: "success", production: true },
    ] as const;
    let log = emptyLog(DAY);
    let d = doc;
    changes.forEach((c, i) => {
      const next = applyGithub(d, { repo: "ShinyQ/ShinyQ-HQ", changes: [c] }, `d${i}`, T0 + (i + 1) * 10_000);
      log = logDoc(log, d, next, T0 + (i + 1) * 10_000);
      d = next;
    });
    expect(log.runs).toEqual([[10, 20, 0, 0, 0]]);
    expect(log.prs).toEqual([[30, 0, "ShinyQ/ShinyQ-HQ", 7, "Thing"]]);
    expect(log.deploys).toEqual([[50, 1]]);
    expect(scrubRepo(log, "ShinyQ/ShinyQ-HQ").prs).toEqual([[30, 0, "", 7, ""]]);
  });
  it("caps every list, marks the day truncated and stays under the byte cap", () => {
    const states = ["working", "thinking"] as const;
    const steps: [number, OfficeBeatV1][] = Array.from({ length: HISTORY.events + 20 }, (_, i) => [i * 1000, beat(id("a"), { state: states[i % 2], repo: "ShinyQ/ShinyQ-HQ", title: "T".repeat(80) })]);
    const { log } = play(steps);
    expect(log.events.length).toBeLessThanOrEqual(HISTORY.events);
    expect(log.truncated).toBe(true);
    expect(new TextEncoder().encode(JSON.stringify(log)).length).toBeLessThanOrEqual(HISTORY.maxBytes);
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
    const { log, doc } = play([[0, beat(id("a"), { repo: "ShinyQ/ShinyQ-HQ", title: "Ship the secretword fix" })]]);
    expect(historyDay(log, { ...doc, publicRepos: [] }).tasks).toEqual({});
    const h = cleanHistory(historyDay(log, doc), ["ShinyQ/*"], ["secretword"]);
    expect(h.tasks["0"]).toEqual({ repo: "ShinyQ/ShinyQ-HQ" });
    expect(cleanHistory(historyDay(log, doc), ["Other/*"], []).tasks).toEqual({});
  });
});
