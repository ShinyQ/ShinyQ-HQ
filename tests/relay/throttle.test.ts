import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseOfficeBeat, type OfficeBeatV1 } from "@/lib/office/protocol";
import { applyBeat, effective, emptyDoc, TIMING, type OfficeDoc, type SessionRecord } from "../../workers/office/src/state";
import { COALESCE_MS, KEEPALIVE_MS } from "../../tools/office-relay/src/beat";
import { DUE_GRACE_MS, FLUSH_STALE_MS, flushSession, runHook, type HookDeps } from "../../tools/office-relay/src/hook";
import { readSent, relayPaths } from "../../tools/office-relay/src/store";
import { busySession, type HookCall } from "./busy-session";
import { HOOK_FIXTURES } from "./fixtures";

const T0 = Date.UTC(2026, 9, 20, 19, 0, 0);
const cp = HOOK_FIXTURES.copilot;
const json = (p: Record<string, unknown>) => JSON.stringify(p);

interface Job {
  session: string;
  due: number;
  token: string;
}

/**
 * A relay with a fake clock. `schedule` queues the trailing sender like the detached `flush` child; `at(t)` first runs
 * every sender due by `t` (each at its own wake time), then moves the clock to `t`.
 */
function relay(coalesceMs: number = COALESCE_MS, { flushers = true } = {}) {
  const home = mkdtempSync(path.join(tmpdir(), "relay-throttle-"));
  const sent: { at: number; beat: OfficeBeatV1 }[] = [];
  const jobs: Job[] = [];
  let clock = T0;
  let scheduled = 0;
  const d: HookDeps = {
    paths: relayPaths({ HOME: home }),
    now: () => clock,
    readGit: () => ({ repo: "ShinyQ/ShinyQ-HQ", branch: "fix/office-relay-throttle" }),
    dispatch: (body) => void sent.push({ at: clock, beat: JSON.parse(body) as OfficeBeatV1 }),
    schedule: (session, due, token) => {
      scheduled++;
      if (flushers) jobs.push({ session, due, token });
    },
    coalesceMs,
  };
  const at = (t: number) => {
    for (;;) {
      jobs.sort((a, b) => a.due - b.due);
      const job = jobs[0];
      if (!job || job.due > t) break;
      jobs.shift();
      clock = Math.max(clock, job.due);
      const step = flushSession(d.paths, job.session, job.token, clock, coalesceMs);
      if (step.body) sent.push({ at: clock, beat: JSON.parse(step.body) as OfficeBeatV1 });
      if (step.due !== undefined) jobs.push({ ...job, due: step.due });
    }
    clock = Math.max(clock, t);
  };
  const hook = (event: string, payload: Record<string, unknown>) => runHook("copilot", event, json(payload), d);
  return { d, sent, jobs, at, hook, home, scheduled: () => scheduled, now: () => clock };
}

function replay(calls: HookCall[], coalesceMs: number, opts?: { flushers?: boolean }) {
  const r = relay(coalesceMs, opts);
  for (const c of calls) {
    r.at(c.at);
    runHook(c.agent, c.event, json(c.payload), r.d);
  }
  r.at(calls.at(-1)!.at + 60_000);
  return r;
}

/** The desk timeline the office Worker builds from the beats. */
function docs(sent: { at: number; beat: OfficeBeatV1 }[]): { at: number; doc: OfficeDoc }[] {
  let doc = emptyDoc(T0);
  return sent.map(({ at, beat }) => {
    expect(parseOfficeBeat(beat)).not.toBeNull();
    doc = applyBeat(doc, beat, at);
    return { at, doc };
  });
}

const deskAt = (timeline: { at: number; doc: OfficeDoc }[], t: number): SessionRecord | undefined => timeline.filter((x) => x.at <= t).at(-1)?.doc.sessions[0];
const shown = (s: SessionRecord | undefined) => s && { state: s.state, activity: s.activity, helpers: s.helpers ?? 0, repo: s.repo, branch: s.branch, title: s.title };

