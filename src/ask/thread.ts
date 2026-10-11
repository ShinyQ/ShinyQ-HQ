/**
 * The visible Ask the HQ chat thread, kept in `sessionStorage` only (cleared when the tab closes,
 * never sent anywhere). The server still answers every question on its own: there is no
 * multi-turn context. Pure apart from the storage calls, which tolerate a missing or full store.
 */
import type { AskClientError } from "./client";
import { cleanTags, type AskOutcome, type AskTag } from "./protocol";

export const THREAD_KEY = "hq:ask-thread";
/** Messages kept (user, answer and system lines together). */
export const THREAD_MAX = 20;

export type ThreadRole = "user" | "assistant" | "system";

export interface ThreadMessage {
  id: string;
  role: ThreadRole;
  /** Plain text. Render it only as a React text child, never as HTML (threat T6). */
  text: string;
  /** Curated suggestion id when the question came from (or matches) a pill. */
  qid?: string;
  outcome?: AskOutcome;
  asOf?: string;
  tags?: AskTag[];
  error?: AskClientError;
  retryAfter?: number;
}

const ROLES: readonly ThreadRole[] = ["user", "assistant", "system"];
const OUTCOMES: readonly AskOutcome[] = ["answer", "unknown", "decline", "fallback"];
const ERRORS: readonly AskClientError[] = ["bad_request", "forbidden", "turnstile", "rate_limited", "disabled", "paused", "network", "stream", "aborted", "unavailable"];

/** Drops anything malformed (the store is user-editable), keeping only known fields. */
export function parseThread(raw: unknown): ThreadMessage[] {
  if (!Array.isArray(raw)) return [];
  const out: ThreadMessage[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const v = item as Record<string, unknown>;
    if (typeof v.id !== "string" || typeof v.text !== "string" || !ROLES.includes(v.role as ThreadRole)) continue;
    const message: ThreadMessage = { id: v.id.slice(0, 40), role: v.role as ThreadRole, text: v.text.slice(0, 4000) };
    if (typeof v.qid === "string") message.qid = v.qid.slice(0, 60);
    if (OUTCOMES.includes(v.outcome as AskOutcome)) message.outcome = v.outcome as AskOutcome;
    if (typeof v.asOf === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.asOf)) message.asOf = v.asOf;
    const tags = cleanTags(v.tags);
    if (tags.length) message.tags = tags;
    if (ERRORS.includes(v.error as AskClientError)) message.error = v.error as AskClientError;
    if (typeof v.retryAfter === "number" && Number.isFinite(v.retryAfter)) message.retryAfter = v.retryAfter;
    out.push(message);
  }
  return out.slice(-THREAD_MAX);
}

/** The last `THREAD_MAX` messages, never starting with an orphan answer. */
export function capThread(messages: readonly ThreadMessage[]): ThreadMessage[] {
  const kept = messages.slice(-THREAD_MAX);
  while (kept.length && kept[0].role !== "user") kept.shift();
  return kept;
}

export function loadThread(storage: Pick<Storage, "getItem"> | undefined = safeSession()): ThreadMessage[] {
  try {
    const raw = storage?.getItem(THREAD_KEY);
    return raw ? capThread(parseThread(JSON.parse(raw))) : [];
  } catch {
    return [];
  }
}

export function saveThread(messages: readonly ThreadMessage[], storage: Pick<Storage, "setItem" | "removeItem"> | undefined = safeSession()) {
  try {
    if (messages.length === 0) storage?.removeItem(THREAD_KEY);
    else storage?.setItem(THREAD_KEY, JSON.stringify(capThread(messages)));
  } catch {
    // Storage can be unavailable or full; the thread then lasts for this page only.
  }
}

function safeSession(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.sessionStorage;
  } catch {
    return undefined;
  }
}

let counter = 0;
/** Short unique id for a message (React keys). */
export const messageId = () => `m${Date.now().toString(36)}${(counter++).toString(36)}`;
