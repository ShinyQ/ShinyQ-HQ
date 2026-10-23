import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync, type Dirent } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { OFFICE_AGENTS, parseOfficeBeat } from "@/lib/office/protocol";
import { KEEPALIVE_MS } from "../../tools/office-relay/src/beat";
import { hashHelper, HELPER_TTL_MS } from "../../tools/office-relay/src/helpers";
import { runHook, type HookDeps } from "../../tools/office-relay/src/hook";
import { helpersFile, loadSalt, relayPaths } from "../../tools/office-relay/src/store";
import { CLIENT, eventOf, HELPER_EVENTS, HELPER_ID, HELPER_TYPE, HOOK_FIXTURES, PLANTED } from "./fixtures";

const T0 = Date.UTC(2026, 9, 18, 8, 0, 0);

/**
 * Most tests check what a beat says, so they turn the coalescing window off (`coalesceMs: 0`: every change goes out
 * at once, repeats only as the keepalive, the rule before the throttle). The throttle has its own tests in
 * tests/relay/throttle.test.ts.
 */
function deps(git: { repo: string; branch?: string } | null = { repo: "ShinyQ/ShinyQ-HQ", branch: "feat/intro-orbit-reveal" }, coalesceMs = 0) {
  const home = mkdtempSync(path.join(tmpdir(), "relay-home-"));
  const sent: string[] = [];
  let clock = T0;
  const d: HookDeps = { paths: relayPaths({ HOME: home }), now: () => clock, readGit: () => git, dispatch: (body) => void sent.push(body), schedule: () => undefined, coalesceMs };
  return { d, sent, home, tick: (ms: number) => (clock += ms) };
}

