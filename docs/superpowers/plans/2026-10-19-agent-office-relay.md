# Agent Office, part 2: office-relay and Installer Implementation Plan

Status: shipped in #242 (b5175c4), 2026-10-19

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `office-relay`, the local privacy boundary that turns GitHub Copilot, Claude Code and OpenAI Codex hook events into signed `OfficeBeatV1` beats for `POST /api/office/beat`, plus an installer that merges the three hook configs, with payload fixtures and tests proving that nothing but the schema leaves the machine.

**Architecture:** A Bun CLI in `tools/office-relay/`. The hook path (`office-relay hook <agent> <event>`) reads the event JSON on stdin, maps it to a state with pure functions (`map.ts`, `command.ts`), reads git data from files (`git.ts`), hashes the session id (`session.ts`), dedupes per session (`store.ts`, `beat.ts`), spawns a detached `office-relay send` child and exits 0 with empty stdout in about 30 ms. The child reads the ingest key from the macOS Keychain, signs the body and posts it with a 2 s timeout. The installer (`install.ts`) writes `~/.copilot/hooks/office.json` and merges `~/.claude/settings.json` and `~/.codex/hooks.json` with backups.

**Tech Stack:** Bun 1.4 (`node:child_process`, `node:crypto`, `node:fs`), TypeScript, Vitest (tests spawn `bun` for the CLI), macOS `security` for the Keychain.

Spec: [`docs/superpowers/specs/2026-10-18-agent-office-design.md`](../specs/2026-10-18-agent-office-design.md) sections 3.1, 3.2, 5, 6, 9 and 12. Depends on part 1 ([plan](2026-10-19-agent-office-worker.md)): `src/lib/office/protocol.ts` and `workers/office/src/ingest.ts` (`repoAllowed`).

## Global Constraints

- No em dashes (U+2014) anywhere.
- The beat is exactly `OfficeBeatV1`: `{v: 1, agent, session, state, activity, repo?, branch?, title?, ts}`; the relay validates its own output with `parseOfficeBeat` before sending and never sends prompt text, commands, file paths, tool output, transcript paths or the raw session id.
- `repo`, `branch` and `title` only when the origin remote is in the local allowlist (default `["ShinyQ/*"]`, from `~/.office-relay/config.json`); git data comes from files under `.git`, never from running `git` or `gh`.
- Hook path: never blocks, never exits non-zero, never writes to stdout or stderr (a Copilot `preToolUse` hook that crashes or exits non-zero denies the tool); it only does local file work and spawns a detached child.
- Send: at most once per state or activity change, plus a keepalive at most every 15 s (`KEEPALIVE_MS = 15000`); 2 s timeout; signature `X-Office-Signature: sha256=<hex HMAC-SHA256(body, key)>`.
- Key: macOS Keychain item service `hq-office-ingest`, account `office-relay`; read only by the detached child.
- Pause: the file `~/.office-pause` stops everything; `office-relay pause|resume|status`.
- Hook configs: Copilot `~/.copilot/hooks/office.json` (`{"version":1,"hooks":{...}}`, `timeoutSec: 5`, `preToolUse` matcher `bash|powershell`); Claude Code `~/.claude/settings.json` (`async: true`, `PreToolUse` matcher `Bash`); Codex `~/.codex/hooks.json` (`async: true` except `SessionEnd`, `PreToolUse` matcher `^Bash$`; trust once in `/hooks`). The installer backs up every file it changes and only replaces its own entries (marked by the command containing `office-relay hook`).
- CI: `tools/` is tooling (no e2e, no perf, no Lighthouse). At most 2 CI runs in flight. This PR is pre-approved to merge when green.

## File Structure

| Path | Responsibility |
|---|---|
| `tools/office-relay/src/command.ts` | `commandKind(command)`: test, ci, build, git, read or shell from the first words only |
| `tools/office-relay/src/map.ts` | `mapEvent(agent, event, payload)`: state and activity, or null; `toolCommand`, `rawSessionId` |
| `tools/office-relay/src/git.ts` | `readGit(cwd, fs)`: origin `owner/name` and branch from `.git` files (worktrees included) |
| `tools/office-relay/src/title.ts` | `branchTitle(branch)` |
| `tools/office-relay/src/session.ts` | `sessionHash(agent, rawId, salt)` |
| `tools/office-relay/src/store.ts` | `RelayPaths`, `relayPaths(env)`, config, salt, pause, dedupe records, log |
| `tools/office-relay/src/beat.ts` | `buildBeat(...)`, `shouldSend(prev, beat, now)`, `KEEPALIVE_MS` |
| `tools/office-relay/src/send.ts` | `signBody`, `postBeat`, `readIngestKey` |
| `tools/office-relay/src/hook.ts` | `runHook(agent, event, stdin, deps)`: the whole hook path, injectable for tests |
| `tools/office-relay/src/install.ts` | `copilotHooks`, `mergeClaude`, `mergeCodex`, `install`, `uninstall` |
| `tools/office-relay/src/cli.ts` | Entry: `hook`, `send`, `pause`, `resume`, `status`, `install`, `uninstall` |
| `tools/office-relay/README.md` | Owner install and troubleshooting guide |
| `tests/relay/fixtures.ts` | Hook payloads per agent and event, with planted secrets |
| `tests/relay/*.test.ts` | Unit, privacy, CLI and installer tests |
| `scripts/ci-plan.ts`, `scripts/e2e-plan.ts`, their tests, `docs/agents/ci-and-deploy.md` | `tools/` is tooling |
| `docs/agents/office.md`, `docs/agents/folder-layout.md`, `AGENTS.md`, `docs/features.md` | Docs |

---

### Task 1: Command classification and event mapping

**Files:**
- Create: `tools/office-relay/src/command.ts`, `tools/office-relay/src/map.ts`, `tests/relay/fixtures.ts`
- Test: `tests/relay/map.test.ts`

**Interfaces:**
- Consumes: part 1 types `OfficeAgent`, `OfficeState`, `OfficeActivity` from `src/lib/office/protocol.ts`.
- Produces: `type CommandKind = "test" | "ci" | "build" | "git" | "read" | "shell"`; `commandKind(command: string): CommandKind`; `interface Mapped { state: OfficeState; activity: OfficeActivity }`; `mapEvent(agent: OfficeAgent, event: string, payload: Record<string, unknown>): Mapped | null`; `toolCommand(payload: Record<string, unknown>): string`; `rawSessionId(payload: Record<string, unknown>): string | null`; `payloadCwd(payload: Record<string, unknown>): string | null`; fixtures `HOOK_FIXTURES: Record<OfficeAgent, Record<string, Record<string, unknown>>>` and `PLANTED: readonly string[]` (strings that must never leave the machine).

- [ ] **Step 1: Write the fixtures and the failing test**

Create `tests/relay/fixtures.ts` (payload shapes from the hooks references of GitHub Copilot, Claude Code and Codex, October 2026; the planted strings stand in for prompts, commands, paths and output):

