/**
 * Wire contract between the browser and the Ask the HQ Pages Function (`functions/api/ask.ts`).
 * Types only: imported by the client (`src/ask/client.ts`) and the Function, so both sides agree.
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

/** `POST /api/ask` body (Content-Type: application/json, same origin only). */
export interface AskRequest {
  q: string;
  locale: AskLocale;
  /** Required unless a valid `hq_ask` session cookie (30 min) is present. */
  turnstileToken?: string;
}

/**
 * What the visitor gets:
 * - answer: grounded answer
 * - unknown: "I don't have that information on this site"
 * - decline: off-topic, harmful or rule-breaking request
 * - fallback: the models failed, an output check fired, or the service is paused
 */
export type AskOutcome = "answer" | "unknown" | "decline" | "fallback";

/** Which model produced the text: primary Gemma, fallback Mistral, the KV cache, or none (canned text). */
export type AskSource = "primary" | "fallback" | "cache" | "none";

/** One SSE `data:` frame of a 200 `text/event-stream` response. Frames are JSON, never raw text. */
export type AskFrame =
  | { delta: string }
  | { done: true; outcome: AskOutcome; source: AskSource; asOf: string };

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
