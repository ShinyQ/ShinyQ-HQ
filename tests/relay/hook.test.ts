import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { OFFICE_AGENTS, parseOfficeBeat } from "@/lib/office/protocol";
import { KEEPALIVE_MS } from "../../tools/office-relay/src/beat";
import { runHook, type HookDeps } from "../../tools/office-relay/src/hook";
import { relayPaths } from "../../tools/office-relay/src/store";
import { eventOf, HOOK_FIXTURES, PLANTED } from "./fixtures";

const T0 = Date.UTC(2026, 9, 18, 8, 0, 0);

function deps(git: { repo: string; branch?: string } | null = { repo: "ShinyQ/ShinyQ-HQ", branch: "feat/intro-orbit-reveal" }) {
  const home = mkdtempSync(path.join(tmpdir(), "relay-home-"));
  const sent: string[] = [];
  let clock = T0;
  const d: HookDeps = { paths: relayPaths({ HOME: home }), now: () => clock, readGit: () => git, dispatch: (body) => void sent.push(body) };
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
          expect(Object.keys(JSON.parse(body)).every((k) => ["v", "agent", "session", "state", "activity", "repo", "branch", "title", "ts"].includes(k))).toBe(true);
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

  it("dedupes repeats, sends a keepalive after 15 s and a change at once", () => {
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
