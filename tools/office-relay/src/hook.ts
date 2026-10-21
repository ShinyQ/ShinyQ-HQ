import { OFFICE_AGENTS, parseOfficeBeat, type OfficeAgent, type OfficeBeatV1 } from "../../../src/lib/office/protocol";
import { buildBeat, shouldSend, type Sent } from "./beat";
import type { GitInfo } from "./git";
import { applyHelper, hashHelper, helperCount, helperEvent, helperId, parentSession } from "./helpers";
import { isPermissionCheck, mapEvent, payloadCwd, rawSessionId, toolName, type Mapped } from "./map";
import { sessionHash } from "./session";
import { appendLog, clearHelpers, isPaused, loadConfig, loadSalt, readHelpers, readLastTool, readSent, withHelpersLock, writeHelpers, writeLastTool, writeSent, type RelayPaths } from "./store";

export interface HookDeps {
  paths: RelayPaths;
  now: () => number;
  readGit: (cwd: string) => GitInfo | null;
  /** Hands the signed-later body to the detached sender (cli.ts) or a test. */
  dispatch: (body: string) => void;
}

const isAgent = (x: string): x is OfficeAgent => (OFFICE_AGENTS as readonly string[]).includes(x);

type Outcome = "sent" | "skipped" | "paused" | "ignored";

/** A session's desk before any beat of its own (a helper started first): the main agent is busy. */
const BUSY: Mapped = { state: "working", activity: "editing" };

/** Dispatches first (a failed spawn throws before the beat is recorded as sent, so the next event retries it), then records. */
function send(deps: HookDeps, session: string, beat: OfficeBeatV1, label: string): Outcome {
  deps.dispatch(JSON.stringify(beat));
  const sent: Sent = { state: beat.state, activity: beat.activity, repo: beat.repo, title: beat.title, helpers: beat.helpers, sentAt: beat.ts };
  writeSent(deps.paths, session, sent);
  appendLog(deps.paths, `${label} sent`);
  return "sent";
}

/**
 * A sub-agent start or stop: only the number of live helpers of the parent session leaves the machine (no name, type,
 * prompt, id or path). The beat repeats the session's last state; it is sent only when the count changes.
 */
function runHelper(agent: OfficeAgent, event: string, kind: "start" | "stop", payload: Record<string, unknown>, deps: HookDeps, now: number): Outcome {
  const { paths } = deps;
  const parent = parentSession(agent, payload);
  if (!parent) {
    appendLog(paths, `${agent} ${event} no-parent ignored`);
    return "ignored";
  }
  const salt = loadSalt(paths);
  const session = sessionHash(agent, parent, salt);
  const id = helperId(agent, payload);
  // Read, apply, write and send under one lock: two helpers stopping at once both count.
  return withHelpersLock(paths, session, () => {
    const state = applyHelper(readHelpers(paths, session), kind, id ? hashHelper(id, salt) : null, now);
    writeHelpers(paths, session, state);
    const helpers = helperCount(state, now);
    const prev = readSent(paths, session);
    if ((prev?.helpers ?? 0) === helpers) {
      appendLog(paths, `${agent} ${event} helpers ${helpers} skipped`);
      return "skipped";
    }
    const cwd = payloadCwd(payload);
    const mapped = prev ? { state: prev.state, activity: prev.activity } : BUSY;
    const beat = buildBeat({ agent, session, mapped, git: cwd ? deps.readGit(cwd) : null, allow: loadConfig(paths).allow, now, helpers });
    if (!parseOfficeBeat(beat)) {
      appendLog(paths, `${agent} ${event} invalid`);
      return "ignored";
    }
    return send(deps, session, beat, `${agent} ${event} helpers ${helpers}`);
  });
}

/**
 * Copilot reports a helper's own tool events under the helper's own session id, with `agentId` (camelCase hooks) or
 * `agent_id` set ("hooks that fire inside a subagent include extra fields"); they would open a desk of their own.
 */
const insideCopilotHelper = (p: Record<string, unknown>) => [p.agentId, p.agent_id].some((x) => typeof x === "string" && x.length > 0);

/**
 * The hook path: local work only (map, git files, hash, dedupe), then `dispatch`. Throws nothing the caller must
 * handle except file system errors, which cli.ts swallows; logs one line per event without any payload text.
 */
export function runHook(agent: string, event: string, stdin: string, deps: HookDeps): Outcome {
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
  const helper = helperEvent(agent, safeEvent);
  if (helper) return runHelper(agent, safeEvent, helper, payload, deps, now);
  // A helper counts once, as a drone on its parent's desk, never as its own desk.
  if (agent === "copilot" && insideCopilotHelper(payload)) {
    appendLog(paths, `${agent} ${safeEvent} helper-event ignored`);
    return "ignored";
  }
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
  const prev = readSent(paths, session);
  // The count rides along while the session has helpers, and once more as 0 so the office clears them. A session
  // that ends takes its helpers with it.
  const ended = safeEvent.toLowerCase() === "sessionend";
  if (ended) clearHelpers(paths, session);
  const live = ended ? 0 : helperCount(readHelpers(paths, session), now);
  const helpers = live > 0 || (prev?.helpers ?? 0) > 0 ? live : undefined;
  const beat = buildBeat({ agent, session, mapped, git: cwd ? deps.readGit(cwd) : null, allow: loadConfig(paths).allow, now, helpers });
  if (!parseOfficeBeat(beat)) {
    appendLog(paths, `${agent} ${safeEvent} invalid`);
    return "ignored";
  }
  if (!shouldSend(prev, beat, now)) {
    appendLog(paths, `${agent} ${safeEvent} ${beat.state} skipped`);
    return "skipped";
  }
  return send(deps, session, beat, `${agent} ${safeEvent} ${beat.state}`);
}
