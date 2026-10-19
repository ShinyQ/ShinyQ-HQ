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

export const toolName = (p: Record<string, unknown>) => (str(p.toolName) || str(p.tool_name)).toLowerCase();

/** How long after a Copilot `preToolUse` its `permissionRequest` still counts as that tool call's permission check. */
export const PERMISSION_CHECK_MS = 1500;

/** The last Copilot `preToolUse` of a session (kept on disk, because every hook call is its own process). */
export interface LastTool {
  tool: string;
  at: number;
}

/**
 * Copilot fires `permissionRequest` before its permission service decides (rules, session approvals, allow-all,
 * autopilot), so it follows the `preToolUse` of nearly every tool call, and its payload says nothing about the
 * outcome. Such a request is a permission check, not a prompt: a prompt the user must answer comes as the
 * `permission_prompt` notification. A request with no matching `preToolUse` just before it still means Needs Kurniadi.
 */
export function isPermissionCheck(last: LastTool | null, tool: string, now: number): boolean {
  return last !== null && tool !== "" && last.tool === tool && now - last.at >= 0 && now - last.at <= PERMISSION_CHECK_MS;
}

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