```ts
import type { OfficeAgent } from "@/lib/office/protocol";

export const PROMPT = "Fix the login bug for the client portal, password is hunter2";
export const SECRET_CMD = "bun test tests/client-portal/login.test.ts --token=abc123";
export const CWD = "/Users/someone/Work/client-portal";
export const OUTPUT = "FAIL tests/client-portal/login.test.ts: expected 200";
/** Strings that must never appear in a beat or the relay log. */
export const PLANTED = [PROMPT, SECRET_CMD, CWD, OUTPUT, "hunter2", "client-portal", "abc123", "transcript.jsonl", "raw-session-123"] as const;

const copilot = (extra: Record<string, unknown>) => ({ sessionId: "raw-session-123", timestamp: 1_792_327_344_000, cwd: CWD, ...extra });
const snake = (event: string, extra: Record<string, unknown>) => ({ session_id: "raw-session-123", transcript_path: `${CWD}/transcript.jsonl`, cwd: CWD, hook_event_name: event, permission_mode: "default", ...extra });

export const HOOK_FIXTURES: Record<OfficeAgent, Record<string, Record<string, unknown>>> = {
  copilot: {
    sessionStart: copilot({ source: "new", initialPrompt: PROMPT }),
    userPromptSubmitted: copilot({ prompt: PROMPT }),
    preToolUse: copilot({ toolName: "bash", toolArgs: JSON.stringify({ command: SECRET_CMD, description: "run tests" }) }),
    preToolUseCi: copilot({ toolName: "bash", toolArgs: { command: "gh run watch 123 --exit-status" } }),
    postToolUseEdit: copilot({ toolName: "edit", toolArgs: { path: `${CWD}/src/login.ts`, old_str: "a", new_str: "hunter2" }, toolResult: { resultType: "success", textResultForLlm: OUTPUT } }),
    postToolUseView: copilot({ toolName: "view", toolArgs: { path: `${CWD}/src/login.ts` }, toolResult: { resultType: "success", textResultForLlm: OUTPUT } }),
    postToolUseBash: copilot({ toolName: "bash", toolArgs: { command: SECRET_CMD }, toolResult: { resultType: "success", textResultForLlm: OUTPUT } }),
    postToolUseFailureCi: copilot({ toolName: "bash", toolArgs: { command: "gh pr checks 230 --watch" }, error: OUTPUT }),
    permissionRequest: copilot({ toolName: "bash", toolArgs: { command: SECRET_CMD } }),
    notification: { ...copilot({}), hook_event_name: "Notification", message: PROMPT, notification_type: "permission_prompt" },
    notificationIdle: { ...copilot({}), hook_event_name: "Notification", message: "idle", notification_type: "agent_idle" },
    agentStop: copilot({ transcriptPath: `${CWD}/transcript.jsonl`, stopReason: "end_turn" }),
    errorOccurred: copilot({ error: { message: OUTPUT, name: "Error" }, errorContext: "model_call", recoverable: false }),
    sessionEnd: copilot({ reason: "complete" }),
  },
  claude: {
    SessionStart: snake("SessionStart", { source: "startup" }),
    UserPromptSubmit: snake("UserPromptSubmit", { prompt: PROMPT }),
    PreToolUse: snake("PreToolUse", { tool_name: "Bash", tool_input: { command: `cd ${CWD} && ${SECRET_CMD}` }, tool_use_id: "t1" }),
    PostToolUseEdit: snake("PostToolUse", { tool_name: "Edit", tool_input: { file_path: `${CWD}/src/login.ts`, old_string: "a", new_string: "hunter2" }, tool_response: { success: true } }),
    PostToolUseRead: snake("PostToolUse", { tool_name: "Read", tool_input: { file_path: `${CWD}/src/login.ts` }, tool_response: { content: OUTPUT } }),
    PostToolUseFailure: snake("PostToolUseFailure", { tool_name: "Bash", tool_input: { command: "gh run view 99 --log-failed" }, error: OUTPUT }),
    PermissionRequest: snake("PermissionRequest", { tool_name: "Bash", tool_input: { command: SECRET_CMD } }),
    Notification: snake("Notification", { message: PROMPT, notification_type: "agent_needs_input" }),
    Stop: snake("Stop", { stop_hook_active: false, last_assistant_message: OUTPUT }),
    StopFailure: snake("StopFailure", { error: OUTPUT, last_assistant_message: OUTPUT }),
    SessionEnd: snake("SessionEnd", { reason: "prompt_input_exit" }),
  },
  codex: {
    SessionStart: snake("SessionStart", { source: "startup", model: "gpt-5.3-codex" }),
    UserPromptSubmit: snake("UserPromptSubmit", { prompt: PROMPT, model: "gpt-5.3-codex" }),
    PreToolUse: snake("PreToolUse", { tool_name: "Bash", turn_id: "u1", tool_use_id: "t1", tool_input: { command: ["bash", "-lc", SECRET_CMD] } }),
    PreToolUsePatch: snake("PreToolUse", { tool_name: "apply_patch", turn_id: "u1", tool_use_id: "t2", tool_input: { command: "*** Begin Patch hunter2" } }),
    PostToolUse: snake("PostToolUse", { tool_name: "apply_patch", turn_id: "u1", tool_use_id: "t2", tool_input: { command: "*** Begin Patch hunter2" }, tool_response: OUTPUT }),
    PermissionRequest: snake("PermissionRequest", { tool_name: "Bash", tool_input: { command: SECRET_CMD } }),
    Stop: snake("Stop", { stop_hook_active: false, last_assistant_message: OUTPUT }),
    SessionEnd: snake("SessionEnd", { reason: "other" }),
  },
};

/** The hook event name each fixture is delivered under (a fixture key may carry a suffix such as `Edit` or `Ci`). */
export function eventOf(agent: OfficeAgent, key: string): string {
  const names: Record<OfficeAgent, readonly string[]> = {
    copilot: ["sessionStart", "userPromptSubmitted", "preToolUse", "postToolUseFailure", "postToolUse", "permissionRequest", "notification", "agentStop", "errorOccurred", "sessionEnd"],
    claude: ["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUseFailure", "PostToolUse", "PermissionRequest", "Notification", "StopFailure", "Stop", "SessionEnd"],
    codex: ["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "PermissionRequest", "Stop", "SessionEnd"],
  };
  const name = names[agent].find((n) => key.startsWith(n));
  if (!name) throw new Error(`no event for ${agent} ${key}`);
  return name;
}
```

Create `tests/relay/map.test.ts`:

```ts
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

  it("reads commands from every payload shape and the raw session id", () => {
    expect(toolCommand(HOOK_FIXTURES.copilot.preToolUse)).toContain("bun test");
    expect(toolCommand(HOOK_FIXTURES.codex.PreToolUse)).toContain("bun test");
    expect(toolCommand({ toolArgs: "not json" })).toBe("");
    expect(rawSessionId(HOOK_FIXTURES.copilot.agentStop)).toBe("raw-session-123");
    expect(rawSessionId(HOOK_FIXTURES.claude.Stop)).toBe("raw-session-123");
    expect(rawSessionId({})).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bunx vitest run tests/relay/map.test.ts`
Expected: FAIL with "Failed to resolve import "../../tools/office-relay/src/command"".

- [ ] **Step 3: Write the modules**

Create `tools/office-relay/src/command.ts`:

```ts
/** What a shell command is doing, from its first words only (evaluated locally; the command never leaves the machine). */
export type CommandKind = "test" | "ci" | "build" | "git" | "read" | "shell";

const ENV = /^[A-Za-z_][A-Za-z0-9_]*=/;
const SKIP = new Set(["cd", "export", "env", "time", "sudo", "nohup", "pushd", "source", "."]);
const READERS = new Set(["rg", "grep", "cat", "sed", "head", "tail", "ls", "find", "wc", "tree", "less", "awk", "jq", "fd", "stat"]);

/** The first three words of the first segment that runs a program (skips `cd x &&`, `export`, `FOO=bar`). */
function headWords(command: string): string[] {
  for (const segment of command.split(/&&|\|\||;|\||\n/)) {
    const words = segment.trim().split(/\s+/).filter(Boolean);
    while (words.length > 0 && ENV.test(words[0])) words.shift();
    if (words.length === 0 || SKIP.has(words[0])) continue;
    return words.slice(0, 3).map((w) => w.replace(/^["']|["']$/g, ""));
  }
  return [];
}

export function commandKind(command: string): CommandKind {
  const [a = "", b = "", c = ""] = headWords(command);
  const runner = a === "bunx" || a === "npx" || a === "pnpx" ? b : a;
  if (a === "gh" && ((b === "pr" && c === "checks") || (b === "run" && (c === "watch" || c === "view")))) return "ci";
  if (runner === "vitest" || runner === "playwright" || runner === "jest" || a === "pytest" || (a === "python" && b === "-m" && c === "pytest")) return "test";
  if ((a === "bun" || a === "npm" || a === "pnpm" || a === "yarn" || a === "go" || a === "cargo" || a === "dotnet") && b === "test") return "test";
  if ((a === "bun" || a === "npm" || a === "pnpm" || a === "yarn") && b === "run" && /^(test|e2e|verify)/.test(c)) return "test";
  if ((a === "bun" || a === "npm" || a === "pnpm" || a === "yarn") && b === "run" && /^(build|typecheck|lint)/.test(c)) return "build";
  if (runner === "tsc" || runner === "eslint" || runner === "next" || ((a === "docker" || a === "go" || a === "cargo" || a === "dotnet") && b === "build")) return "build";
  if (a === "git") return b === "diff" || b === "log" || b === "show" || b === "status" || b === "blame" ? "read" : "git";
  if (a === "gh" && b === "pr") return "git";
  if (READERS.has(a)) return "read";
  return "shell";
}
```

Create `tools/office-relay/src/map.ts`:

```ts
import type { OfficeActivity, OfficeAgent, OfficeState } from "../../../src/lib/office/protocol";
import { commandKind, type CommandKind } from "./command";

export interface Mapped {
  state: OfficeState;
  activity: OfficeActivity;
}

const m = (state: OfficeState, activity: OfficeActivity): Mapped => ({ state, activity });
const THINKING = m("thinking", "planning");
const ASKING = m("input", "asking");
const DONE = m("done", "finished");
const ASLEEP = m("asleep", "resting");

const KIND: Record<CommandKind, Mapped> = {
  test: m("testing", "testing"),
  ci: m("ci", "ci"),
  build: m("working", "building"),
  git: m("working", "git"),
  read: m("reviewing", "reading"),
  shell: m("working", "shell"),
};

const EDIT_TOOLS = new Set(["edit", "create", "write", "notebookedit", "apply_patch", "multiedit", "str_replace_editor"]);
const READ_TOOLS = new Set(["view", "read", "grep", "glob", "web_fetch", "webfetch", "websearch", "ls"]);
const SHELL_TOOLS = new Set(["bash", "powershell", "shell"]);
const ASK_TOOLS = new Set(["ask_user", "askuserquestion"]);
const NEEDS_INPUT = new Set(["permission_prompt", "elicitation_dialog", "agent_needs_input"]);

const str = (x: unknown): string => (typeof x === "string" ? x : "");

function asObject(x: unknown): Record<string, unknown> | null {
  if (typeof x === "string") {
    try {
      return asObject(JSON.parse(x));
    } catch {
      return null;
    }
  }
  return typeof x === "object" && x !== null && !Array.isArray(x) ? (x as Record<string, unknown>) : null;
}

const toolName = (p: Record<string, unknown>) => (str(p.toolName) || str(p.tool_name)).toLowerCase();

/** The shell command of a tool event, in every agent's shape (`toolArgs` object or JSON string, `tool_input.command` string or argv). */
export function toolCommand(p: Record<string, unknown>): string {
  const args = asObject(p.toolArgs) ?? asObject(p.tool_input);
  const command = args?.command;
  if (Array.isArray(command)) return command.map(str).at(-1) ?? "";
  return str(command);
}

export function rawSessionId(p: Record<string, unknown>): string | null {
  return str(p.sessionId) || str(p.session_id) || null;
}

export function payloadCwd(p: Record<string, unknown>): string | null {
  return str(p.cwd) || null;
}

function afterTool(p: Record<string, unknown>): Mapped {
  const tool = toolName(p);
  if (EDIT_TOOLS.has(tool)) return m("working", "editing");
  if (READ_TOOLS.has(tool)) return m("reviewing", "reading");
  if (ASK_TOOLS.has(tool)) return ASKING;
  return THINKING;
}

function beforeTool(p: Record<string, unknown>): Mapped | null {
  const tool = toolName(p);
  if (SHELL_TOOLS.has(tool)) return KIND[commandKind(toolCommand(p))];
  if (EDIT_TOOLS.has(tool)) return m("working", "editing");
  if (READ_TOOLS.has(tool)) return m("reviewing", "reading");
  return null;
}

function toolFailed(p: Record<string, unknown>): Mapped {
  return SHELL_TOOLS.has(toolName(p)) && commandKind(toolCommand(p)) === "ci" ? m("failed", "failed") : THINKING;
}

/**
 * One hook event to an office state (spec section 5), or null when the event says nothing visible. The event name
 * comes from the command line, because Copilot's camelCase payloads carry no event name.
 */
export function mapEvent(agent: OfficeAgent, event: string, p: Record<string, unknown>): Mapped | null {
  const e = event.toLowerCase();
  switch (e) {
    case "userpromptsubmitted":
    case "userpromptsubmit":
      return THINKING;
    case "pretooluse":
      return beforeTool(p);
    case "posttooluse":
      return afterTool(p);
    case "posttoolusefailure":
      return toolFailed(p);
    case "permissionrequest":
      return ASKING;
    case "notification":
      return NEEDS_INPUT.has(str(p.notification_type)) ? ASKING : null;
    case "agentstop":
    case "stop":
      return DONE;
    case "stopfailure":
      return ASLEEP;
    case "erroroccurred":
      return p.recoverable === false ? ASLEEP : null;
    case "sessionend":
      return ASLEEP;
    default:
      return null;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bunx vitest run tests/relay/map.test.ts`
