import { randomBytes } from "node:crypto";
import { OFFICE_AGENTS, parseOfficeBeat, type OfficeAgent, type OfficeBeatV1 } from "../../../src/lib/office/protocol";
import { buildBeat, COALESCE_MS, decide, dueOf, KEEPALIVE_MS, repeatBeat, sentRecord, type PendingBeat, type Sent } from "./beat";
import type { GitInfo } from "./git";
import { applyHelper, copilotHelperOf, hashHelper, helperCount, helperEvent, helperId, parentSession } from "./helpers";
import { isPermissionCheck, mapEvent, payloadCwd, rawSessionId, toolName, type Mapped } from "./map";
import { sessionHash } from "./session";
import { appendLog, clearHelpers, isPaused, loadConfig, loadSalt, readHelpers, readLastTool, readSent, withHelpersLock, withSessionLock, writeHelpers, writeLastTool, writeSent, type RelayPaths } from "./store";

export interface HookDeps {
  paths: RelayPaths;
  now: () => number;
  readGit: (cwd: string) => GitInfo | null;
  /** Hands the signed-later body to the detached sender (cli.ts) or a test. */
  dispatch: (body: string) => void;
  /** Starts the session's detached trailing sender, which runs `flushSession` with `token` at `due` (cli.ts) or a test. */
  schedule: (session: string, due: number, token: string) => void;
  /** The coalescing window, COALESCE_MS unless a test (or OFFICE_RELAY_COALESCE_MS) sets it. */
  coalesceMs?: number;
  /** How long a hook waits for a session lock, LOCK_BUDGET_MS unless a test (or OFFICE_RELAY_LOCK_MS) sets it. */
  lockBudgetMs?: number;
}

const isAgent = (x: string): x is OfficeAgent => (OFFICE_AGENTS as readonly string[]).includes(x);

type Outcome = "sent" | "queued" | "skipped" | "paused" | "ignored";

/** A session's desk before any beat of its own (a helper started first): the main agent is busy. */
const BUSY: Mapped = { state: "working", activity: "editing" };

/** A trailing sender still this long past its wake time is gone (it died, or the Mac slept); the next hook starts another. */
export const DUE_GRACE_MS = 5_000;

/** A trailing send for an event older than this is dropped (the sender woke late, after the Mac slept): it would show a stale desk. */
export const FLUSH_STALE_MS = 60_000;

const owned = (rec: Sent | null, now: number): rec is Sent & { due: number; dueBy: string } => rec?.due !== undefined && rec.dueBy !== undefined && now <= rec.due + DUE_GRACE_MS;

/**
 * The throttle (`decide` in beat.ts), under the session lock: a beat goes out now (dispatched first, so a failed spawn
 * throws before it is recorded as sent and the next event retries it), waits for the trailing send, or is skipped. A
 * session has at most one trailing sender: a new one starts only when none would wake by the time this beat needs it.
 */
function offer(deps: HookDeps, session: string, beat: OfficeBeatV1, label: string): Outcome {
  const { paths } = deps;
  const window = deps.coalesceMs ?? COALESCE_MS;
  return withSessionLock(paths, session, () => {
    const prev = readSent(paths, session);
    const plan = decide(prev, beat, window);
    if (plan === "send" || !prev) {
      deps.dispatch(JSON.stringify(beat));
      writeSent(paths, session, { ...sentRecord(beat), ...(owned(prev, beat.ts) ? { due: prev.due, dueBy: prev.dueBy } : {}) });
      appendLog(paths, `${label} sent`);
      return "sent";
    }
    const pending: Partial<OfficeBeatV1> = { ...beat };
    delete pending.ts;
    const rec: Sent = { ...prev, next: plan === "queue" ? (pending as PendingBeat) : undefined, seenAt: beat.ts };
    const due = dueOf(rec, window);
    if (due !== undefined && !(owned(prev, beat.ts) && prev.due <= due)) {
      const token = randomBytes(8).toString("hex");
      deps.schedule(session, due, token);
      rec.due = due;
      rec.dueBy = token;
    }
    writeSent(paths, session, rec);
    const outcome = plan === "queue" ? "queued" : "skipped";
    appendLog(paths, `${label} ${outcome}`);
    return outcome;
  }, deps.lockBudgetMs);
}

/**
 * The trailing sender's step at `now`: the queued change once its window has passed, else the keepalive of an awake
 * session that had events since its last beat. Only the sender holding the session's token acts. Returns the body to
 * post (already recorded as sent) and when to wake next (nothing left to send: no `due`, and the token is released).
 */
