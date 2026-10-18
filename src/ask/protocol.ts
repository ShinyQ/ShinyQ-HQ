/**
 * Wire contract between the browser and the Ask the HQ Pages Function (`functions/api/ask.ts`).
 * Types and tiny dependency-free validators: imported by the client (`src/ask/client.ts`) and the
 * Function, so both sides agree.
 * Design: docs/superpowers/specs/2026-10-11-ask-hq-design.md.
 */

export type AskLocale = "en" | "id";

/** Max question length in characters (after normalization). */
export const ASK_MAX_QUESTION = 300;

/** `GET /api/ask`: feature status. 503 (or 404 when Functions are absent, e.g. local static serve) means hidden. */
export interface AskStatus {
  enabled: boolean;
  /** Public Turnstile site key, or null when Turnstile is not configured (local dev, tests). */
  turnstileSiteKey: string | null;
  /** Date the knowledge pack is accurate as of (YYYY-MM-DD). */
  asOf: string;
  maxLength: number;
}

/**
 * Which UI entry point sent a question (analytics only, never the question text): the home hero bar,
 * the dock's own input, a topic question pill, a follow-up pill, the Rover Terminal or Cmd-K.
 */
export const ASK_ENTRIES = ["hero", "dock", "pill", "followup", "terminal", "palette"] as const;
export type AskEntry = (typeof ASK_ENTRIES)[number];

export const isAskEntry = (value: unknown): value is AskEntry => typeof value === "string" && (ASK_ENTRIES as readonly string[]).includes(value);

/**
 * Topic tags of the knowledge chunks an answer was retrieved from (the `done` frame), used by the
 * client to pick follow-up questions. Allowlisted values only: never raw chunk text or ids.
 */
export const ASK_TAGS = [
  "work",
  "software",
  "ai",
  "career",
  "now",
  "contact",
  "education",
  "certifications",
  "awards",
  "skills",
  "stats",
  "writing",
  "research",
  "talks",
  "github",
  "voice",
  "fraud",
  "documents",
  "agents",
  "rag",
  "security",
  "data",
  "perspectives",
] as const;
export type AskTag = (typeof ASK_TAGS)[number];

/** At most this many tags per answer. */
export const ASK_MAX_TAGS = 8;

export const isAskTag = (value: unknown): value is AskTag => typeof value === "string" && (ASK_TAGS as readonly string[]).includes(value);

/** Keeps known tags only, deduplicated, in order, capped at `ASK_MAX_TAGS`. */
export function cleanTags(value: unknown): AskTag[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(isAskTag))].slice(0, ASK_MAX_TAGS);
}

/**
 * Page View paths an answer may cite (the `done` frame `cite`, spec section 13): How I work on
 * About, a hosted post, a project case study (the backing source of a perspective), the Library or
 * the How this site was built page (`/build`).
 * Perspectives themselves have no page (owner decision 2026-10-14: chatbot knowledge only).
 * The site's own public repository (`ASK_REPO_CITE`, owner request 2026-10-15) stays accepted as the
 * one external cite, so an older cached answer still renders; answers about how this site was built
 * now cite `/build` (the page links the repository). Anything else is dropped by both ends.
 */
export const ASK_CITE_PATTERN = /^\/(?:contact#how|(?:blog|labs)\/[a-z0-9]+(?:-[a-z0-9]+)*|library|build)$/;
/** The public ShinyQ HQ repository (`REPO_URL` in src/lib/site.ts). */
export const ASK_REPO_CITE = "https://github.com/ShinyQ/ShinyQ-HQ";

export type AskCiteKind = "how" | "blog" | "project" | "library" | "build" | "repo";

export const isAskCite = (value: unknown): value is string =>
  typeof value === "string" && value.length <= 120 && (value === ASK_REPO_CITE || ASK_CITE_PATTERN.test(value));

export function citeKind(path: string): AskCiteKind {
  if (path === ASK_REPO_CITE) return "repo";
  if (path === "/contact#how") return "how";
  if (path.startsWith("/blog/")) return "blog";
  if (path.startsWith("/labs/")) return "project";
  if (path === "/build") return "build";
  return "library";
}

/**
 * Contact details the dock shows as a card under a lead-intent answer (owner request 2026-10-15): a
 * visitor described their own project or need. Built from the dataset (`roof.contact`) into the
 * knowledge pack, sent in the `done` frame, never taken from the model's text. Both ends validate.
 */
export interface AskContact {
  email: string;
  linkedin: string;
}

const EMAIL = /^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,180}\.[A-Za-z]{2,24}$/;