describe("runHook", () => {
  it("sends only schema fields for every fixture of every agent, and nothing planted", () => {
    for (const agent of OFFICE_AGENTS) {
      for (const [key, payload] of Object.entries(HOOK_FIXTURES[agent])) {
        const { d, sent, home } = deps();
        runHook(agent, eventOf(agent, key), JSON.stringify(payload), d);
        for (const body of sent) {
          const beat = parseOfficeBeat(JSON.parse(body));
          expect(beat, `${agent} ${key}`).not.toBeNull();
          expect(Object.keys(JSON.parse(body)).every((k) => ["v", "agent", "session", "state", "activity", "repo", "branch", "title", "helpers", "ts"].includes(k))).toBe(true);
          for (const secret of PLANTED) expect(body, `${agent} ${key}`).not.toContain(secret);
        }
        const log = readFileSync(path.join(home, ".office-relay", "relay.log"), { encoding: "utf8", flag: "a+" });
        for (const secret of PLANTED) expect(log).not.toContain(secret);
      }
    }
  });

  it("adds repository, branch and title only for allowlisted remotes", () => {
    const yes = deps();
    runHook("claude", "UserPromptSubmit", JSON.stringify(HOOK_FIXTURES.claude.UserPromptSubmit), yes.d);
    expect(JSON.parse(yes.sent[0])).toMatchObject({ repo: "ShinyQ/ShinyQ-HQ", branch: "feat/intro-orbit-reveal", title: "Intro orbit reveal" });
    const no = deps({ repo: "client/portal", branch: "feat/login" });
    runHook("claude", "UserPromptSubmit", JSON.stringify(HOOK_FIXTURES.claude.UserPromptSubmit), no.d);
    expect(JSON.parse(no.sent[0])).not.toHaveProperty("repo");
    expect(no.sent[0]).not.toContain("portal");
  });

  it("drops a branch the beat schema rejects but still sends the allowlisted repository", () => {
    const { d, sent } = deps({ repo: "ShinyQ/ShinyQ-HQ", branch: "feat/\u00fcnicode" });
    expect(runHook("claude", "UserPromptSubmit", JSON.stringify(HOOK_FIXTURES.claude.UserPromptSubmit), d)).toBe("sent");
    const beat = JSON.parse(sent[0]);
    expect(beat.repo).toBe("ShinyQ/ShinyQ-HQ");
    expect(beat).not.toHaveProperty("branch");
    expect(beat).not.toHaveProperty("title");
  });

  it("dedupes repeats, sends a keepalive after 15 s and a change at once (no coalescing window)", () => {
    const { d, sent, tick } = deps();
    const edit = JSON.stringify(HOOK_FIXTURES.claude.PostToolUseEdit);
    expect(runHook("claude", "PostToolUse", edit, d)).toBe("sent");
    tick(1000);
    expect(runHook("claude", "PostToolUse", edit, d)).toBe("skipped");
    tick(KEEPALIVE_MS);
    expect(runHook("claude", "PostToolUse", edit, d)).toBe("sent");
    tick(1000);
    expect(runHook("claude", "PostToolUse", JSON.stringify(HOOK_FIXTURES.claude.PostToolUseRead), d)).toBe("sent");
    expect(sent.map((b) => JSON.parse(b).state)).toEqual(["working", "working", "reviewing"]);
  });

  it("does not record a beat as sent when dispatch throws", () => {
    const { d, sent, tick } = deps();
    const edit = JSON.stringify(HOOK_FIXTURES.claude.PostToolUseEdit);
    const failing: HookDeps = { ...d, dispatch: () => { throw new Error("spawn failed"); } };
    expect(() => runHook("claude", "PostToolUse", edit, failing)).toThrow("spawn failed");
    tick(1000);
    expect(runHook("claude", "PostToolUse", edit, d)).toBe("sent");
    expect(sent).toHaveLength(1);
  });

  it("does nothing while paused, on unknown events, bad JSON or unknown agents", () => {
    const { d, sent } = deps();
    writeFileSync(d.paths.pause, "");
    expect(runHook("copilot", "agentStop", JSON.stringify(HOOK_FIXTURES.copilot.agentStop), d)).toBe("paused");
    const other = deps();
    expect(runHook("copilot", "sessionStart", JSON.stringify(HOOK_FIXTURES.copilot.sessionStart), other.d)).toBe("ignored");
    expect(runHook("copilot", "agentStop", "{not json", other.d)).toBe("ignored");
    expect(runHook("cursor", "agentStop", "{}", other.d)).toBe("ignored");
    expect([...sent, ...other.sent]).toEqual([]);
  });

  it("uses a stable salted session hash per raw session", () => {
    const { d, sent, tick } = deps();
    runHook("codex", "UserPromptSubmit", JSON.stringify(HOOK_FIXTURES.codex.UserPromptSubmit), d);
    tick(1000);
    runHook("codex", "Stop", JSON.stringify(HOOK_FIXTURES.codex.Stop), d);
    const [a, b] = sent.map((s) => JSON.parse(s).session);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("runHook: Copilot permission checks", () => {
  const cp = HOOK_FIXTURES.copilot;
  const json = (p: Record<string, unknown>) => JSON.stringify(p);
  const states = (sent: string[]) => sent.map((b) => JSON.parse(b).state);

  it("keeps the desk working when an auto-approved permissionRequest follows the preToolUse (the reported sequence)", () => {
    const { d, sent, tick, home } = deps();
    const shell = { ...cp.preToolUse, toolArgs: { command: "gh run watch 123 --exit-status" } };
    expect(runHook("copilot", "preToolUse", json(shell), d)).toBe("sent");
    tick(92);
    expect(runHook("copilot", "permissionRequest", json(cp.permissionRequest), d)).toBe("ignored");
    tick(60_000);
    expect(runHook("copilot", "postToolUse", json(cp.postToolUseBash), d)).toBe("sent");
    expect(states(sent)).toEqual(["ci", "thinking"]);
    const log = readFileSync(path.join(home, ".office-relay", "relay.log"), "utf8");
    expect(log).toContain("copilot permissionRequest after-tool ignored");
    for (const secret of PLANTED) expect(log).not.toContain(secret);
  });

  it("also covers tools the office does not map, such as MCP tools", () => {
    const { d, sent, tick } = deps();
    expect(runHook("copilot", "preToolUse", json(cp.preToolUseMcp), d)).toBe("ignored");
    tick(300);
    expect(runHook("copilot", "permissionRequest", json({ ...cp.permissionRequest, toolName: "github-mcp-server-get_file_contents" }), d)).toBe("ignored");
    expect(sent).toEqual([]);
  });

  it("shows Needs Kurniadi for a permissionRequest with no recent preToolUse", () => {
    const { d, sent } = deps();
    expect(runHook("copilot", "permissionRequest", json(cp.permissionRequest), d)).toBe("sent");
    expect(states(sent)).toEqual(["input"]);
  });

  it("shows Needs Kurniadi when the permissionRequest comes too late, for another tool or in another session", () => {
    const late = deps();
    runHook("copilot", "preToolUse", json(cp.preToolUse), late.d);
    late.tick(2_000);
    expect(runHook("copilot", "permissionRequest", json(cp.permissionRequest), late.d)).toBe("sent");
    expect(states(late.sent)).toEqual(["testing", "input"]);

    const other = deps();
    runHook("copilot", "preToolUse", json(cp.preToolUseMcp), other.d);
    other.tick(92);
    expect(runHook("copilot", "permissionRequest", json(cp.permissionRequest), other.d)).toBe("sent");
    expect(states(other.sent)).toEqual(["input"]);

    const session = deps();
    runHook("copilot", "preToolUse", json(cp.preToolUse), session.d);
    session.tick(92);
    expect(runHook("copilot", "permissionRequest", json({ ...cp.permissionRequest, sessionId: "another-session" }), session.d)).toBe("sent");
    expect(states(session.sent)).toEqual(["testing", "input"]);
  });

  it("shows Needs Kurniadi when Copilot really prompts (the permission_prompt notification)", () => {
    const { d, sent, tick } = deps();
    runHook("copilot", "preToolUse", json(cp.preToolUse), d);
    tick(92);
    expect(runHook("copilot", "permissionRequest", json(cp.permissionRequest), d)).toBe("ignored");
    tick(200);
    expect(runHook("copilot", "notification", json(cp.notification), d)).toBe("sent");
    expect(states(sent)).toEqual(["testing", "input"]);
  });

  it("keeps Claude and Codex permission requests as Needs Kurniadi (they fire only when a prompt is shown)", () => {
    for (const agent of ["claude", "codex"] as const) {
      const { d, sent, tick } = deps();
      runHook(agent, "PreToolUse", json(HOOK_FIXTURES[agent].PreToolUse), d);
      tick(92);
      expect(runHook(agent, "PermissionRequest", json(HOOK_FIXTURES[agent].PermissionRequest), d)).toBe("sent");
      expect(states(sent)).toEqual(["testing", "input"]);
    }
  });
});

describe("runHook: sub-agent helpers (count only)", () => {
  const json = (p: Record<string, unknown>) => JSON.stringify(p);
  const beats = (sent: string[]) => sent.map((b) => JSON.parse(b) as Record<string, unknown>);
  const prompt = { copilot: "userPromptSubmitted", claude: "UserPromptSubmit", codex: "UserPromptSubmit" } as const;

  function expectClean(body: string, home: string) {
    const hashed = hashHelper(HELPER_ID, loadSalt(relayPaths({ HOME: home })));
    for (const secret of PLANTED) expect(body).not.toContain(secret);
    expect(body).not.toMatch(/sk-live-secret/);
    expect(body).not.toMatch(new RegExp(CLIENT.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
    expect(body).not.toMatch(/\/Users\/someone\/private/);
    expect(body).not.toMatch(new RegExp(HELPER_ID));
    expect(body).not.toMatch(new RegExp(HELPER_TYPE, "i"));
    expect(body).not.toMatch(/onboarding/i);
    expect(body).not.toContain(hashed);
  }

  /** dispatch is the only sink: the home holds nothing but the relay's own state and log, and no file holds a beat. */
  function expectOnlyRelayFiles(home: string, sent: string[]) {
    const files = (readdirSync(home, { recursive: true, withFileTypes: true }) as Dirent[]).filter((f) => f.isFile()).map((f) => path.relative(home, path.join(f.parentPath, f.name)));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      expect(file).toMatch(/^\.office-relay\/(salt|relay\.log|sessions\/[0-9a-f]{32}(\.tool|\.helpers)?\.json)$/);
      const text = readFileSync(path.join(home, file), "utf8");
      for (const body of sent) expect(text).not.toContain(body);
    }
  }

  for (const agent of OFFICE_AGENTS) {
    const { start, stop } = HELPER_EVENTS[agent];
    const fx = HOOK_FIXTURES[agent];

    it(`${agent}: a start sends helpers 1 with the session's last state, a stop sends 0, and nothing private leaves`, () => {
      const { d, sent, tick, home } = deps();
      expect(runHook(agent, prompt[agent], json(fx[prompt[agent]]), d)).toBe("sent");
      tick(500);
      const before = sent.length;
      const out = vi.spyOn(process.stdout, "write");
      const err = vi.spyOn(process.stderr, "write");
      try {
        // Synchronous: the beat is handed to dispatch before runHook returns.
        expect(runHook(agent, start, json(fx[start]), d)).toBe("sent");
        expect(sent.length).toBe(before + 1);
        expect(out).not.toHaveBeenCalled();
        expect(err).not.toHaveBeenCalled();
      } finally {
        out.mockRestore();
        err.mockRestore();
      }
      expectOnlyRelayFiles(home, sent);
      const [first, started] = beats(sent);
      expect(started).toMatchObject({ v: 1, agent, session: first.session, state: "thinking", activity: "planning", helpers: 1 });
      expect(parseOfficeBeat(started)).not.toBeNull();

      tick(500);
      expect(runHook(agent, stop, json(fx[stop]), d)).toBe("sent");
      expect(beats(sent).at(-1)).toMatchObject({ session: first.session, state: "thinking", helpers: 0 });

      for (const body of sent) expectClean(body, home);
      const log = readFileSync(path.join(home, ".office-relay", "relay.log"), "utf8");
      expectClean(log, home);
      expect(log).toContain(`${agent} ${start} helpers 1 sent`);
      expect(log).toContain(`${agent} ${stop} helpers 0 sent`);
    });
  }

  for (const agent of ["claude", "codex"] as const) {
    it(`${agent}: a second start with the same helper id sends nothing; a stop for an unknown helper changes nothing`, () => {
      const { d, sent, tick } = deps();
      const { start, stop } = HELPER_EVENTS[agent];
      expect(runHook(agent, start, json(HOOK_FIXTURES[agent][start]), d)).toBe("sent");
      tick(KEEPALIVE_MS + 1);
      expect(runHook(agent, start, json(HOOK_FIXTURES[agent][start]), d)).toBe("skipped");
      expect(runHook(agent, stop, json({ ...HOOK_FIXTURES[agent][stop], agent_id: "agent-internal" }), d)).toBe("skipped");
      tick(10);
      expect(runHook(agent, stop, json(HOOK_FIXTURES[agent][stop]), d)).toBe("sent");
      expect(beats(sent).map((b) => b.helpers)).toEqual([1, 0]);
    });
  }

  it("a helper stop that read the clock before another hook took the lock still sends at once (lock order, not read order)", () => {
    const { d, sent, tick } = deps();
    const cp = HOOK_FIXTURES.copilot;
    expect(runHook("copilot", "subagentStart", json(cp.subagentStart), d)).toBe("sent");
    tick(10);
    expect(runHook("copilot", "subagentStart", json({ ...cp.subagentStart, agentId: "helper-b" }), d)).toBe("sent");
    tick(10);
    expect(runHook("copilot", "subagentStop", json(cp.subagentStop), d)).toBe("sent");
    // The second stop read the clock 5 ms before the first stop's beat went out, then got the lock.
    let reads = 0;
    const late: HookDeps = { ...d, now: () => (reads++ === 0 ? T0 + 15 : T0 + 25) };
    expect(runHook("copilot", "subagentStop", json({ ...cp.subagentStop, agentId: "helper-b" }), late)).toBe("sent");
    expect(beats(sent).map((b) => b.helpers)).toEqual([1, 2, 1, 0]);
  });

  it("copilot: the start and stop name the helper by agentId; a start without one counts anonymously", () => {
    const { d, sent, tick } = deps();
    const cp = HOOK_FIXTURES.copilot;
    const other = { ...cp.subagentStart, agentId: "helper-b" };
    expect(runHook("copilot", "subagentStart", json(cp.subagentStart), d)).toBe("sent");
    tick(10);
    expect(runHook("copilot", "subagentStart", json(cp.subagentStart), d)).toBe("skipped");
    expect(runHook("copilot", "subagentStart", json(other), d)).toBe("sent");
    tick(10);
    // Out of order: the second helper stops first, and its own id ends it.
    expect(runHook("copilot", "subagentStop", json({ ...cp.subagentStop, agentId: "helper-b" }), d)).toBe("sent");
    tick(10);
    expect(runHook("copilot", "subagentStop", json(cp.subagentStop), d)).toBe("sent");
    expect(runHook("copilot", "subagentStop", json(cp.subagentStop), d)).toBe("skipped");
    // The npm build: no agentId on the start, the stop's agentId is unknown, so it ends the oldest anonymous helper.
    tick(10);
    expect(runHook("copilot", "subagentStart", json(cp.subagentStartAnon), d)).toBe("sent");
    tick(10);
    expect(runHook("copilot", "subagentStop", json(cp.subagentStop), d)).toBe("sent");
    expect(beats(sent).map((b) => b.helpers)).toEqual([1, 2, 1, 0, 1, 0]);
  });

  it("a helper of a session with no beat yet shows the desk working", () => {
    const { d, sent } = deps();
    expect(runHook("claude", "SubagentStart", json(HOOK_FIXTURES.claude.SubagentStart), d)).toBe("sent");
    expect(beats(sent)[0]).toMatchObject({ state: "working", activity: "editing", helpers: 1, repo: "ShinyQ/ShinyQ-HQ" });
  });

  it("ignores a helper event without a parent session id", () => {
    const { d, sent, home } = deps();
    const orphan: Record<string, unknown> = { ...HOOK_FIXTURES.claude.SubagentStart };
    delete orphan.session_id;
    expect(runHook("claude", "SubagentStart", json(orphan), d)).toBe("ignored");
    expect(sent).toEqual([]);
    expect(readFileSync(path.join(home, ".office-relay", "relay.log"), "utf8")).toContain("claude SubagentStart no-parent ignored");
  });

  it("other beats carry the live count, then 0 once, then nothing", () => {
    const { d, sent, tick } = deps();
    const cl = HOOK_FIXTURES.claude;
    runHook("claude", "UserPromptSubmit", json(cl.UserPromptSubmit), d);
    expect(beats(sent)[0]).not.toHaveProperty("helpers");
    tick(10);
    runHook("claude", "SubagentStart", json(cl.SubagentStart), d);
    tick(10);
    runHook("claude", "PostToolUse", json(cl.PostToolUseEdit), d);
    expect(beats(sent).at(-1)).toMatchObject({ state: "working", helpers: 1 });
    tick(10);
    runHook("claude", "SubagentStop", json(cl.SubagentStop), d);
    tick(10);
    runHook("claude", "PostToolUse", json(cl.PostToolUseRead), d);
    expect(beats(sent).map((b) => b.helpers)).toEqual([undefined, 1, 1, 0, undefined]);
  });

  it("a helper with no stop expires after the TTL and the next beat sends 0", () => {
    const { d, sent, tick } = deps();
    const cl = HOOK_FIXTURES.claude;
    runHook("claude", "SubagentStart", json(cl.SubagentStart), d);
    tick(HELPER_TTL_MS);
    expect(runHook("claude", "PostToolUse", json(cl.PostToolUseEdit), d)).toBe("sent");
    expect(beats(sent).map((b) => b.helpers)).toEqual([1, 0]);
  });

  it("counts helpers per parent session", () => {
    const { d, sent, tick } = deps();
    const cl = HOOK_FIXTURES.claude;
    runHook("claude", "SubagentStart", json(cl.SubagentStart), d);
    tick(10);
    runHook("claude", "SubagentStart", json({ ...cl.SubagentStart, session_id: "another-session" }), d);
    const [a, b] = beats(sent);
    expect(a.session).not.toBe(b.session);
    expect([a.helpers, b.helpers]).toEqual([1, 1]);
  });

  const sessionEnd = { copilot: "sessionEnd", claude: "SessionEnd", codex: "SessionEnd" } as const;
  for (const agent of OFFICE_AGENTS) {
    it(`${agent}: the session end deletes the helpers file and sends helpers 0 once, or no count when none was sent`, () => {
      const { d, sent, tick } = deps();
      const fx = HOOK_FIXTURES[agent];
      const { start } = HELPER_EVENTS[agent];
      expect(runHook(agent, start, json(fx[start]), d)).toBe("sent");
      const session = beats(sent)[0].session as string;
      expect(existsSync(helpersFile(d.paths, session))).toBe(true);
      tick(10);
      expect(runHook(agent, sessionEnd[agent], json(fx[sessionEnd[agent]]), d)).toBe("sent");
      expect(beats(sent).at(-1)).toMatchObject({ session, state: "asleep", helpers: 0 });
      expect(existsSync(helpersFile(d.paths, session))).toBe(false);
      expect(readdirSync(d.paths.sessions).filter((f) => f.endsWith(".lock") || f.endsWith(".tmp"))).toEqual([]);

      // A session that never sent a count ends without one.
      const other = { ...fx[sessionEnd[agent]], ...(agent === "copilot" ? { sessionId: "quiet-session" } : { session_id: "quiet-session" }) };
      tick(10);
      expect(runHook(agent, sessionEnd[agent], json(other), d)).toBe("sent");
      expect(beats(sent).at(-1)).toMatchObject({ state: "asleep" });
      expect(beats(sent).at(-1)).not.toHaveProperty("helpers");
    });
  }

  it("stays quiet while paused", () => {
    const { d, sent } = deps();
    writeFileSync(d.paths.pause, "");
    expect(runHook("codex", "SubagentStart", json(HOOK_FIXTURES.codex.SubagentStart), d)).toBe("paused");
    expect(sent).toEqual([]);
  });

  it("returns within a few milliseconds", () => {
    const { d, tick } = deps();
    const t = performance.now();
    for (let i = 0; i < 20; i++) {
      tick(10);
      runHook("claude", i % 2 ? "SubagentStop" : "SubagentStart", json(HOOK_FIXTURES.claude[i % 2 ? "SubagentStop" : "SubagentStart"]), d);
    }
    expect((performance.now() - t) / 20).toBeLessThan(50);
  });
});

describe("runHook: a helper counts once, as a drone, never as its own desk", () => {
  const json = (p: Record<string, unknown>) => JSON.stringify(p);
  const beats = (sent: string[]) => sent.map((b) => JSON.parse(b) as Record<string, unknown>);

  it("copilot: ignores a tool event from inside a helper (its own session id, agentId set) and logs no payload text", () => {
    const { d, sent, home } = deps();
    const cp = HOOK_FIXTURES.copilot;
    expect(runHook("copilot", "preToolUse", json(cp.preToolUseInHelper), d)).toBe("ignored");
    const { agentId, ...snake } = cp.preToolUseInHelper;
    expect(agentId).toBe(HELPER_ID);
    expect(runHook("copilot", "PostToolUse", json({ ...snake, agent_id: HELPER_ID }), d)).toBe("ignored");
    for (const event of ["postToolUse", "agentStop", "sessionEnd", "permissionRequest"]) expect(runHook("copilot", event, json(cp.preToolUseInHelper), d)).toBe("ignored");
    expect(sent).toEqual([]);
    expect(existsSync(d.paths.sessions)).toBe(false);
    const log = readFileSync(path.join(home, ".office-relay", "relay.log"), "utf8");
    expect(log).toContain("copilot preToolUse helper-event ignored");
    expect(log).toContain("copilot PostToolUse helper-event ignored");
    for (const secret of PLANTED) expect(log).not.toContain(secret);
  });

  it("copilot: the parent's own tool events still send, and an empty agentId is no helper", () => {
    const { d, sent } = deps();
    const cp = HOOK_FIXTURES.copilot;
    expect(runHook("copilot", "preToolUse", json(cp.preToolUse), d)).toBe("sent");
    expect(runHook("copilot", "postToolUse", json({ ...cp.postToolUseEdit, agentId: "" }), d)).toBe("sent");
    expect(sent.map((b) => JSON.parse(b).state)).toEqual(["testing", "working"]);
  });

  it("copilot: the helper's start and stop still count on the parent's desk; its own events change nothing more", () => {
    const { d, sent } = deps();
    const cp = HOOK_FIXTURES.copilot;
    expect(runHook("copilot", "subagentStart", json(cp.subagentStart), d)).toBe("sent");
    for (const key of ["userPromptSubmittedInHelper", "preToolUseInHelper", "permissionRequestInHelper"]) {
      expect(runHook("copilot", eventOf("copilot", key), json(cp[key]), d), key).toBe("skipped");
    }
    expect(runHook("copilot", "agentStop", json(cp.agentStopInHelper), d)).toBe("sent");
    expect(runHook("copilot", "subagentStop", json(cp.subagentStop), d)).toBe("skipped");
    expect(sent.map((b) => JSON.parse(b).helpers)).toEqual([1, 0]);
    expect(new Set(sent.map((b) => JSON.parse(b).state))).toEqual(new Set(["working"]));
  });

  it("copilot: a session that began before subagentStart was installed counts its helpers from their own events", () => {
    // Copilot loads hooks when a session starts: such a session fires no subagentStart or subagentStop at all.
    const { d, sent, tick, home } = deps();
    const cp = HOOK_FIXTURES.copilot;
    expect(runHook("copilot", "userPromptSubmitted", json(cp.userPromptSubmitted), d)).toBe("sent");
    tick(10);
    expect(runHook("copilot", "userPromptSubmitted", json(cp.userPromptSubmittedInHelper), d)).toBe("sent");
    tick(10);
    expect(runHook("copilot", "preToolUse", json(cp.preToolUseInHelper), d)).toBe("skipped");
    expect(runHook("copilot", "permissionRequest", json(cp.permissionRequestInHelper), d)).toBe("skipped");
    tick(10);
    expect(runHook("copilot", "agentStop", json(cp.agentStopInHelper), d)).toBe("sent");
    const [parent, started, ended] = beats(sent);
    expect(started).toMatchObject({ session: parent.session, state: "thinking", activity: "planning", helpers: 1 });
    expect(ended).toMatchObject({ session: parent.session, state: "thinking", activity: "planning", helpers: 0 });
    const log = readFileSync(path.join(home, ".office-relay", "relay.log"), "utf8");
    expect(log).toContain("copilot userPromptSubmitted helper-event helpers 1 sent");
    expect(log).toContain("copilot agentStop helper-event helpers 0 sent");
    for (const body of [...sent, log]) for (const secret of PLANTED) expect(body).not.toContain(secret);
  });

  it("copilot: a helper's own events keep it counted past the TTL while it works", () => {
    const { d, sent, tick } = deps();
    const cp = HOOK_FIXTURES.copilot;
    runHook("copilot", "subagentStart", json(cp.subagentStart), d);
    tick(HELPER_TTL_MS - 1000);
    expect(runHook("copilot", "preToolUse", json(cp.preToolUseInHelper), d)).toBe("skipped");
    tick(2000);
    expect(runHook("copilot", "postToolUse", json(cp.postToolUseEdit), d)).toBe("sent");
    expect(beats(sent).map((b) => b.helpers)).toEqual([1, 1]);
  });

  it("copilot: a nested helper (its parent is a helper, not a desk) or one without parentAgentId counts nothing", () => {
    const { d, sent, home } = deps();
    const cp = HOOK_FIXTURES.copilot;
    runHook("copilot", "userPromptSubmitted", json(cp.userPromptSubmitted), d);
    const nested = { ...cp.preToolUseInHelper, sessionId: "raw-helper-session-456", agentId: "raw-helper-session-456", parentAgentId: "raw-parent-agent-789" };
    expect(runHook("copilot", "preToolUse", json(nested), d)).toBe("ignored");
    const { parentAgentId, ...orphan } = cp.preToolUseInHelper;
    expect(parentAgentId).toBe("raw-session-123");
    expect(runHook("copilot", "preToolUse", json(orphan), d)).toBe("ignored");
    expect(sent.length).toBe(1);
    expect(readFileSync(path.join(home, ".office-relay", "relay.log"), "utf8").match(/copilot preToolUse helper-event ignored/g)).toHaveLength(2);
  });

  for (const agent of ["claude", "codex"] as const) {
    it(`${agent}: a helper's tool events (parent session_id plus agent_id) update the parent's desk, as before`, () => {
      const { d, sent } = deps();
      const fx = HOOK_FIXTURES[agent];
      expect(runHook(agent, "SubagentStart", json(fx.SubagentStart), d)).toBe("sent");
      expect(runHook(agent, "PreToolUse", json({ ...fx.PreToolUse, agent_id: HELPER_ID, agent_type: HELPER_TYPE }), d)).toBe("sent");
      const [started, tool] = sent.map((b) => JSON.parse(b) as Record<string, unknown>);
      expect(tool).toMatchObject({ session: started.session, state: "testing", helpers: 1 });
    });
  }
});