export function flushSession(paths: RelayPaths, session: string, token: string, now: number, coalesceMs: number = COALESCE_MS): { body?: string; due?: number } {
  if (isPaused(paths)) return {};
  return withSessionLock(paths, session, () => {
    const rec = readSent(paths, session);
    if (!rec || rec.dueBy !== token) return {};
    const stale = now - (rec.seenAt ?? rec.sentAt) > FLUSH_STALE_MS;
    const beat = rec.next ? (now >= rec.sentAt + coalesceMs ? { ...rec.next, ts: now } : null) : dueOf(rec, coalesceMs) !== undefined && now >= rec.sentAt + KEEPALIVE_MS ? repeatBeat(rec, session, now) : null;
    let after: Sent = rec;
    let body: string | undefined;
    if (beat && stale) {
      after = { ...rec, next: undefined, seenAt: rec.sentAt };
      appendLog(paths, "flush stale dropped");
    } else if (beat && parseOfficeBeat(beat)) {
      body = JSON.stringify(beat);
      after = sentRecord(beat);
      appendLog(paths, `flush ${beat.state} ${rec.next ? "trailing" : "keepalive"} sent`);
    } else if (beat) {
      after = { ...rec, next: undefined };
    }
    const due = dueOf(after, coalesceMs);
    const rest: Sent = { ...after };
    delete rest.due;
    delete rest.dueBy;
    writeSent(paths, session, due === undefined ? rest : { ...rest, due, dueBy: token });
    return { body, due };
  });
}

/**
 * A sub-agent start or stop: only the number of live helpers of the parent session leaves the machine (no name, type,
 * prompt, id or path). The beat repeats the session's newest state; it is offered only when the count changes. With
 * `needsDesk`, a parent that has sent no beat yet is left alone (a nested helper's parent is a helper, not a desk).
 */
function runHelper(agent: OfficeAgent, event: string, kind: "start" | "stop", parent: string | null, id: string | null, payload: Record<string, unknown>, deps: HookDeps, now: number, needsDesk = false): Outcome {
  const { paths } = deps;
  if (!parent) {
    appendLog(paths, `${agent} ${event} no-parent ignored`);
    return "ignored";
  }
  const salt = loadSalt(paths);
  const session = sessionHash(agent, parent, salt);
  if (needsDesk && !readSent(paths, session)) {
    appendLog(paths, `${agent} ${event} ignored`);
    return "ignored";
  }
  // Read, apply, write and offer under one lock: two helpers stopping at once both count. The time is read again under
  // the lock, so beats leave in lock order: a hook that read the clock first but waited for the lock would otherwise
  // date its beat before the one just sent, and the throttle would queue it instead of sending it.
  return withHelpersLock(paths, session, () => {
    const at = Math.max(now, deps.now());
    const state = applyHelper(readHelpers(paths, session), kind, id ? hashHelper(id, salt) : null, at);
    writeHelpers(paths, session, state);
    const helpers = helperCount(state, at);
    // The session's newest state: a change that waits for its trailing send, else the last sent beat.
    const sent = readSent(paths, session);
    const latest = sent?.next ?? sent;
    if ((latest?.helpers ?? 0) === helpers) {
      appendLog(paths, `${agent} ${event} helpers ${helpers} skipped`);
      return "skipped";
    }
    const cwd = payloadCwd(payload);
    const mapped = latest ? { state: latest.state, activity: latest.activity } : BUSY;
    const beat = buildBeat({ agent, session, mapped, git: cwd ? deps.readGit(cwd) : null, allow: loadConfig(paths).allow, now: at, helpers });
    if (!parseOfficeBeat(beat)) {
      appendLog(paths, `${agent} ${event} invalid`);
      return "ignored";
    }
    return offer(deps, session, beat, `${agent} ${event} helpers ${helpers}`);
  }, deps.lockBudgetMs);
}

/**
 * Copilot reports a helper's own events under the helper's own session id, with `agentId` (camelCase hooks) or
 * `agent_id` set ("hooks that fire inside a subagent include extra fields"); they would open a desk of their own.
 */
const insideCopilotHelper = (p: Record<string, unknown>) => [p.agentId, p.agent_id].some((x) => typeof x === "string" && x.length > 0);

/**
 * An event from inside a Copilot helper counts that helper on its parent's desk (`parentAgentId`), and the helper's
 * `agentStop` ends it. Copilot loads hooks when a session starts, so a session that began before `subagentStart` was
 * installed never fires it; its helpers still count this way. Never a desk of its own, never a state change.
 */
function runCopilotHelperEvent(event: string, payload: Record<string, unknown>, deps: HookDeps, now: number): Outcome {
  const inner = copilotHelperOf(payload);
  const label = `${event} helper-event`;
  if (!inner) {
    appendLog(deps.paths, `copilot ${label} ignored`);
    return "ignored";
  }
  return runHelper("copilot", label, event.toLowerCase() === "agentstop" ? "stop" : "start", inner.parent, inner.id, payload, deps, now, true);
}

/**
 * The hook path: local work only (map, git files, hash, throttle), then `dispatch` or `schedule`. Throws nothing the caller must
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
  if (helper) return runHelper(agent, safeEvent, helper, parentSession(agent, payload), helperId(agent, payload), payload, deps, now);
  // A helper counts once, as a drone on its parent's desk, never as its own desk.
  if (agent === "copilot" && insideCopilotHelper(payload)) return runCopilotHelperEvent(safeEvent, payload, deps, now);
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
  return offer(deps, session, beat, `${agent} ${safeEvent} ${beat.state}`);
}