Expected: PASS (20 command cases, 33 fixture cases, 2 more).

- [ ] **Step 5: Commit**

```bash
git add tools/office-relay/src/command.ts tools/office-relay/src/map.ts tests/relay/fixtures.ts tests/relay/map.test.ts
git commit -m "feat(relay): map Copilot, Claude Code and Codex hook events to office states"
```

### Task 2: Git data from files, branch titles and session hashes

**Files:**
- Create: `tools/office-relay/src/git.ts`, `tools/office-relay/src/title.ts`, `tools/office-relay/src/session.ts`
- Test: `tests/relay/git.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `interface FsLike { read(path: string): string | null; isDir(path: string): boolean }`; `nodeFs: FsLike`; `interface GitInfo { repo: string; branch?: string }`; `readGit(cwd: string, fs?: FsLike): GitInfo | null`; `parseRemote(url: string): string | null`; `branchTitle(branch: string): string | null`; `sessionHash(agent: string, rawId: string, salt: string): string` (64 lowercase hex).

- [ ] **Step 1: Write the failing test**

Create `tests/relay/git.test.ts`:

```ts
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseRemote, readGit } from "../../tools/office-relay/src/git";
import { sessionHash } from "../../tools/office-relay/src/session";
import { branchTitle } from "../../tools/office-relay/src/title";

function repoAt(remote: string, head: string) {
  const root = mkdtempSync(path.join(tmpdir(), "relay-git-"));
  mkdirSync(path.join(root, ".git"));
  mkdirSync(path.join(root, "src", "deep"), { recursive: true });
  writeFileSync(path.join(root, ".git", "HEAD"), head);
  writeFileSync(path.join(root, ".git", "config"), `[core]\n\tbare = false\n[remote "upstream"]\n\turl = https://github.com/other/thing.git\n[remote "origin"]\n\turl = ${remote}\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n`);
  return root;
}

describe("readGit", () => {
  it("reads the origin repository and branch from a subdirectory", () => {
    const root = repoAt("git@github.com:ShinyQ/ShinyQ-HQ.git", "ref: refs/heads/feat/intro-orbit-reveal\n");
    expect(readGit(path.join(root, "src", "deep"))).toEqual({ repo: "ShinyQ/ShinyQ-HQ", branch: "feat/intro-orbit-reveal" });
  });

  it("follows a worktree's .git file to the common config", () => {
    const main = repoAt("https://github.com/ShinyQ/ShinyQ-HQ", "ref: refs/heads/main\n");
    const gitDir = path.join(main, ".git", "worktrees", "wt");
    mkdirSync(gitDir, { recursive: true });
    writeFileSync(path.join(gitDir, "HEAD"), "ref: refs/heads/feat/office\n");
    writeFileSync(path.join(gitDir, "commondir"), "../..\n");
    const wt = mkdtempSync(path.join(tmpdir(), "relay-wt-"));
    writeFileSync(path.join(wt, ".git"), `gitdir: ${gitDir}\n`);
    expect(readGit(wt)).toEqual({ repo: "ShinyQ/ShinyQ-HQ", branch: "feat/office" });
  });

  it("returns the repository without a branch when HEAD is detached, and null outside a repository", () => {
    const root = repoAt("https://github.com/ShinyQ/ShinyQ-HQ.git", "4f1c0de4f1c0de4f1c0de4f1c0de4f1c0de4f1c0\n");
    expect(readGit(root)).toEqual({ repo: "ShinyQ/ShinyQ-HQ" });
    expect(readGit(mkdtempSync(path.join(tmpdir(), "relay-none-")))).toBeNull();
  });

  it("parses GitHub remotes only", () => {
    expect(parseRemote("git@github.com:ShinyQ/ShinyQ-HQ.git")).toBe("ShinyQ/ShinyQ-HQ");
    expect(parseRemote("https://github.com/ShinyQ/ShinyQ-HQ")).toBe("ShinyQ/ShinyQ-HQ");
    expect(parseRemote("ssh://git@github.com/ShinyQ/ShinyQ-HQ.git")).toBe("ShinyQ/ShinyQ-HQ");
    expect(parseRemote("https://dev.azure.com/org/project/_git/repo")).toBeNull();
  });
});

describe("branchTitle", () => {
  it.each([
    ["feat/intro-orbit-reveal", "Intro orbit reveal"],
    ["fix/glass_shader-NaN", "Glass shader NaN"],
    ["copilot/fix-123", "Fix 123"],
    ["main", null],
    ["master", null],
    ["feat/<script>", "Script"],
    ["feat/---", null],
  ])("%s", (branch, title) => {
    expect(branchTitle(branch)).toBe(title);
  });
});