describe("office relay throttle: a recorded busy session", () => {
  const calls = busySession(T0, 300);
  // The relay before the throttle: every change at once, a repeat only as a 15 s keepalive (window 0, no trailing sender).
  const before = replay(calls, 0, { flushers: false });
  const after = replay(calls, COALESCE_MS);
  const end = calls.at(-1)!.at;

  it("is a busy session: about 300 hook events over about ten minutes, and the relay before sent a beat for every other desk event", () => {
    expect(calls.length).toBeGreaterThanOrEqual(300);
    expect(end - T0).toBeGreaterThan(8 * 60_000);
    expect(end - T0).toBeLessThan(14 * 60_000);
    expect(before.sent.length / calls.filter((c) => c.main).length).toBeGreaterThan(0.5);
  });

  it("cuts the beats by at least 80% of the events", () => {
    expect(after.sent.length).toBeLessThanOrEqual(0.2 * calls.length);
    expect(after.sent.length).toBeLessThan(0.6 * before.sent.length);
  });

  it("ends with the same desk as sending every change", () => {
    const a = docs(before.sent);
    const b = docs(after.sent);
    for (const t of [end, end + 1000, end + TIMING.doneFor + 1000]) {
      expect(shown(deskAt(b, t))).toEqual(shown(deskAt(a, t)));
      const [x, y] = [deskAt(a, t)!, deskAt(b, t)!];
      expect(effective(y, t)?.state).toBe(effective(x, t)?.state);
    }
    expect(b.at(-1)!.doc.today.tasksDone).toBe(a.at(-1)!.doc.today.tasksDone);
  });

  it("shows every desk at most one window late: the desk at t is one the relay before showed between t - 10 s and t", () => {
    const a = docs(before.sent);
    const b = docs(after.sent);
    const key = (s: SessionRecord | undefined) => JSON.stringify(shown(s));
    for (let t = T0; t <= end + 1000; t += 250) {
      const seen = new Set([key(deskAt(a, t - COALESCE_MS - 50)), ...a.filter((x) => x.at > t - COALESCE_MS - 50 && x.at <= t).map((x) => key(x.doc.sessions[0]))]);
      expect(seen, `at +${t - T0} ms`).toContain(key(deskAt(b, t)));
    }
  });

  it("never lets an active desk fall to thinking: the 20 s rule shows only after 20 s without a desk event", () => {
    const b = docs(after.sent);
    const mainAt = calls.filter((c) => c.main).map((c) => c.at);
    for (let t = T0 + 1; t <= end; t += 250) {
      const desk = deskAt(b, t);
      if (!desk) continue;
      const shownNow = effective(desk, t);
      if (shownNow?.state !== "thinking" || desk.state === "thinking") continue;
      const last = mainAt.filter((m) => m <= t).at(-1)!;
      expect(t - last, `rule thinking at +${t - T0} ms`).toBeGreaterThanOrEqual(TIMING.thinkingAfter);
    }
  });

  it("sends final states at once, with no beat in between", () => {
    for (const c of calls.filter((x) => x.event === "agentStop" || x.event === "notification")) {
      const beat = after.sent.find((s) => s.at === c.at && (s.beat.state === "done" || s.beat.state === "input"));
      expect(beat, `${c.event} at +${c.at - T0} ms`).toBeDefined();
    }
  });

  it("keeps one trailing sender per session at a time", () => {
    expect(after.scheduled()).toBeLessThanOrEqual(after.sent.length);
  });
});

