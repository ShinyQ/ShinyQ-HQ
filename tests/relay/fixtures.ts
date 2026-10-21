import { loadDefaultBlocklist } from "@/content/safety";
import type { OfficeAgent } from "@/lib/office/protocol";

export const PROMPT = "Fix the login bug for the client portal, password is hunter2";
export const SECRET_CMD = "bun test tests/client-portal/login.test.ts --token=abc123";
export const CWD = "/Users/someone/Work/client-portal";
export const OUTPUT = "FAIL tests/client-portal/login.test.ts: expected 200";
/** A client name from the committed safety blocklist (the first plain term), read at run time so no test names one. */
export const CLIENT = loadDefaultBlocklist().find((t) => !t.startsWith("/")) ?? "Blocked Client";
/** Sub-agent (helper) payload text: the task prompt, its description, private transcripts, the helper's id and type. */
export const HELPER_PROMPT = "Audit the payment webhook, the key is sk-live-secret";
export const HELPER_DESC = `Review the ${CLIENT} onboarding flow`;
export const PRIVATE_TRANSCRIPT = "/Users/someone/private/sessions/main.jsonl";
export const HELPER_TRANSCRIPT = "/Users/someone/private/sessions/subagents/agent-helper.jsonl";
export const HELPER_ID = "agent-helper-7f3a9c";
export const HELPER_TYPE = "ledger-sleuth";
/** Strings that must never appear in a beat or the relay log. */
export const PLANTED = [PROMPT, SECRET_CMD, CWD, OUTPUT, "hunter2", "client-portal", "abc123", "transcript.jsonl", "raw-session-123", HELPER_PROMPT, "sk-live-secret", HELPER_DESC, CLIENT, "/Users/someone/private", HELPER_ID, HELPER_TYPE, "raw-helper-session-456", "raw-parent-agent-789"] as const;

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
    // A tool call inside a helper (hooks reference: "hooks that fire inside a subagent include extra fields"): the
    // helper's own session id plus `agentId`, `agentType` and `parentAgentId`. The relay ignores it.
    preToolUseInHelper: { ...copilot({ toolName: "edit", toolArgs: { path: `${CWD}/src/login.ts` } }), sessionId: "raw-helper-session-456", agentId: HELPER_ID, agentType: HELPER_TYPE, parentAgentId: "raw-parent-agent-789" },
    preToolUseMcp: copilot({ toolName: "github-mcp-server-get_file_contents", toolArgs: { path: `${CWD}/src/login.ts` } }),
    // The shape Copilot CLI 1.0.97 sends (captured): `toolInput`, not `toolArgs`, and nothing about auto-approval.
    permissionRequest: copilot({ hookName: "permissionRequest", toolName: "bash", toolInput: { command: SECRET_CMD }, permissionSuggestions: [] }),
    notification: { ...copilot({}), hook_event_name: "Notification", message: PROMPT, notification_type: "permission_prompt" },
    notificationIdle: { ...copilot({}), hook_event_name: "Notification", message: "idle", notification_type: "agent_idle" },
    agentStop: copilot({ transcriptPath: `${CWD}/transcript.jsonl`, stopReason: "end_turn" }),
    errorOccurred: copilot({ error: { message: OUTPUT, name: "Error" }, errorContext: "model_call", recoverable: false }),
    sessionEnd: copilot({ reason: "complete" }),
    // Copilot CLI 1.0.99 (hooks reference, SDK `SubagentStartHookInput`): `sessionId` is the parent session, and the start
    // names no helper id (only the stop carries `agentId`). `prompt` is not documented; planted to prove it is never read.
    subagentStart: copilot({ transcriptPath: PRIVATE_TRANSCRIPT, agentName: HELPER_TYPE, agentDisplayName: "Ledger Sleuth", agentDescription: HELPER_DESC, prompt: HELPER_PROMPT }),
    subagentStop: copilot({ transcriptPath: PRIVATE_TRANSCRIPT, agentId: HELPER_ID, agentType: HELPER_TYPE, agentName: HELPER_TYPE, agentDisplayName: "Ledger Sleuth", response: `${HELPER_PROMPT}. ${HELPER_DESC}`, stopReason: "end_turn" }),
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
    // Claude Code 2.1.223: `session_id` is the main session, `agent_id` the helper; `prompt` and `description` are planted.
    SubagentStart: snake("SubagentStart", { transcript_path: PRIVATE_TRANSCRIPT, agent_id: HELPER_ID, agent_type: HELPER_TYPE, prompt: HELPER_PROMPT, description: HELPER_DESC }),
    SubagentStop: snake("SubagentStop", { transcript_path: PRIVATE_TRANSCRIPT, stop_hook_active: false, agent_id: HELPER_ID, agent_type: HELPER_TYPE, agent_transcript_path: HELPER_TRANSCRIPT, last_assistant_message: `${HELPER_PROMPT}. ${HELPER_DESC}`, background_tasks: [], session_crons: [] }),
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
    // Codex CLI 0.154.0 (schemas `subagent-start.command.input` / `subagent-stop.command.input`): `session_id` is the
    // parent session, `agent_id` the helper; `prompt` and `description` are planted.
    SubagentStart: snake("SubagentStart", { transcript_path: PRIVATE_TRANSCRIPT, model: "gpt-5.3-codex", turn_id: "u1", agent_id: HELPER_ID, agent_type: HELPER_TYPE, prompt: HELPER_PROMPT, description: HELPER_DESC }),
    SubagentStop: snake("SubagentStop", { transcript_path: PRIVATE_TRANSCRIPT, model: "gpt-5.3-codex", turn_id: "u1", agent_id: HELPER_ID, agent_type: HELPER_TYPE, agent_transcript_path: HELPER_TRANSCRIPT, stop_hook_active: false, last_assistant_message: `${HELPER_PROMPT}. ${HELPER_DESC}` }),
  },
};

/** Each tool's sub-agent start and stop payloads (fixture keys equal the hook event names). */
export const HELPER_EVENTS: Record<OfficeAgent, { start: string; stop: string }> = {
  copilot: { start: "subagentStart", stop: "subagentStop" },
  claude: { start: "SubagentStart", stop: "SubagentStop" },
  codex: { start: "SubagentStart", stop: "SubagentStop" },
};

/** The hook event name each fixture is delivered under (a fixture key may carry a suffix such as `Edit` or `Ci`). */
export function eventOf(agent: OfficeAgent, key: string): string {
  const names: Record<OfficeAgent, readonly string[]> = {
    copilot: ["sessionStart", "userPromptSubmitted", "preToolUse", "postToolUseFailure", "postToolUse", "permissionRequest", "notification", "agentStop", "errorOccurred", "sessionEnd", "subagentStart", "subagentStop"],
    claude: ["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUseFailure", "PostToolUse", "PermissionRequest", "Notification", "StopFailure", "Stop", "SessionEnd", "SubagentStart", "SubagentStop"],
    codex: ["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "PermissionRequest", "Stop", "SessionEnd", "SubagentStart", "SubagentStop"],
  };
  const name = names[agent].find((n) => key.startsWith(n));
  if (!name) throw new Error(`no event for ${agent} ${key}`);
  return name;
}
