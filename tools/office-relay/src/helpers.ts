import { createHmac } from "node:crypto";
import { OFFICE_HELPERS_MAX, type OfficeAgent } from "../../../src/lib/office/protocol";
import { rawSessionId } from "./map";

/** A helper (sub-agent) with no stop event for this long is dropped. */
export const HELPER_TTL_MS = 30 * 60_000;

/** At most this many ids are kept per session (a runaway tool cannot grow the file). */
const MAX_IDS = 64;

export interface HelperState {
  /** Salted hash of the helper id (or a synthetic key for a tool that names none) to its latest start time. */
  ids: Record<string, number>;
}

/**
 * Whether an event starts or stops a helper. Copilot CLI sends `subagentStart` / `subagentStop`, Claude Code and Codex
 * `SubagentStart` / `SubagentStop`; names are compared case-insensitively, like `mapEvent`.
 */
export function helperEvent(_agent: OfficeAgent, event: string): "start" | "stop" | null {
  const e = event.toLowerCase();
  if (e === "subagentstart") return "start";
  if (e === "subagentstop") return "stop";
  return null;
}

const str = (x: unknown): string | null => (typeof x === "string" && x.length > 0 && x.length <= 200 ? x : null);

/**
 * The tool's own id for the helper (never sent; only its salted hash is stored locally). Claude Code and Codex send
 * `agent_id` on both events. Copilot CLI 1.0.99 sends the same `agentId` on `subagentStart` and `subagentStop` (it is
 * also the helper's own `sessionId`); a build that omits it on the start counts that helper anonymously.
 */
export function helperId(agent: OfficeAgent, p: Record<string, unknown>): string | null {
  return agent === "copilot" ? (str(p.agentId) ?? str(p.agent_id)) : str(p.agent_id);
}

/**
 * A Copilot event fired inside a helper names the helper (`agentId`) and its parent session (`parentAgentId`, the
 * parent's `sessionId`). Null when either is missing, or for a helper that names itself as its own parent.
 */
export function copilotHelperOf(p: Record<string, unknown>): { parent: string; id: string } | null {
  const id = str(p.agentId) ?? str(p.agent_id);
  const parent = str(p.parentAgentId) ?? str(p.parent_agent_id);
  return id && parent && id !== parent ? { parent, id } : null;
}

/** The raw id of the session that runs the helper: every tool's sub-agent hooks carry the parent's session id. */
export function parentSession(_agent: OfficeAgent, p: Record<string, unknown>): string | null {
  return rawSessionId(p);
}

export const hashHelper = (id: string, salt: string): string => createHmac("sha256", salt).update(`helper:${id}`).digest("hex").slice(0, 32);

const live = (ids: Record<string, number>, now: number) => Object.entries(ids).filter(([, at]) => now - at < HELPER_TTL_MS);

export function applyHelper(s: HelperState, kind: "start" | "stop", idHash: string | null, now: number): HelperState {
  const entries = live(s.ids, now).sort((a, b) => a[1] - b[1]);
  const ids: Record<string, number> = Object.fromEntries(entries);
  if (kind === "start") {
    let key = idHash;
    for (let n = 0; key === null; n++) if (!(`anon:${now}:${n}` in ids)) key = `anon:${now}:${n}`;
    delete ids[key];
    ids[key] = now;
    const keys = Object.keys(ids);
    for (const old of keys.slice(0, Math.max(0, keys.length - MAX_IDS))) delete ids[old];
    return { ids };
  }
  // A stop that names no helper ends the oldest one; one that names a helper never seen ends the oldest anonymous
  // one (a Copilot build whose start omits `agentId`), else nothing (an internal agent, or a helper already ended).
  const oldest = idHash === null ? entries[0] : idHash in ids ? ([idHash, 0] as const) : entries.find(([k]) => k.startsWith("anon:"));
  if (oldest) delete ids[oldest[0]];
  return { ids };
}

/** Live helpers, capped at OFFICE_HELPERS_MAX. */
export function helperCount(s: HelperState, now: number): number {
  return Math.min(OFFICE_HELPERS_MAX, live(s.ids, now).length);
}