describe("sessionHash", () => {
  it("is stable, salted, per agent and not the raw id", () => {
    const a = sessionHash("copilot", "raw-session-123", "salt-1");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(sessionHash("copilot", "raw-session-123", "salt-1")).toBe(a);
    expect(sessionHash("copilot", "raw-session-123", "salt-2")).not.toBe(a);
    expect(sessionHash("claude", "raw-session-123", "salt-1")).not.toBe(a);
    expect(a).not.toContain("raw");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bunx vitest run tests/relay/git.test.ts`
Expected: FAIL with "Failed to resolve import "../../tools/office-relay/src/git"".

- [ ] **Step 3: Write the modules**

Create `tools/office-relay/src/git.ts`:

```ts
import { readFileSync, statSync } from "node:fs";
import path from "node:path";

/** The two file reads git data needs (injectable for tests). */
export interface FsLike {
  read(file: string): string | null;
  isDir(file: string): boolean;
}

export const nodeFs: FsLike = {
  read(file) {
    try {
      return readFileSync(file, "utf8");
    } catch {
      return null;
    }
  },
  isDir(file) {
    try {
      return statSync(file).isDirectory();
    } catch {
      return false;
    }
  },
};

export interface GitInfo {
  repo: string;
  branch?: string;
}

/** `owner/name` of a GitHub remote URL (https, ssh or scp form), or null for any other host. */
export function parseRemote(url: string): string | null {
  const match = /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([A-Za-z0-9-]{1,39})\/([A-Za-z0-9._-]{1,100}?)(?:\.git)?\/?$/.exec(url.trim());
  return match ? `${match[1]}/${match[2]}` : null;
}

function findGitDir(cwd: string, fs: FsLike): string | null {
  let dir = path.resolve(cwd);
  for (;;) {
    const dotGit = path.join(dir, ".git");
    if (fs.isDir(dotGit)) return dotGit;
    const pointer = fs.read(dotGit);
    const target = pointer ? /^gitdir:\s*(.+)$/m.exec(pointer)?.[1]?.trim() : undefined;
    if (target) return path.resolve(dir, target);
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function originUrl(config: string): string | null {
  const section = /\[remote "origin"\]([\s\S]*?)(?=\n\[|$)/.exec(config)?.[1] ?? "";
  return /^\s*url\s*=\s*(.+)$/m.exec(section)?.[1]?.trim() ?? null;
}

/**
 * The origin repository and branch of the directory an agent works in, read from `.git` files only (never by
 * running git), worktrees included. Null outside a GitHub repository.
 */
export function readGit(cwd: string, fs: FsLike = nodeFs): GitInfo | null {
  const gitDir = findGitDir(cwd, fs);
  if (!gitDir) return null;
  const common = fs.read(path.join(gitDir, "commondir"))?.trim();
  const commonDir = common ? path.resolve(gitDir, common) : gitDir;
  const url = originUrl(fs.read(path.join(commonDir, "config")) ?? "");
  const repo = url ? parseRemote(url) : null;
  if (!repo) return null;
  const branch = /^ref:\s*refs\/heads\/(\S+)/.exec(fs.read(path.join(gitDir, "HEAD")) ?? "")?.[1];
  return branch ? { repo, branch } : { repo };
}
```

Create `tools/office-relay/src/title.ts`:

```ts
const DEFAULT_BRANCHES = new Set(["main", "master", "develop", "trunk"]);

/**
 * A readable task title from a branch name: the last path part, separators to spaces, first letter upper case
 * (`feat/intro-orbit-reveal` becomes "Intro orbit reveal"). Null for default branches or nothing left.
 */
export function branchTitle(branch: string): string | null {
  if (DEFAULT_BRANCHES.has(branch)) return null;
  const last = branch.split("/").filter(Boolean).at(-1) ?? "";
  const words = last
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .slice(0, 80)
    .trim();
  if (!words) return null;
  return words[0].toUpperCase() + words.slice(1);
}
```

Create `tools/office-relay/src/session.ts`:

```ts
import { createHmac } from "node:crypto";

/** A stable, salted, one-way id for an agent session (the raw id never leaves the machine). */
export function sessionHash(agent: string, rawId: string, salt: string): string {
  return createHmac("sha256", salt).update(`${agent}:${rawId}`).digest("hex");
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bunx vitest run tests/relay/git.test.ts`
Expected: PASS (12 tests).

- [ ] **Step 5: Commit**

```bash
git add tools/office-relay/src/git.ts tools/office-relay/src/title.ts tools/office-relay/src/session.ts tests/relay/git.test.ts
git commit -m "feat(relay): read git data from files, derive branch titles, hash session ids"
```

### Task 3: Local store, beat building, dedupe and the hook path

**Files:**
- Create: `tools/office-relay/src/store.ts`, `tools/office-relay/src/beat.ts`, `tools/office-relay/src/hook.ts`
- Test: `tests/relay/hook.test.ts`

**Interfaces:**
- Consumes: Task 1 (`mapEvent`, `rawSessionId`, `payloadCwd`), Task 2 (`readGit`, `branchTitle`, `sessionHash`), part 1 (`parseOfficeBeat`, `OfficeBeatV1`, `OfficeAgent`, `OFFICE_AGENTS`; `repoAllowed` from `workers/office/src/ingest.ts`).
- Produces:
  - `store.ts`: `interface RelayConfig { endpoint: string; allow: string[] }`, `DEFAULT_CONFIG`, `interface RelayPaths { home: string; pause: string; config: string; salt: string; sessions: string; log: string }`, `relayPaths(env?: NodeJS.ProcessEnv): RelayPaths`, `loadConfig(paths): RelayConfig`, `loadSalt(paths): string`, `isPaused(paths): boolean`, `readSent(paths, session): Sent | null`, `writeSent(paths, session, sent): void`, `appendLog(paths, line): void`
  - `beat.ts`: `KEEPALIVE_MS = 15000`, `interface Sent { state; activity; repo?; title?; sentAt: number }`, `buildBeat(input: { agent; session; mapped; git; allow; now }): OfficeBeatV1`, `shouldSend(prev: Sent | null, beat: OfficeBeatV1, now: number): boolean`
  - `hook.ts`: `interface HookDeps { paths: RelayPaths; now: () => number; readGit: (cwd: string) => GitInfo | null; dispatch: (body: string) => void }`, `runHook(agent: string, event: string, stdin: string, deps: HookDeps): "sent" | "skipped" | "paused" | "ignored"`

- [ ] **Step 1: Write the failing test**

Create `tests/relay/hook.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bunx vitest run tests/relay/hook.test.ts`
Expected: FAIL with "Failed to resolve import "../../tools/office-relay/src/beat"".

- [ ] **Step 3: Write the modules**

Create `tools/office-relay/src/store.ts`:

```ts
import { randomBytes } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Sent } from "./beat";

export interface RelayConfig {
  endpoint: string;
  allow: string[];
}

export const DEFAULT_CONFIG: RelayConfig = { endpoint: "https://kurniadi.pages.dev/api/office/beat", allow: ["ShinyQ/*"] };

export interface RelayPaths {
  home: string;
  pause: string;
  config: string;
  salt: string;
  sessions: string;
  log: string;
}

const LOG_MAX_BYTES = 256 * 1024;

/** `~/.office-relay/` (override the home with OFFICE_RELAY_HOME) and the pause file `~/.office-pause`. */
export function relayPaths(env: NodeJS.ProcessEnv = process.env): RelayPaths {
  const user = env.HOME ?? "";
  const home = env.OFFICE_RELAY_HOME ?? path.join(user, ".office-relay");
  return { home, pause: path.join(user, ".office-pause"), config: path.join(home, "config.json"), salt: path.join(home, "salt"), sessions: path.join(home, "sessions"), log: path.join(home, "relay.log") };
}

function ensure(dir: string): void {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
}

export function loadConfig(paths: RelayPaths): RelayConfig {
  try {
    const raw = JSON.parse(readFileSync(paths.config, "utf8")) as Partial<RelayConfig>;
    return {
      endpoint: typeof raw.endpoint === "string" && raw.endpoint.startsWith("https://") ? raw.endpoint : DEFAULT_CONFIG.endpoint,
      allow: Array.isArray(raw.allow) ? raw.allow.filter((a): a is string => typeof a === "string") : DEFAULT_CONFIG.allow,
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

/** The local salt of session hashes, created once (32 random bytes, mode 0600). */
export function loadSalt(paths: RelayPaths): string {
  try {
    const salt = readFileSync(paths.salt, "utf8").trim();
    if (salt.length >= 32) return salt;
  } catch {
    // first run
  }
  ensure(paths.home);
  const salt = randomBytes(32).toString("hex");
  writeFileSync(paths.salt, salt, { mode: 0o600 });
  return salt;
}

export function isPaused(paths: RelayPaths): boolean {
  return existsSync(paths.pause);
}

const sentFile = (paths: RelayPaths, session: string) => path.join(paths.sessions, `${session.slice(0, 32)}.json`);

export function readSent(paths: RelayPaths, session: string): Sent | null {
  try {
    return JSON.parse(readFileSync(sentFile(paths, session), "utf8")) as Sent;
  } catch {
    return null;
  }
}

export function writeSent(paths: RelayPaths, session: string, sent: Sent): void {
  ensure(paths.sessions);
  writeFileSync(sentFile(paths, session), JSON.stringify(sent), { mode: 0o600 });
}

/** One line per decision (agent, event, state, outcome); never payload text. Rotates at 256 KB. */
export function appendLog(paths: RelayPaths, line: string): void {
  ensure(paths.home);
  try {
    if (statSync(paths.log).size > LOG_MAX_BYTES) renameSync(paths.log, `${paths.log}.1`);
  } catch {
    // no log yet
  }
  appendFileSync(paths.log, `${new Date().toISOString()} ${line}\n`, { mode: 0o600 });
}
```

Create `tools/office-relay/src/beat.ts`:

```ts
import type { OfficeActivity, OfficeAgent, OfficeBeatV1, OfficeState } from "../../../src/lib/office/protocol";
import { repoAllowed } from "../../../workers/office/src/ingest";
import type { GitInfo } from "./git";
import type { Mapped } from "./map";
import { branchTitle } from "./title";

/** While events keep coming in one state, resend at most this often so the office does not show thinking. */
export const KEEPALIVE_MS = 15_000;

export interface Sent {
  state: OfficeState;
  activity: OfficeActivity;
  repo?: string;
  title?: string;
  sentAt: number;
}

/** The only object that leaves the machine: enums, a hashed session, and allowlisted public names. */
export function buildBeat(input: { agent: OfficeAgent; session: string; mapped: Mapped; git: GitInfo | null; allow: readonly string[]; now: number }): OfficeBeatV1 {
  const { agent, session, mapped, git, allow, now } = input;
  const beat: OfficeBeatV1 = { v: 1, agent, session, state: mapped.state, activity: mapped.activity, ts: now };
  if (!git || !repoAllowed(git.repo, allow)) return beat;
  const title = git.branch ? branchTitle(git.branch) : null;
  return { ...beat, repo: git.repo, ...(git.branch ? { branch: git.branch } : {}), ...(title ? { title } : {}) };
}

export function shouldSend(prev: Sent | null, beat: OfficeBeatV1, now: number): boolean {
  if (!prev) return true;
  if (prev.state !== beat.state || prev.activity !== beat.activity || prev.repo !== beat.repo || prev.title !== beat.title) return true;
  return now - prev.sentAt >= KEEPALIVE_MS;
}
```

Create `tools/office-relay/src/hook.ts`:

```ts
import { OFFICE_AGENTS, parseOfficeBeat, type OfficeAgent } from "../../../src/lib/office/protocol";
import { buildBeat, shouldSend } from "./beat";
import type { GitInfo } from "./git";
import { mapEvent, payloadCwd, rawSessionId } from "./map";
import { sessionHash } from "./session";
import { appendLog, isPaused, loadConfig, loadSalt, readSent, writeSent, type RelayPaths } from "./store";

export interface HookDeps {
  paths: RelayPaths;
  now: () => number;
  readGit: (cwd: string) => GitInfo | null;
  /** Hands the signed-later body to the detached sender (cli.ts) or a test. */
  dispatch: (body: string) => void;
}

const isAgent = (x: string): x is OfficeAgent => (OFFICE_AGENTS as readonly string[]).includes(x);

/**
 * The hook path: local work only (map, git files, hash, dedupe), then `dispatch`. Throws nothing the caller must
 * handle except file system errors, which cli.ts swallows; logs one line per event without any payload text.
 */
export function runHook(agent: string, event: string, stdin: string, deps: HookDeps): "sent" | "skipped" | "paused" | "ignored" {
  const { paths } = deps;
  if (isPaused(paths)) return "paused";
  if (!isAgent(agent)) return "ignored";
  let payload: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(stdin);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return "ignored";
    payload = parsed as Record<string, unknown>;
  } catch {
    return "ignored";
  }
  const safeEvent = event.replace(/[^A-Za-z]/g, "").slice(0, 32);
  const mapped = mapEvent(agent, safeEvent, payload);
  if (!mapped) {
    appendLog(paths, `${agent} ${safeEvent} ignored`);
    return "ignored";
  }
  const now = deps.now();
  const raw = rawSessionId(payload) ?? `${payloadCwd(payload) ?? "unknown"}`;
  const session = sessionHash(agent, raw, loadSalt(paths));
  const cwd = payloadCwd(payload);
  const beat = buildBeat({ agent, session, mapped, git: cwd ? deps.readGit(cwd) : null, allow: loadConfig(paths).allow, now });
  if (!parseOfficeBeat(beat)) {
    appendLog(paths, `${agent} ${safeEvent} invalid`);
    return "ignored";
  }
  if (!shouldSend(readSent(paths, session), beat, now)) {
    appendLog(paths, `${agent} ${safeEvent} ${beat.state} skipped`);
    return "skipped";
  }
  writeSent(paths, session, { state: beat.state, activity: beat.activity, repo: beat.repo, title: beat.title, sentAt: now });
  deps.dispatch(JSON.stringify(beat));
  appendLog(paths, `${agent} ${safeEvent} ${beat.state} sent`);
  return "sent";
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bunx vitest run tests/relay/hook.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add tools/office-relay/src/store.ts tools/office-relay/src/beat.ts tools/office-relay/src/hook.ts tests/relay/hook.test.ts
git commit -m "feat(relay): hook path with allowlisted repository data, dedupe and keepalive"
```

### Task 4: Detached sender and the CLI

**Files:**
- Create: `tools/office-relay/src/send.ts`, `tools/office-relay/src/cli.ts`
- Test: `tests/relay/cli.test.ts`

**Interfaces:**
- Consumes: Task 2 (`readGit`), Task 3 (`runHook`, `relayPaths`, `loadConfig`, `appendLog`, `isPaused`), part 1 (`parseOfficeBeat`, `OFFICE_BEAT_PATH`).
- Produces: `signBody(body: string, key: string): string` (`sha256=<hex>`), `readIngestKey(env?: NodeJS.ProcessEnv): string | null`, `endpointOf(config: RelayConfig, env?: NodeJS.ProcessEnv): string`, `postBeat(body: string, opts: { endpoint: string; key: string; timeoutMs?: number }): Promise<number>` (HTTP status, 0 on any error); CLI `bun tools/office-relay/src/cli.ts <hook <agent> <event> | send | pause | resume | status>`. Test-only environment: `OFFICE_RELAY_SPOOL` (dispatch appends bodies to this file instead of spawning), `OFFICE_RELAY_KEY` (key instead of the Keychain), `OFFICE_RELAY_ENDPOINT` (accepted only for `http://127.0.0.1:<port>/`), `OFFICE_RELAY_HOME`.

- [ ] **Step 1: Write the failing test**

Create `tests/relay/cli.test.ts`:

```ts
import { spawn, spawnSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseOfficeBeat } from "@/lib/office/protocol";
import { HOOK_FIXTURES } from "./fixtures";

const CLI = path.resolve("tools/office-relay/src/cli.ts");
const home = () => mkdtempSync(path.join(tmpdir(), "relay-cli-"));
const run = (args: string[], env: Record<string, string>, input = "") => spawnSync("bun", [CLI, ...args], { input, encoding: "utf8", env: { PATH: process.env.PATH ?? "", ...env }, timeout: 10_000 });

describe("office-relay CLI", () => {
  it("hook: exit 0, empty stdout and stderr, one beat dispatched, fast", () => {
    const h = home();
    const spool = path.join(h, "spool");
    const started = Date.now();
    const r = run(["hook", "copilot", "preToolUse"], { HOME: h, OFFICE_RELAY_SPOOL: spool }, JSON.stringify(HOOK_FIXTURES.copilot.preToolUse));
    expect(Date.now() - started).toBeLessThan(3000);
    expect(r.status).toBe(0);
    expect(r.stdout).toBe("");
    expect(r.stderr).toBe("");
    const [line] = readFileSync(spool, "utf8").trim().split("\n");
    expect(parseOfficeBeat(JSON.parse(line))).toMatchObject({ agent: "copilot", state: "testing" });
  });

  it("hook: still exit 0 and silent when the home cannot be written or stdin is garbage", () => {
    for (const env of [{ HOME: "/nonexistent/office-relay-test" }, { HOME: home() }]) {
      const r = run(["hook", "copilot", "preToolUse"], env, "garbage");
      expect(r.status).toBe(0);
      expect(r.stdout + r.stderr).toBe("");
    }
    const r = run(["hook", "copilot", "preToolUse"], { HOME: "/nonexistent/office-relay-test" }, JSON.stringify(HOOK_FIXTURES.copilot.preToolUse));
    expect(r.status).toBe(0);
    expect(r.stdout + r.stderr).toBe("");
  });

  it("send: posts the body signed with the key, and logs only the status", async () => {
    const h = home();
    const received: { body: string; signature: string | undefined }[] = [];
    const server = createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        received.push({ body, signature: req.headers["x-office-signature"] as string | undefined });
        res.writeHead(204).end();
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;
    const beat = JSON.stringify({ v: 1, agent: "claude", session: "e".repeat(64), state: "done", activity: "finished", ts: Date.now() });
    const child = spawn("bun", [CLI, "send"], { env: { PATH: process.env.PATH ?? "", HOME: h, OFFICE_BEAT: beat, OFFICE_RELAY_KEY: "k", OFFICE_RELAY_ENDPOINT: `http://127.0.0.1:${port}/api/office/beat` }, stdio: "ignore" });
    await new Promise((resolve) => child.on("close", resolve));
    server.close();
    expect(received).toEqual([{ body: beat, signature: `sha256=${createHmac("sha256", "k").update(beat).digest("hex")}` }]);
    expect(readFileSync(path.join(h, ".office-relay", "relay.log"), "utf8")).toMatch(/send 204\n$/);
  });

  it("send: refuses a non-local http endpoint override and an invalid body", () => {
    const h = home();
    const r = run(["send"], { HOME: h, OFFICE_BEAT: '{"v":1,"prompt":"x"}', OFFICE_RELAY_KEY: "k", OFFICE_RELAY_ENDPOINT: "http://evil.example/" });
    expect(r.status).toBe(0);
    expect(readFileSync(path.join(h, ".office-relay", "relay.log"), "utf8")).toContain("send invalid");
  });

  it("pause, status and resume", () => {
    const h = home();
    expect(run(["pause"], { HOME: h }).stdout).toContain("paused");
    expect(existsSync(path.join(h, ".office-pause"))).toBe(true);
    expect(run(["status"], { HOME: h, OFFICE_RELAY_KEY: "k" }).stdout).toMatch(/office-relay: paused[\s\S]*ingest key: found/);
    expect(run(["resume"], { HOME: h }).stdout).toContain("active");
    expect(existsSync(path.join(h, ".office-pause"))).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bunx vitest run tests/relay/cli.test.ts`
Expected: FAIL: the first test's `r.status` is 1 with "Module not found" in stderr (no `cli.ts` yet).

- [ ] **Step 3: Write the sender and the CLI**

Create `tools/office-relay/src/send.ts`:

```ts
import { spawnSync } from "node:child_process";
import { createHmac } from "node:crypto";
import type { RelayConfig } from "./store";

export const KEYCHAIN_SERVICE = "hq-office-ingest";
export const KEYCHAIN_ACCOUNT = "office-relay";
const LOCAL_TEST_ENDPOINT = /^http:\/\/127\.0\.0\.1:\d{2,5}\//;

/** `X-Office-Signature` value: HMAC-SHA256 of the exact body, lowercase hex (checked by workers/office/src/crypto.ts). */
export function signBody(body: string, key: string): string {
  return `sha256=${createHmac("sha256", key).update(body).digest("hex")}`;
}

/** The ingest key from the macOS Keychain (OFFICE_RELAY_KEY overrides it for tests), or null. */
export function readIngestKey(env: NodeJS.ProcessEnv = process.env): string | null {
  if (env.OFFICE_RELAY_KEY) return env.OFFICE_RELAY_KEY;
  if (process.platform !== "darwin") return null;
  const r = spawnSync("security", ["find-generic-password", "-s", KEYCHAIN_SERVICE, "-a", KEYCHAIN_ACCOUNT, "-w"], { encoding: "utf8", timeout: 1500 });
  const key = r.status === 0 ? String(r.stdout).trim() : "";
  return key || null;
}

/** The configured https endpoint; tests may point it at 127.0.0.1 only. */
export function endpointOf(config: RelayConfig, env: NodeJS.ProcessEnv = process.env): string {
  const override = env.OFFICE_RELAY_ENDPOINT;
  return override && LOCAL_TEST_ENDPOINT.test(override) ? override : config.endpoint;
}

/** Posts one beat with a 2 s timeout; the HTTP status, or 0 on any error. */
export async function postBeat(body: string, opts: { endpoint: string; key: string; timeoutMs?: number }): Promise<number> {
  try {
    const res = await fetch(opts.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Office-Signature": signBody(body, opts.key) },
      body,
      signal: AbortSignal.timeout(opts.timeoutMs ?? 2000),
    });
    return res.status;
  } catch {
    return 0;
  }
}
```

Create `tools/office-relay/src/cli.ts`:

```ts
#!/usr/bin/env bun
import { spawn } from "node:child_process";
import { appendFileSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseOfficeBeat } from "../../../src/lib/office/protocol";
import { readGit } from "./git";
import { runHook } from "./hook";
import { endpointOf, postBeat, readIngestKey } from "./send";
import { appendLog, isPaused, loadConfig, relayPaths, type RelayPaths } from "./store";

const SELF = fileURLToPath(import.meta.url);

/** stdin of a hook, capped at 1 MB and 1 s (a hook that never closes stdin cannot hang the agent). */
function readStdin(timeoutMs = 1000, maxBytes = 1 << 20): Promise<string> {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) return resolve("");
    const chunks: Buffer[] = [];
    let size = 0;
    const done = () => {
      clearTimeout(timer);
      process.stdin.pause();
      resolve(Buffer.concat(chunks).toString("utf8"));
    };
    const timer = setTimeout(done, timeoutMs);
    process.stdin.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size <= maxBytes) chunks.push(chunk);
      else done();
    });
    process.stdin.on("end", done);
    process.stdin.on("error", done);
  });
}

/** Hands a beat to a detached `send` child, so the agent never waits for the network. */
function dispatch(body: string): void {
  const spool = process.env.OFFICE_RELAY_SPOOL;
  if (spool) {
    appendFileSync(spool, `${body}\n`);
    return;
  }
  const child = spawn(process.execPath, [SELF, "send"], { detached: true, stdio: "ignore", env: { ...process.env, OFFICE_BEAT: body } });
  child.unref();
}

async function send(paths: RelayPaths): Promise<void> {
  const body = process.env.OFFICE_BEAT ?? "";
  let valid = false;
  try {
    valid = parseOfficeBeat(JSON.parse(body)) !== null;
  } catch {
    valid = false;
  }
  if (!valid) return appendLog(paths, "send invalid");
  const key = readIngestKey();
  if (!key) return appendLog(paths, "send no-key");
  const status = await postBeat(body, { endpoint: endpointOf(loadConfig(paths)), key });
  appendLog(paths, `send ${status}`);
}

function status(paths: RelayPaths): string {
  const config = loadConfig(paths);
  let tail: string[] = [];
  try {
    tail = readFileSync(paths.log, "utf8").trim().split("\n").slice(-10);
  } catch {
    tail = ["(no events yet)"];
  }
  return [
    `office-relay: ${isPaused(paths) ? "paused" : "active"}`,
    `endpoint: ${config.endpoint}`,
    `ingest key: ${readIngestKey() ? "found" : "missing (security add-generic-password -s hq-office-ingest -a office-relay -w <key>)"}`,
    `allowlist: ${config.allow.join(", ")}`,
    "last events:",
    ...tail.map((l) => `  ${l}`),
  ].join("\n");
}

const USAGE = "usage: office-relay hook <agent> <event> | send | pause | resume | status";

async function main(argv: string[]): Promise<void> {
  const [command, a = "", b = ""] = argv;
  const paths = relayPaths();
  switch (command) {
    case "hook":
      runHook(a, b, await readStdin(), { paths, now: Date.now, readGit: (cwd) => readGit(cwd), dispatch });
      return;
    case "send":
      return send(paths);
    case "pause":
      writeFileSync(paths.pause, "");
      console.log("office-relay: paused (nothing is sent until `office-relay resume`)");
      return;
    case "resume":
      rmSync(paths.pause, { force: true });
      console.log("office-relay: active");
      return;
    case "status":
      console.log(status(paths));
      return;
    default:
      console.log(USAGE);
  }
}

// A hook must never fail or print: errors are swallowed and the process always exits 0.
main(process.argv.slice(2))
  .catch(() => undefined)
  .finally(() => process.exit(0));
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bunx vitest run tests/relay/cli.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add tools/office-relay/src/send.ts tools/office-relay/src/cli.ts tests/relay/cli.test.ts
git commit -m "feat(relay): detached signed sender and the office-relay CLI"
```

### Task 5: Installer for the three agents

**Files:**
- Create: `tools/office-relay/src/install.ts`
- Modify: `tools/office-relay/src/cli.ts` (commands `install`, `uninstall`; hook lines in `status`)
- Test: `tests/relay/install.test.ts`

**Interfaces:**
- Consumes: Task 4 (`cli.ts`).
- Produces: `MARKER = "office-relay hook"`, `COPILOT_EVENTS`, `CLAUDE_EVENTS`, `CODEX_EVENTS`, `interface InstallPaths { copilot: string; claude: string; codex: string; bin: string }`, `installPaths(home: string): InstallPaths`, `copilotHooks(bin: string): object`, `mergeClaude(settings: Record<string, unknown>, bin: string): Record<string, unknown>`, `mergeCodex(file: Record<string, unknown>, bin: string): Record<string, unknown>`, `stripOurs(file: Record<string, unknown>): Record<string, unknown>`, `installed(paths: InstallPaths): Record<"copilot" | "claude" | "codex", boolean>`, `install(home: string, opts: { cli: string; runtime: string; now?: number }): string[]` (report lines), `uninstall(home: string): string[]`.

- [ ] **Step 1: Write the failing test**

Create `tests/relay/install.test.ts`:

```ts
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CLAUDE_EVENTS, CODEX_EVENTS, COPILOT_EVENTS, install, installed, installPaths, MARKER, uninstall } from "../../tools/office-relay/src/install";

const opts = { cli: "/repo/tools/office-relay/src/cli.ts", runtime: "/opt/bun/bin/bun", now: 1_792_327_344_000 };
const json = (file: string) => JSON.parse(readFileSync(file, "utf8"));

function homeWithClaude(settings: unknown) {
  const home = mkdtempSync(path.join(tmpdir(), "relay-install-"));
  mkdirSync(path.join(home, ".claude"));
  writeFileSync(path.join(home, ".claude", "settings.json"), JSON.stringify(settings));
  return home;
}

describe("install", () => {
  it("writes Copilot's file, merges Claude Code and Codex, keeps other settings, backs up, adds the shim", () => {
    const other = { matcher: "Bash", hooks: [{ type: "command", command: "~/bin/my-guard.sh" }] };
    const home = homeWithClaude({ theme: "dark", hooks: { PreToolUse: [other] } });
    const report = install(home, opts);
    const p = installPaths(home);

    const copilot = json(p.copilot);
    expect(copilot.version).toBe(1);
    expect(Object.keys(copilot.hooks)).toEqual([...COPILOT_EVENTS]);
    expect(copilot.hooks.preToolUse[0]).toEqual({ type: "command", bash: `"${p.bin}" hook copilot preToolUse`, timeoutSec: 5, matcher: "bash|powershell" });

    const claude = json(p.claude);
    expect(claude.theme).toBe("dark");
    expect(claude.hooks.PreToolUse[0]).toEqual(other);
    expect(claude.hooks.PreToolUse[1]).toEqual({ matcher: "Bash", hooks: [{ type: "command", command: `"${p.bin}" hook claude PreToolUse`, async: true, timeout: 5 }] });
    expect(Object.keys(claude.hooks)).toEqual(expect.arrayContaining([...CLAUDE_EVENTS]));

    const codex = json(p.codex);
    expect(Object.keys(codex.hooks)).toEqual([...CODEX_EVENTS]);
    expect(codex.hooks.SessionEnd[0].hooks[0]).toEqual({ type: "command", command: `"${p.bin}" hook codex SessionEnd`, timeout: 1 });
    expect(codex.hooks.PreToolUse[0].matcher).toBe("^Bash$");
    expect(codex.hooks.Stop[0].hooks[0].async).toBe(true);

    expect(readFileSync(p.bin, "utf8")).toBe(`#!/bin/sh\nexec "${opts.runtime}" "${opts.cli}" "$@"\n`);
    expect(statSync(p.bin).mode & 0o111).not.toBe(0);
    expect(readdirSync(path.join(home, ".claude")).some((f) => f.startsWith("settings.json.office-backup-"))).toBe(true);
    expect(report.join("\n")).toContain("Codex: open /hooks");
    expect(installed(p)).toEqual({ copilot: true, claude: true, codex: true });
  });

  it("is idempotent: a second install keeps one office entry per event", () => {
    const home = homeWithClaude({});
    install(home, opts);
    install(home, { ...opts, now: opts.now + 1 });
    const p = installPaths(home);
    for (const event of CLAUDE_EVENTS) expect(JSON.stringify(json(p.claude).hooks[event]).split(MARKER).length - 1).toBe(1);
    for (const event of CODEX_EVENTS) expect(JSON.stringify(json(p.codex).hooks[event]).split(MARKER).length - 1).toBe(1);
  });

  it("refuses to touch a settings file it cannot parse", () => {
    const home = mkdtempSync(path.join(tmpdir(), "relay-install-"));
    mkdirSync(path.join(home, ".claude"));
    writeFileSync(path.join(home, ".claude", "settings.json"), "{ not json");
    expect(() => install(home, opts)).toThrow(/settings\.json/);
    expect(readFileSync(path.join(home, ".claude", "settings.json"), "utf8")).toBe("{ not json");
    expect(existsSync(installPaths(home).copilot)).toBe(false);
  });

  it("uninstall removes only the office entries, the Copilot file and the shim", () => {
    const other = { hooks: [{ type: "command", command: "~/bin/notify.sh" }] };
    const home = homeWithClaude({ hooks: { Stop: [other] } });
    install(home, opts);
    uninstall(home);
    const p = installPaths(home);
    expect(json(p.claude).hooks).toEqual({ Stop: [other] });
    expect(json(p.codex).hooks).toEqual({});
    expect(existsSync(p.copilot)).toBe(false);
    expect(existsSync(p.bin)).toBe(false);
    expect(installed(p)).toEqual({ copilot: false, claude: false, codex: false });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bunx vitest run tests/relay/install.test.ts`
Expected: FAIL with "Failed to resolve import "../../tools/office-relay/src/install"".

- [ ] **Step 3: Write the installer and wire it into the CLI**

Create `tools/office-relay/src/install.ts`:

```ts
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

/** Every command the installer writes contains this, so it only ever replaces or removes its own entries. */
export const MARKER = "office-relay hook";

export const COPILOT_EVENTS = ["sessionStart", "userPromptSubmitted", "preToolUse", "postToolUse", "postToolUseFailure", "permissionRequest", "notification", "agentStop", "errorOccurred", "sessionEnd"] as const;
export const CLAUDE_EVENTS = ["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "PostToolUseFailure", "PermissionRequest", "Notification", "Stop", "StopFailure", "SessionEnd"] as const;
export const CODEX_EVENTS = ["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "PermissionRequest", "Stop", "SessionEnd"] as const;

export interface InstallPaths {
  copilot: string;
  claude: string;
  codex: string;
  bin: string;
}

export function installPaths(home: string): InstallPaths {
  return {
    copilot: path.join(home, ".copilot", "hooks", "office.json"),
    claude: path.join(home, ".claude", "settings.json"),
    codex: path.join(home, ".codex", "hooks.json"),
    bin: path.join(home, ".local", "bin", "office-relay"),
  };
}

type Obj = Record<string, unknown>;
interface Group {
  matcher?: string;
  hooks: Obj[];
}

const isObj = (x: unknown): x is Obj => typeof x === "object" && x !== null && !Array.isArray(x);
const command = (bin: string, agent: string, event: string) => `"${bin}" hook ${agent} ${event}`;
const ours = (h: Obj) => String(h.command ?? h.bash ?? "").includes(MARKER);

function withoutOurs(groups: unknown): Group[] {
  if (!Array.isArray(groups)) return [];
  return groups
    .filter(isObj)
    .map((g) => ({ ...g, hooks: (Array.isArray(g.hooks) ? g.hooks.filter(isObj) : []).filter((h) => !ours(h)) }))
    .filter((g) => g.hooks.length > 0);
}

/** Copilot CLI user hooks (`~/.copilot/hooks/office.json`): synchronous, so the relay returns at once. */
export function copilotHooks(bin: string): Obj {
  const entry = (event: string) => ({ type: "command", bash: command(bin, "copilot", event), timeoutSec: 5, ...(event === "preToolUse" ? { matcher: "bash|powershell" } : {}) });
  return { version: 1, hooks: Object.fromEntries(COPILOT_EVENTS.map((e) => [e, [entry(e)]])) };
}

/** Claude Code `~/.claude/settings.json`: async command hooks next to whatever else is configured. */
export function mergeClaude(settings: Obj, bin: string): Obj {
  const hooks: Obj = { ...(isObj(settings.hooks) ? settings.hooks : {}) };
  for (const e of CLAUDE_EVENTS) {
    hooks[e] = [...withoutOurs(hooks[e]), { ...(e === "PreToolUse" ? { matcher: "Bash" } : {}), hooks: [{ type: "command", command: command(bin, "claude", e), async: true, timeout: 5 }] }];
  }
  return { ...settings, hooks };
}

/** Codex `~/.codex/hooks.json`: async except SessionEnd (always synchronous in Codex, 1 s). Trust once in `/hooks`. */
export function mergeCodex(file: Obj, bin: string): Obj {
  const hooks: Obj = { ...(isObj(file.hooks) ? file.hooks : {}) };
  for (const e of CODEX_EVENTS) {
    const handler = e === "SessionEnd" ? { type: "command", command: command(bin, "codex", e), timeout: 1 } : { type: "command", command: command(bin, "codex", e), async: true, timeout: 5 };
    hooks[e] = [...withoutOurs(hooks[e]), { ...(e === "PreToolUse" ? { matcher: "^Bash$" } : {}), hooks: [handler] }];
  }
  return { ...file, hooks };
}

/** Removes the office entries and the events they leave empty. */
export function stripOurs(file: Obj): Obj {
  const hooks: Obj = {};
  for (const [event, groups] of Object.entries(isObj(file.hooks) ? file.hooks : {})) {
    const kept = withoutOurs(groups);
    if (kept.length > 0) hooks[event] = kept;
  }
  return { ...file, hooks };
}

function readJson(file: string): Obj {
  if (!existsSync(file)) return {};
  try {
    const value: unknown = JSON.parse(readFileSync(file, "utf8"));
    if (isObj(value)) return value;
  } catch {
    // fall through
  }
  throw new Error(`office-relay: cannot parse ${file}; fix or move it, then run install again (nothing was changed)`);
}

function writeJson(file: string, value: Obj, stamp: number): void {
  mkdirSync(path.dirname(file), { recursive: true });
  if (existsSync(file)) copyFileSync(file, `${file}.office-backup-${stamp}`);
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

const hasMarker = (file: string) => existsSync(file) && readFileSync(file, "utf8").includes(MARKER);

export function installed(p: InstallPaths): Record<"copilot" | "claude" | "codex", boolean> {
  return { copilot: hasMarker(p.copilot), claude: hasMarker(p.claude), codex: hasMarker(p.codex) };
}

/** Installs the shim and the three hook configs. Parses every file first, so a broken one aborts before any write. */
export function install(home: string, opts: { cli: string; runtime: string; now?: number }): string[] {
  const p = installPaths(home);
  const stamp = opts.now ?? Date.now();
  const claude = mergeClaude(readJson(p.claude), p.bin);
  const codex = mergeCodex(readJson(p.codex), p.bin);
  mkdirSync(path.dirname(p.bin), { recursive: true });
  writeFileSync(p.bin, `#!/bin/sh\nexec "${opts.runtime}" "${opts.cli}" "$@"\n`);
  chmodSync(p.bin, 0o755);
  writeJson(p.copilot, copilotHooks(p.bin), stamp);
  writeJson(p.claude, claude, stamp);
  writeJson(p.codex, codex, stamp);
  return [
    `shim: ${p.bin}`,
    `GitHub Copilot: ${p.copilot}`,
    `Claude Code: ${p.claude} (backup next to it)`,
    `Codex: ${p.codex} (backup next to it)`,
    "Codex: open /hooks in Codex once and trust the office-relay hooks (again after any change to them).",
    "Key: security add-generic-password -s hq-office-ingest -a office-relay -w <OFFICE_INGEST_KEY>",
    "Check: office-relay status",
  ];
}

export function uninstall(home: string): string[] {
  const p = installPaths(home);
  const stamp = Date.now();
  if (existsSync(p.claude)) writeJson(p.claude, stripOurs(readJson(p.claude)), stamp);
  if (existsSync(p.codex)) writeJson(p.codex, stripOurs(readJson(p.codex)), stamp);
  rmSync(p.copilot, { force: true });
  rmSync(p.bin, { force: true });
  return ["office-relay hooks removed (backups kept next to the files)"];
}
```

In `tools/office-relay/src/cli.ts`:

- add `import { homedir } from "node:os";` and `import { install, installed, installPaths, uninstall } from "./install";`;
- in `status()`, before `"last events:"`, add:

```ts
    ...Object.entries(installed(installPaths(process.env.HOME ?? homedir()))).map(([agent, ok]) => `hooks ${agent}: ${ok ? "installed" : "not installed"}`),
```

- in `main`, before `default:`, add:

```ts
    case "install":
      console.log(install(process.env.HOME ?? homedir(), { cli: SELF, runtime: process.execPath }).join("\n"));
      return;
    case "uninstall":
      console.log(uninstall(process.env.HOME ?? homedir()).join("\n"));
      return;
```

- change `USAGE` to `"usage: office-relay hook <agent> <event> | send | pause | resume | status | install | uninstall"`;
- change the last lines so `install` errors are printed (hooks stay silent):

```ts
main(process.argv.slice(2))
  .catch((error: unknown) => {
    if (process.argv[2] === "install" || process.argv[2] === "uninstall") console.error(error instanceof Error ? error.message : String(error));
  })
  .finally(() => process.exit(0));
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bunx vitest run tests/relay`
Expected: PASS (all relay files: map, git, hook, cli, install).

- [ ] **Step 5: Commit**

```bash
git add tools/office-relay/src/install.ts tools/office-relay/src/cli.ts tests/relay/install.test.ts
git commit -m "feat(relay): installer for Copilot, Claude Code and Codex hooks with backups"
```

### Task 6: CI planning, docs, owner guide and the PR

**Files:**
- Create: `tools/office-relay/README.md`
- Modify: `scripts/ci-plan.ts:37` (a `tools/` rule), `tests/unit/ci-plan.test.ts:30` (a pin), `scripts/e2e-plan.ts` (a `tools/` rule after the office backend rule from part 1), `tests/unit/e2e-plan.test.ts` (a pin), `docs/agents/ci-and-deploy.md` (class table `tooling` row), `docs/agents/office.md` (a "Relay" section), `docs/agents/folder-layout.md` (a `tools/` section), `AGENTS.md` (Folder map row), `docs/features.md` (Status row), this plan's `Status:` line
- Test: `tests/unit/ci-plan.test.ts`, `tests/unit/e2e-plan.test.ts`, `tests/unit/agents-md.test.ts`, `tests/unit/docs-index.test.ts`

**Interfaces:**
- Consumes: Tasks 1 to 5.
- Produces: `classify("tools/...") === "tooling"` and `specsForChanges(["tools/..."]).specs` equal to `[]`, so relay PRs run unit tests only.

- [ ] **Step 1: Write the failing pins**

In `tests/unit/ci-plan.test.ts`, add to the `it.each` table after `["scripts/refresh-facts.ts", "tooling"],`:

```ts
    ["tools/office-relay/src/cli.ts", "tooling"],
    ["tools/office-relay/README.md", "tooling"],
```

In `tests/unit/e2e-plan.test.ts`, inside `it("runs no e2e for the RUM Function", ...)`, add:

```ts
    expect(specsForChanges(["tools/office-relay/src/hook.ts", "tools/office-relay/README.md"])).toEqual({ specs: [], unmatched: [] });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bunx vitest run tests/unit/ci-plan.test.ts tests/unit/e2e-plan.test.ts`
Expected: FAIL: `tools/office-relay/src/cli.ts` classifies as `other`, and the e2e plan reports it as unmatched.

- [ ] **Step 3: Add the rules, the guide and the docs**

In `scripts/ci-plan.ts`, change line 37 from `[/^scripts\//, "tooling"],` to:

```ts
  [/^scripts\/|^tools\//, "tooling"],
```

In `scripts/e2e-plan.ts`, add after the Agent Office backend rule:

```ts
  // Local developer tools (tools/office-relay): unit tested in tests/relay; nothing the site ships.
  { test: /^tools\//, specs: [] },
```

In `docs/agents/ci-and-deploy.md`, change the `tooling` row of the class table to:

```markdown
| `tooling` | other `scripts/`, `tools/` | mapped specs | no | no |
```

Create `tools/office-relay/README.md`:

```markdown
# office-relay

The local half of the L1 Agent Office (`docs/agents/office.md`): hooks of GitHub Copilot, Claude Code and OpenAI Codex
call `office-relay hook <agent> <event>`, which turns the event into a tiny signed beat (agent, a hashed session id, a
state, an activity type, and for allowlisted public repositories the repository, branch and a title from the branch
name) and posts it to `https://kurniadi.pages.dev/api/office/beat` from a detached process. Prompts, commands, file paths,
output and the raw session id never leave the machine.

## Install (owner, once)

1. Put the ingest key in the Keychain (the same value as the `OFFICE_INGEST_KEY` production secret):
   `security add-generic-password -s hq-office-ingest -a office-relay -w <key>`
2. From the repository root: `bun tools/office-relay/src/cli.ts install`. It writes the shim `~/.local/bin/office-relay`
   (pointing at this checkout and this Bun), `~/.copilot/hooks/office.json`, and merges `~/.claude/settings.json` and
   `~/.codex/hooks.json` (a backup `*.office-backup-<time>` sits next to each changed file).
3. Codex: start Codex, open `/hooks`, review and trust the office-relay hooks (again after any reinstall).
4. Check: `office-relay status` shows "active", "ingest key: found" and the three hooks installed. Use each agent once
   and run `office-relay status` again: the last events list `copilot ...`, `claude ...` and `codex ...` lines with
   `sent` and `send 204`. For the GitHub Copilot desktop app, start a session there and look for `copilot` lines too
   (the app is built on Copilot CLI; this confirms it loads `~/.copilot/hooks`).

## Use

- `office-relay pause` stops all broadcasting (creates `~/.office-pause`); `office-relay resume` starts it again.
- `office-relay status`: state, endpoint, key, hooks and the last ten events (agent, event, state, outcome only).
- `office-relay uninstall` removes the office entries, the Copilot file and the shim (other hooks stay).
- Config: `~/.office-relay/config.json` `{ "endpoint": "https://kurniadi.pages.dev/api/office/beat", "allow": ["ShinyQ/*"] }`.
  Only repositories in `allow` (and, on the server, only public ones) show a title; everything else is "Client project".

## Troubleshooting

- `send no-key`: the Keychain item is missing or named differently (step 1).
- `send 401`: the key differs from the Worker's `OFFICE_INGEST_KEY`, or the Mac's clock is off by more than 60 s.
- `send 0`: no network or a timeout (2 s); the office shows the agent asleep after 3 minutes.
- No lines for an agent: its hook config is missing (`office-relay status`), or Codex hooks are not trusted yet.
- The relay never blocks an agent: it exits 0 with no output even when it fails.
```

Append to `docs/agents/office.md`:

```markdown
## Relay

- `tools/office-relay/` (Bun CLI, guide in its README): the local privacy boundary. Hooks call
  `office-relay hook <agent> <event>` (the event name comes from argv: Copilot's camelCase payloads carry none).
- Mapping (`map.ts`, `command.ts`): tool names and the first words of a shell command only; spec section 5. Tests:
  `tests/relay/map.test.ts` over `tests/relay/fixtures.ts` (payloads of all three agents with planted secrets).
- Git data from `.git` files only (`git.ts`, worktrees included); titles from branch names (`title.ts`); the session id
  is an HMAC with a local salt (`session.ts`).
- Hook path (`hook.ts`): local work, dedupe per session with a 15 s keepalive (`beat.ts`), then a detached `send`
  child; always exit 0 with empty stdout (a failing Copilot `preToolUse` hook would deny the tool).
- Sender (`send.ts`): Keychain item `hq-office-ingest`, `X-Office-Signature`, 2 s timeout; logs the status only.
- Installer (`install.ts`): `~/.copilot/hooks/office.json`, merges `~/.claude/settings.json` and `~/.codex/hooks.json`
  (async handlers, backups, only entries containing `office-relay hook` are replaced); Codex needs a trust in `/hooks`.
- Never add a beat field, a log field or a debug mode that records payload text.
```

In `docs/agents/folder-layout.md`, add a section before `## scripts/`:

```markdown
## tools/

- `tools/office-relay/`: the Agent Office relay (Bun CLI) and its installer for the GitHub Copilot, Claude Code and
  Codex hooks; runs on the owner's machine, never on the site. See [office.md](office.md#relay).
```

In `AGENTS.md`, add a Folder map row after `scripts/`:

```markdown
| `tools/` | `tools/office-relay`: the local Agent Office relay and hook installer (runs on the owner's Mac) |
```

In `docs/features.md`, add a Status row:

```markdown
| Agent Office, part 2 (relay) | 2026-10-19: office-relay turns GitHub Copilot, Claude Code and Codex hook events into signed, privacy-filtered beats; one installer for all three | In review |
```

- [ ] **Step 4: Verify**

Run: `bunx vitest run tests/unit/ci-plan.test.ts tests/unit/e2e-plan.test.ts tests/relay && bun run verify:quick && bun run e2e:changed --dry`
Expected: PASS; the dry plan selects no e2e spec for `tools/` files.

- [ ] **Step 5: Commit, push and open the PR**

```bash
git add scripts/ci-plan.ts scripts/e2e-plan.ts tests/unit/ci-plan.test.ts tests/unit/e2e-plan.test.ts tools/office-relay/README.md docs/agents/office.md docs/agents/folder-layout.md docs/agents/ci-and-deploy.md AGENTS.md docs/features.md
git commit -m "docs(relay): owner guide, agent rules and CI planning for tools/"
```

Check `gh run list -R ShinyQ/ShinyQ-HQ -s in_progress` and `-s queued` (at most 2 runs in flight, no `main` run), push, and
open a ready-for-review PR `feat(relay): office-relay and hook installer for Copilot, Claude Code and Codex` whose body has the
privacy summary, the test list and the owner actions below. Then set this plan's `Status:` to `in review in #<N>`.

## Self-review

- Spec coverage: 3.1 (configs, events, command hooks only) in Tasks 1 and 5; 3.2 (relay, enums only, hashed session,
  allowlist, branch titles, dedupe, fire-and-forget, 2 s timeout, never non-zero, Keychain, pause) in Tasks 2 to 4;
  5 (state mapping, first command words) in Task 1; 6 (relay layer of privacy) in Tasks 3 and 4 (planted-secret test);
  8 (relay failures never affect agents) in Task 4; 9 (relay tests) throughout; 12 corrections (argv event names,
  `postToolUseFailure`, async handlers, `hooks.json` for Codex, no `gh`) in Tasks 1, 3 and 5.
- Placeholder scan: none; owner-specific values (the key) never enter the repo.
- Type consistency: `Mapped`, `GitInfo`, `Sent`, `RelayPaths`, `RelayConfig`, `HookDeps`, `InstallPaths` match across tasks;
  the beat type is part 1's `OfficeBeatV1`.

## Owner actions

1. Add the Keychain item with the same key as the `OFFICE_INGEST_KEY` production secret (part 1).
2. Run `bun tools/office-relay/src/cli.ts install` from the main checkout (not a worktree that will be deleted).
3. In Codex, open `/hooks` and trust the office-relay hooks.
4. Use Copilot (CLI and the desktop app), Claude Code and Codex once each; send me `office-relay status` output (it holds
   no payload text) so I can confirm all three, and the desktop app, report.
