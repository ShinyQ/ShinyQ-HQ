/**
 * The visible Ask the HQ chat thread, kept in `sessionStorage` only (cleared when the tab closes).
 * Multi-turn memory (owner decision 2026-10-17): each question also carries the last
 * `ASK_HISTORY_TURNS` signed turns (`historyFor`); the server verifies every signature and uses only
 * those turns. Nothing else of the thread leaves the browser. Pure apart from the storage calls,
 * which tolerate a missing or full store.
 */
import { cleanQuestion, type AskClientError } from "./client";
import { ASK_HISTORY_ANSWER_MAX, ASK_HISTORY_TURNS, ASK_MAX_QUESTION, cleanTags, isAskCite, isAskContact, isAskSig, type AskContact, type AskLocale, type AskOutcome, type AskTag, type AskTurn } from "./protocol";

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
  /** Allowlisted Page View path of the cited written source (`isAskCite`); rendered as a link built by the client. */
  cite?: string;
  /** Contact card of a lead-intent answer (`isAskContact`, dataset values from the `done` frame). */
  contact?: AskContact;
  error?: AskClientError;
  retryAfter?: number;
  /** Server signature of this answer (`done` frame), sent back as history with the next question. */
  sig?: string;
  /** Panel locale the answer was signed for; history only goes back in the same locale. */
  sigLocale?: AskLocale;
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
    if (isAskCite(v.cite)) message.cite = v.cite;
    if (isAskContact(v.contact)) message.contact = { email: v.contact.email, linkedin: v.contact.linkedin };
    if (ERRORS.includes(v.error as AskClientError)) message.error = v.error as AskClientError;
    if (typeof v.retryAfter === "number" && Number.isFinite(v.retryAfter)) message.retryAfter = v.retryAfter;
    if (isAskSig(v.sig)) message.sig = v.sig;
    if (v.sigLocale === "en" || v.sigLocale === "id") message.sigLocale = v.sigLocale;
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

/**
 * The signed turns to send with the next question: each answer that has a signature for `locale`
 * and directly follows its question, the question cleaned exactly as `askQuestion` sends it (the
 * server signed that text). Answers over `ASK_HISTORY_ANSWER_MAX` are skipped. The last
 * `ASK_HISTORY_TURNS`, oldest first.
 */
export function historyFor(messages: readonly ThreadMessage[], locale: AskLocale): AskTurn[] {
  const turns: AskTurn[] = [];
  for (let i = 1; i < messages.length; i++) {
    const user = messages[i - 1];
    const answer = messages[i];
    if (user.role !== "user" || answer.role !== "assistant" || !answer.sig || answer.sigLocale !== locale) continue;
    if (answer.text.length > ASK_HISTORY_ANSWER_MAX) continue;
    const q = cleanQuestion(user.text, ASK_MAX_QUESTION);
    if (q) turns.push({ q, a: answer.text, sig: answer.sig });
  }
  return turns.slice(-ASK_HISTORY_TURNS);
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