/** True for a plain email address and an https LinkedIn profile URL (`/in/<handle>`). */
export function isAskContact(value: unknown): value is AskContact {
  if (!value || typeof value !== "object") return false;
  const { email, linkedin } = value as Record<string, unknown>;
  if (typeof email !== "string" || !EMAIL.test(email) || typeof linkedin !== "string" || linkedin.length > 200) return false;
  try {
    const url = new URL(linkedin);
    return url.protocol === "https:" && (url.hostname === "www.linkedin.com" || url.hostname === "linkedin.com") && /^\/in\/[A-Za-z0-9_-]+\/?$/.test(url.pathname) && !url.search && !url.hash;
  } catch {
    return false;
  }
}

/**
 * Multi-turn memory (owner decision 2026-10-17): the client sends up to `ASK_HISTORY_TURNS` earlier
 * turns, oldest first. Each answer carries the server's signature from its `done` frame (HMAC over the
 * panel locale, pack version, question and answer), so a visitor cannot forge an assistant turn; the
 * server drops any turn that fails verification.
 */
export const ASK_HISTORY_TURNS = 3;
/** Longest answer a history turn may carry (the server caps answers at 1000 characters). */
export const ASK_HISTORY_ANSWER_MAX = 1000;

export interface AskTurn {
  q: string;
  a: string;
  sig: string;
}

/** An HMAC-SHA256 signature in base64url without padding. */
export const isAskSig = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);

/** `POST /api/ask` body (Content-Type: application/json, same origin only). */
export interface AskRequest {
  q: string;
  locale: AskLocale;
  /** Required unless a valid `hq_ask` session cookie (30 min) is present. */
  turnstileToken?: string;
  /** Entry point, for analytics. Unknown values are ignored. */
  source?: AskEntry;
  /** Curated question id (content/ask/suggestions.json) when the text is that chip's, for the public stats. At most 64 characters. */
  chip?: string;
  /** Earlier signed turns of this conversation, oldest first, at most `ASK_HISTORY_TURNS`. */
  history?: AskTurn[];
}

/**
 * What the visitor gets:
 * - answer: grounded answer
 * - unknown: "I don't have that information on this site"
 * - decline: off-topic, harmful or rule-breaking request
 * - fallback: the models failed, an output check fired, or the service is paused
 */
export type AskOutcome = "answer" | "unknown" | "decline" | "fallback";

/** Which tier produced the text: primary Gemma, fallback Mistral (Workers AI), backup (a Groq model), the KV cache, or none (canned text). */
export type AskSource = "primary" | "fallback" | "backup" | "cache" | "none";

/** One SSE `data:` frame of a 200 `text/event-stream` response. Frames are JSON, never raw text. */
export type AskFrame =
  | { delta: string }
  | { done: true; outcome: AskOutcome; source: AskSource; asOf: string; tags?: AskTag[]; cite?: string; contact?: AskContact; sig?: string };

/** Error bodies (JSON) for non-200 responses. */
export type AskErrorCode =
  | "bad_request" // 400, 413, 415
  | "forbidden" // 403: Origin not allowed
  | "turnstile" // 403: token missing or invalid; get a token and retry once
  | "rate_limited" // 429, with retryAfter seconds
  | "disabled" // 503: kill switch
  | "paused"; // 503: circuit breaker or global daily cap

export interface AskError {
  error: AskErrorCode;
  retryAfter?: number;
}