describe("office relay throttle: the rule", () => {
  const states = (sent: { beat: OfficeBeatV1 }[]) => sent.map((s) => `${s.beat.state}/${s.beat.activity}`);
  const pre = (toolName: string, toolArgs: Record<string, unknown> = { path: "src/x.ts" }) => ({ ...cp.preToolUse, toolName, toolArgs });
  const post = (toolName: string, toolArgs: Record<string, unknown> = { path: "src/x.ts" }) => ({ ...cp.postToolUseView, toolName, toolArgs });

  it("sends the first change at once, queues the rest of the window and sends only the newest at its end", () => {
    const r = relay();
    expect(r.hook("preToolUse", pre("view"))).toBe("sent");
    r.at(T0 + 500);
    expect(r.hook("postToolUse", post("bash", { command: "ls" }))).toBe("queued");
    r.at(T0 + 900);
    expect(r.hook("preToolUse", pre("edit"))).toBe("queued");
    r.at(T0 + 1300);
    expect(r.hook("preToolUse", pre("bash", { command: "bun run test" }))).toBe("queued");
    expect(r.scheduled()).toBe(1);
    r.at(T0 + COALESCE_MS - 1);
    expect(r.sent).toHaveLength(1);
    r.at(T0 + COALESCE_MS);
    expect(states(r.sent)).toEqual(["reviewing/reading", "testing/testing"]);
    expect(r.sent[1].at).toBe(T0 + COALESCE_MS);
    expect(readSent(r.d.paths, r.sent[0].beat.session)).not.toHaveProperty("next");
  });

  it("drops a change that flaps back to the sent state inside the window", () => {
    const r = relay();
    r.hook("preToolUse", pre("view"));
    r.at(T0 + 300);
    expect(r.hook("postToolUse", post("report_intent", {}))).toBe("queued");
    r.at(T0 + 2000);
    expect(r.hook("preToolUse", pre("grep"))).toBe("skipped");
    r.at(T0 + COALESCE_MS + 1);
    expect(states(r.sent)).toEqual(["reviewing/reading"]);
  });

  it("sends a change at once when the window has passed", () => {
    const r = relay();
    r.hook("preToolUse", pre("view"));
    r.at(T0 + COALESCE_MS);
    expect(r.hook("preToolUse", pre("edit"))).toBe("sent");
    expect(states(r.sent)).toEqual(["reviewing/reading", "working/editing"]);
  });

  it("sends a final state at once inside the window and cancels the queued change", () => {
    for (const [event, payload, state] of [
      ["agentStop", cp.agentStop, "done"],
      ["sessionEnd", cp.sessionEnd, "asleep"],
      ["errorOccurred", cp.errorOccurred, "asleep"],
      ["notification", cp.notification, "input"],
      ["permissionRequest", cp.permissionRequest, "input"],
      ["postToolUseFailure", cp.postToolUseFailureCi, "failed"],
    ] as const) {
      const r = relay();
      r.hook("preToolUse", pre("view"));
      r.at(T0 + 200);
      expect(r.hook("preToolUse", pre("edit"))).toBe("queued");
      r.at(T0 + 400);
      expect(r.hook(event, payload), event).toBe("sent");
      r.at(T0 + 60_000);
      expect(r.sent.map((s) => s.beat.state), event).toEqual(["reviewing", state]);
      expect(r.sent[1].at).toBe(T0 + 400);
    }
  });

  it("sends the keepalive from the trailing sender 15 s after the last beat while events keep coming", () => {
    const r = relay();
    r.hook("preToolUse", pre("view"));
    for (let t = 1000; t < 40_000; t += 3000) {
      r.at(T0 + t);
      r.hook("preToolUse", pre("grep"));
    }
    r.at(T0 + 120_000);
    const gaps = r.sent.slice(1).map((s, i) => s.at - r.sent[i].at);
    expect(gaps.every((g) => g <= KEEPALIVE_MS)).toBe(true);
    // The last event came at +37 s: one keepalive after it (at +45 s), then nothing.
    expect(r.sent.at(-1)!.at).toBe(T0 + 3 * KEEPALIVE_MS);
    expect(new Set(states(r.sent))).toEqual(new Set(["reviewing/reading"]));
  });

  it("sends no keepalive after a final state or without events since the last beat", () => {
    const r = relay();
    r.hook("agentStop", cp.agentStop);
    r.at(T0 + 1000);
    expect(r.hook("agentStop", cp.agentStop)).toBe("skipped");
    r.at(T0 + 120_000);
    expect(r.sent).toHaveLength(1);
    const q = relay();
    q.hook("preToolUse", pre("view"));
    q.at(T0 + 120_000);
    expect(q.sent).toHaveLength(1);
    expect(q.scheduled()).toBe(0);
  });

  it("counts a helper inside the window on the newest state", () => {
    const r = relay();
    r.hook("preToolUse", pre("view"));
    r.at(T0 + 300);
    r.hook("preToolUse", pre("edit"));
    r.at(T0 + 600);
    expect(r.hook("subagentStart", cp.subagentStart)).toBe("queued");
    r.at(T0 + COALESCE_MS);
    expect(r.sent.at(-1)!.beat).toMatchObject({ state: "working", activity: "editing", helpers: 1 });
    expect(r.sent).toHaveLength(2);
  });

  it("starts a new trailing sender when the old one is gone, and the old token does nothing", () => {
    const r = relay(COALESCE_MS, { flushers: false });
    r.hook("preToolUse", pre("view"));
    r.at(T0 + 200);
    r.hook("preToolUse", pre("edit"));
    const session = r.sent[0].beat.session;
    const old = readSent(r.d.paths, session)!.dueBy!;
    r.at(T0 + COALESCE_MS + DUE_GRACE_MS + 1);
    expect(r.hook("preToolUse", pre("bash", { command: "bun run test" }))).toBe("sent");
    r.at(T0 + COALESCE_MS + DUE_GRACE_MS + 500);
    expect(r.hook("preToolUse", pre("edit"))).toBe("queued");
    expect(r.scheduled()).toBe(2);
    expect(flushSession(r.d.paths, session, old, T0 + 60_000)).toEqual({});
    expect(readSent(r.d.paths, session)!.dueBy).not.toBe(old);
  });

  it("drops a trailing send that wakes long after its event (the Mac slept)", () => {
    const r = relay(COALESCE_MS, { flushers: false });
    r.hook("preToolUse", pre("view"));
    r.at(T0 + 200);
    r.hook("preToolUse", pre("edit"));
    const session = r.sent[0].beat.session;
    const token = readSent(r.d.paths, session)!.dueBy!;
    expect(flushSession(r.d.paths, session, token, T0 + 200 + FLUSH_STALE_MS + 1)).toEqual({ body: undefined, due: undefined });
    expect(readSent(r.d.paths, session)).not.toHaveProperty("next");
    expect(readSent(r.d.paths, session)).not.toHaveProperty("dueBy");
  });

  it("sends nothing from the trailing sender while paused", () => {
    const r = relay();
    r.hook("preToolUse", pre("view"));
    r.at(T0 + 200);
    r.hook("preToolUse", pre("edit"));
    writeFileSync(r.d.paths.pause, "");
    r.at(T0 + 60_000);
    expect(r.sent).toHaveLength(1);
  });

  it("keeps the keepalive and the trailing window inside the office's 20 s thinking rule, with room for a late sender", () => {
    expect(COALESCE_MS).toBeLessThan(KEEPALIVE_MS);
    expect(TIMING.thinkingAfter - KEEPALIVE_MS).toBeGreaterThanOrEqual(DUE_GRACE_MS);
  });
});
