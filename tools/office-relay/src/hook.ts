import { OFFICE_AGENTS, parseOfficeBeat, type OfficeAgent } from "../../../src/lib/office/protocol";
import { buildBeat, shouldSend } from "./beat";
import type { GitInfo } from "./git";
import { isPermissionCheck, mapEvent, payloadCwd, rawSessionId, toolName } from "./map";
import { sessionHash } from "./session";
import { appendLog, isPaused, loadConfig, loadSalt, readLastTool, readSent, writeLastTool, writeSent, type RelayPaths } from "./store";

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
  const now = deps.now();
  const sessionOf = () => sessionHash(agent, rawSessionId(payload) ?? `${payloadCwd(payload) ?? "unknown"}`, loadSalt(paths));
  // Copilot's permissionRequest right after the preToolUse of the same tool is a permission check, not a prompt (map.ts).
  const copilotEvent = agent === "copilot" ? safeEvent.toLowerCase() : "";
  if (copilotEvent === "pretooluse") writeLastTool(paths, sessionOf(), { tool: toolName(payload).slice(0, 120), at: now });
  if (copilotEvent === "permissionrequest" && isPermissionCheck(readLastTool(paths, sessionOf()), toolName(payload).slice(0, 120), now)) {
    appendLog(paths, `${agent} ${safeEvent} after-tool ignored`);
    return "ignored";
  }
  const mapped = mapEvent(agent, safeEvent, payload);
  if (!mapped) {
    appendLog(paths, `${agent} ${safeEvent} ignored`);
    return "ignored";
  }
  const session = sessionOf();
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
  // Dispatch first: a failed spawn throws before the beat is recorded as sent, so the next event retries it.
  deps.dispatch(JSON.stringify(beat));
  writeSent(paths, session, { state: beat.state, activity: beat.activity, repo: beat.repo, title: beat.title, sentAt: now });
  appendLog(paths, `${agent} ${safeEvent} ${beat.state} sent`);
  return "sent";
}
