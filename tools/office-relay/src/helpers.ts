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
 * `agent_id` on both events. Copilot's `subagentStart` names no helper (an `agentId` there names the agent that fired
 * the hook), so Copilot helpers are anonymous: every start counts and every stop ends the oldest.
 */
export function helperId(agent: OfficeAgent, p: Record<string, unknown>): string | null {
  return agent === "copilot" ? null : str(p.agent_id);
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
  if (idHash) {
    delete ids[idHash];
  } else {
    const oldest = entries[0];
    if (oldest) delete ids[oldest[0]];
  }
  return { ids };
}

/** Live helpers, capped at OFFICE_HELPERS_MAX. */
export function helperCount(s: HelperState, now: number): number {
  return Math.min(OFFICE_HELPERS_MAX, live(s.ids, now).length);
}
