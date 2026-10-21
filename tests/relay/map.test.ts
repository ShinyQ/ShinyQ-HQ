import { describe, expect, it } from "vitest";
import { commandKind } from "../../tools/office-relay/src/command";
import { mapEvent, rawSessionId, toolCommand } from "../../tools/office-relay/src/map";
import { HOOK_FIXTURES, eventOf } from "./fixtures";

describe("commandKind", () => {
  it.each([
    ["bun test", "test"],
    ["bun run test -- --reporter=dot", "test"],
    ["cd /tmp/x && bunx vitest run tests/unit", "test"],
    ["E2E_PORT=4400 bun run e2e:changed", "test"],
    ["time bun test", "test"],
    ["sudo npm test", "test"],
    ["env CI=1 bun test", "test"],
    ["nohup bun run build", "build"],
    ["npx playwright test e2e/office.spec.ts", "test"],
    ["python -m pytest -q", "test"],
    ["pytest", "test"],
    ["gh pr checks 230 --watch", "ci"],
    ["gh run watch 123", "ci"],
    ["gh run view 99 --log-failed", "ci"],
    ["bun run build", "build"],
    ["bun run typecheck", "build"],
    ["bun run verify:quick", "test"],
    ["git commit -m x", "git"],
    ["gh pr create --fill", "git"],
    ["git diff --stat", "read"],
    ["rg -n foo src", "read"],
    ["cat package.json | head", "read"],
    ["curl -s https://example.com", "shell"],
    ["", "shell"],
  ])("%s is %s", (command, kind) => {
    expect(commandKind(command)).toBe(kind);
  });
});

describe("mapEvent", () => {
  const expected: Record<string, Record<string, [string, string] | null>> = {
    copilot: {
      sessionStart: null,
      userPromptSubmitted: ["thinking", "planning"],
      preToolUse: ["testing", "testing"],
      preToolUseCi: ["ci", "ci"],
      preToolUseMcp: null,
      // Mapped like the parent's own events; runHook counts them as a helper before mapping (they come from inside one).
      preToolUseInHelper: ["working", "editing"],
      userPromptSubmittedInHelper: ["thinking", "planning"],
      permissionRequestInHelper: ["input", "asking"],
      agentStopInHelper: ["done", "finished"],
      postToolUseEdit: ["working", "editing"],
      postToolUseView: ["reviewing", "reading"],
      postToolUseBash: ["thinking", "planning"],
      postToolUseFailureCi: ["failed", "failed"],
      permissionRequest: ["input", "asking"],
      notification: ["input", "asking"],
      notificationIdle: null,
      agentStop: ["done", "finished"],
      errorOccurred: ["asleep", "resting"],
      sessionEnd: ["asleep", "resting"],
    },
    claude: {
      SessionStart: null,
      UserPromptSubmit: ["thinking", "planning"],
      PreToolUse: ["testing", "testing"],
      PostToolUseEdit: ["working", "editing"],
      PostToolUseRead: ["reviewing", "reading"],
      PostToolUseFailure: ["failed", "failed"],
      PermissionRequest: ["input", "asking"],
      Notification: ["input", "asking"],
      Stop: ["done", "finished"],
      StopFailure: ["asleep", "resting"],
      SessionEnd: ["asleep", "resting"],
    },
    codex: {
      SessionStart: null,
      UserPromptSubmit: ["thinking", "planning"],
      PreToolUse: ["testing", "testing"],
      PreToolUsePatch: ["working", "editing"],
      PostToolUse: ["working", "editing"],
      PermissionRequest: ["input", "asking"],
      Stop: ["done", "finished"],
      SessionEnd: ["asleep", "resting"],
    },
  };

  for (const [agent, events] of Object.entries(HOOK_FIXTURES) as [keyof typeof HOOK_FIXTURES, Record<string, Record<string, unknown>>][]) {
    for (const [key, payload] of Object.entries(events)) {
      it(`${agent} ${key}`, () => {
        const want = expected[agent][key];
        const got = mapEvent(agent, eventOf(agent, key), payload);
        expect(got).toEqual(want ? { state: want[0], activity: want[1] } : null);
      });
    }
  }

  it("ignores unknown events and unknown agents' shapes without throwing", () => {
    expect(mapEvent("copilot", "somethingNew", { foo: 1 })).toBeNull();
    expect(mapEvent("claude", "PostToolUse", {})).toEqual({ state: "thinking", activity: "planning" });
  });

  it("maps an answered question (PostToolUse AskUserQuestion) to thinking, not needs input", () => {
    expect(mapEvent("claude", "PostToolUse", { tool_name: "AskUserQuestion" })).toEqual({ state: "thinking", activity: "planning" });
    expect(mapEvent("copilot", "postToolUse", { toolName: "ask_user" })).toEqual({ state: "thinking", activity: "planning" });
  });

  it("reads commands from every payload shape and the raw session id", () => {
    expect(toolCommand(HOOK_FIXTURES.copilot.preToolUse)).toContain("bun test");
    expect(toolCommand(HOOK_FIXTURES.codex.PreToolUse)).toContain("bun test");
    expect(toolCommand({ toolArgs: "not json" })).toBe("");
    expect(rawSessionId(HOOK_FIXTURES.copilot.agentStop)).toBe("raw-session-123");
    expect(rawSessionId(HOOK_FIXTURES.claude.Stop)).toBe("raw-session-123");
    expect(rawSessionId({})).toBeNull();
  });
});
