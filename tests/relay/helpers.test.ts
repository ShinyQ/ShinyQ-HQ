import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { OFFICE_AGENTS } from "@/lib/office/protocol";
import { applyHelper, hashHelper, HELPER_TTL_MS, helperCount, helperEvent, helperId, parentSession } from "../../tools/office-relay/src/helpers";
import { readHelpers, relayPaths, writeHelpers } from "../../tools/office-relay/src/store";
import { HELPER_EVENTS, HELPER_ID, HOOK_FIXTURES } from "./fixtures";

describe("helpers", () => {
  it("maps each tool's start and stop events", () => {
    expect(helperEvent("claude", "SubagentStart")).toBe("start");
    expect(helperEvent("claude", "SubagentStop")).toBe("stop");
    expect(helperEvent("copilot", "subagentStart")).toBe("start");
    expect(helperEvent("copilot", "subagentStop")).toBe("stop");
    expect(helperEvent("codex", "SubagentStart")).toBe("start");
    expect(helperEvent("codex", "SubagentStop")).toBe("stop");
    expect(helperEvent("claude", "PreToolUse")).toBeNull();
    expect(helperEvent("claude", "Stop")).toBeNull();
    expect(helperEvent("copilot", "agentStop")).toBeNull();
  });

  it("counts live ids, dedupes repeats, caps at 9 and expires after the TTL", () => {
    let s = { ids: {} as Record<string, number> };
    s = applyHelper(s, "start", "a", 0);
    s = applyHelper(s, "start", "a", 10);
    s = applyHelper(s, "start", "b", 20);
    expect(helperCount(s, 30)).toBe(2);
    s = applyHelper(s, "stop", "a", 40);
    expect(helperCount(s, 50)).toBe(1);
    expect(helperCount(s, 20 + HELPER_TTL_MS)).toBe(0);
    for (let i = 0; i < 12; i++) s = applyHelper(s, "start", `x${i}`, 100);
    expect(helperCount(s, 200)).toBe(9);
  });

  it("a stop without an id removes the oldest (tools that send no helper id)", () => {
    let s = applyHelper(applyHelper({ ids: {} }, "start", null, 0), "start", null, 5);
    s = applyHelper(s, "stop", null, 10);
    expect(helperCount(s, 11)).toBe(1);
    expect(Object.values(s.ids)).toEqual([5]);
  });

  it("anonymous starts at the same time never overwrite each other", () => {
    let s = { ids: {} as Record<string, number> };
    for (let i = 0; i < 3; i++) s = applyHelper(s, "start", null, 7);
    s = applyHelper(s, "stop", null, 8);
    s = applyHelper(s, "start", null, 7);
    expect(helperCount(s, 9)).toBe(3);
  });

  it("ignores a stop for a helper it never saw (an internal agent, or a stop after the TTL)", () => {
    const s = applyHelper({ ids: { a: 0 } }, "stop", "zzz", 10);
    expect(helperCount(s, 11)).toBe(1);
    expect(helperCount(applyHelper({ ids: {} }, "stop", null, 10), 11)).toBe(0);
  });

  it("drops expired ids from the stored state", () => {
    const s = applyHelper({ ids: { old: 0 } }, "start", "new", HELPER_TTL_MS + 1);
    expect(Object.keys(s.ids)).toEqual(["new"]);
  });

  it("reads the helper id and the parent session from each tool's documented fields", () => {
    for (const agent of OFFICE_AGENTS) {
      const { start, stop } = HELPER_EVENTS[agent];
      expect(parentSession(agent, HOOK_FIXTURES[agent][start]), agent).toBe("raw-session-123");
      expect(parentSession(agent, HOOK_FIXTURES[agent][stop]), agent).toBe("raw-session-123");
    }
    expect(helperId("claude", HOOK_FIXTURES.claude.SubagentStart)).toBe(HELPER_ID);
    expect(helperId("claude", HOOK_FIXTURES.claude.SubagentStop)).toBe(HELPER_ID);
    expect(helperId("codex", HOOK_FIXTURES.codex.SubagentStart)).toBe(HELPER_ID);
    expect(helperId("codex", HOOK_FIXTURES.codex.SubagentStop)).toBe(HELPER_ID);
    // Copilot's start names no helper (an `agentId` there would be the agent that spawned it), so neither event keys on one.
    expect(helperId("copilot", HOOK_FIXTURES.copilot.subagentStart)).toBeNull();
    expect(helperId("copilot", HOOK_FIXTURES.copilot.subagentStop)).toBeNull();
    expect(parentSession("claude", { agent_id: HELPER_ID })).toBeNull();
    expect(helperId("claude", { agent_id: "x".repeat(201) })).toBeNull();
    expect(helperId("claude", { agent_id: 7 })).toBeNull();
  });

  it("hashes helper ids with the salt (32 hex, never the raw id)", () => {
    const h = hashHelper(HELPER_ID, "salt-a");
    expect(h).toMatch(/^[0-9a-f]{32}$/);
    expect(h).not.toBe(hashHelper(HELPER_ID, "salt-b"));
    expect(h).not.toContain(HELPER_ID);
  });

  it("stores the state per session hash and survives a broken file", () => {
    const paths = relayPaths({ HOME: mkdtempSync(path.join(tmpdir(), "relay-helpers-")) });
    const session = "c".repeat(64);
    expect(readHelpers(paths, session)).toEqual({ ids: {} });
    writeHelpers(paths, session, { ids: { [hashHelper(HELPER_ID, "s")]: 5 } });
    const file = path.join(paths.sessions, `${"c".repeat(32)}.helpers.json`);
    expect(readFileSync(file, "utf8")).not.toContain(HELPER_ID);
    expect(helperCount(readHelpers(paths, session), 6)).toBe(1);
    writeFileSync(file, "{ broken");
    expect(readHelpers(paths, session)).toEqual({ ids: {} });
    writeFileSync(file, JSON.stringify({ ids: { a: "x", b: 3, ["k".repeat(80)]: 4 } }));
    expect(readHelpers(paths, session)).toEqual({ ids: { b: 3 } });
  });
});
