/**
 * Browser client for Ask the HQ (`functions/api/ask.ts`). Framework-free and client-safe.
 * Nothing here runs on first paint: callers fetch the status only when an ask entry point is
 * opened, focused or scrolled into view, and Turnstile loads only when the server asks for it.
 * Design: docs/superpowers/specs/2026-10-11-ask-hq-design.md (sections 3, 7.3 T6, T8, T13).
 */
import { ASK_ENDPOINT, fetchAskStatus, isAskEnabled, resetAskStatus } from "./status";
import { cleanTags, isAskCite, type AskEntry, type AskError, type AskErrorCode, type AskFrame, type AskLocale, type AskOutcome, type AskRequest, type AskSource, type AskStatus, type AskTag } from "./protocol";

export const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";
export const TURNSTILE_SRC = `${TURNSTILE_ORIGIN}/turnstile/v0/api.js?render=explicit`;
/** The server cookie lasts 30 minutes; skip the token a little earlier than that. */
export const VERIFIED_MS = 25 * 60 * 1000;
const TURNSTILE_TIMEOUT_MS = 15_000;
const STREAM_TIMEOUT_MS = 30_000;
/** Client-side display cap; the server already caps answers at 300 tokens. */
export const MAX_ANSWER_CHARS = 4000;

export type FetchFn = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type AskClientError = AskErrorCode | "network" | "stream" | "aborted" | "unavailable";

export type AskResult =
  | { outcome: AskOutcome; source: AskSource; asOf: string; tags?: AskTag[]; cite?: string }
  | { error: AskClientError; retryAfter?: number };

export const isAskError = (result: AskResult): result is Extract<AskResult, { error: AskClientError }> => "error" in result;

/* ------------------------------------------------------------------ status */

// The status helpers live in ./status so the always-loaded entry points (dock launcher, hero bar,
// terminal) do not pull this module (Turnstile, SSE) into the first-load JavaScript.
export { ASK_ENDPOINT, fetchAskStatus, isAskEnabled, peekAskStatus } from "./status";

/* ------------------------------------------------------------- sanitizing */

// C0/C1 controls (except tab and newline), zero-width characters, bidi marks, embeddings, overrides and isolates.
const UNSAFE_CHARS = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F\u00AD\u061C\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g;

/** Defence in depth (T6): the server strips these too. Answers are still rendered as text only. */
export function sanitizeAnswer(text: string): string {
  return text.replace(/\r\n?/g, "\n").replace(UNSAFE_CHARS, "");
}

/** Trimmed, cleaned question, capped at `max` characters. */
export function cleanQuestion(text: string, max: number): string {
  return sanitizeAnswer(text).replace(/\s+/g, " ").trim().slice(0, max);
}

/* -------------------------------------------------------------------- SSE */

/**
 * Incremental `text/event-stream` parser. Chunks may split lines and events anywhere; every
 * complete event's `data:` lines are joined with "\n" and passed to `onData`. Comments and other
 * fields are ignored.
 */
export function createSseParser(onData: (data: string) => void) {
  let buffer = "";
  let data: string[] = [];
  const dispatch = () => {
    if (data.length) onData(data.join("\n"));
    data = [];
  };
  const line = (raw: string) => {
    if (raw === "") return dispatch();
    if (raw.startsWith(":")) return;
    const colon = raw.indexOf(":");
    const field = colon === -1 ? raw : raw.slice(0, colon);
    let value = colon === -1 ? "" : raw.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "data") data.push(value);
  };
  return {
    push(chunk: string) {
      buffer += chunk;
      let at: number;
      while ((at = buffer.search(/\r\n|\r|\n/)) !== -1) {
        // A lone "\r" at the end may be the first half of "\r\n": wait for the next chunk.
        if (buffer[at] === "\r" && at === buffer.length - 1) break;
        const size = buffer.startsWith("\r\n", at) ? 2 : 1;
        line(buffer.slice(0, at));
        buffer = buffer.slice(at + size);
      }
    },
    /** Flushes a final event that was not followed by a blank line. */
    end() {
      if (buffer) line(buffer.replace(/\r$/, ""));
      buffer = "";
      dispatch();
    },
  };
}

const OUTCOMES: readonly AskOutcome[] = ["answer", "unknown", "decline", "fallback"];
const SOURCES: readonly AskSource[] = ["primary", "fallback", "cache", "none"];

/** One `data:` payload to a frame, or null for anything unknown or malformed. */
export function parseFrame(data: string): AskFrame | null {
  let value: unknown;
  try {
    value = JSON.parse(data);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.delta === "string") return { delta: v.delta };
  if (v.done === true && OUTCOMES.includes(v.outcome as AskOutcome)) {
    const tags = cleanTags(v.tags);
    return {
      done: true,
      outcome: v.outcome as AskOutcome,
      source: SOURCES.includes(v.source as AskSource) ? (v.source as AskSource) : "none",
      asOf: typeof v.asOf === "string" ? v.asOf : "",
      ...(tags.length ? { tags } : {}),
      ...(isAskCite(v.cite) ? { cite: v.cite } : {}),
    };
  }
  return null;
}

/* -------------------------------------------------------------- Turnstile */

interface TurnstileOptions {
  sitekey: string;
  execution: "render" | "execute";
  appearance: "always" | "execute" | "interaction-only";
  callback: (token: string) => void;
  "error-callback"?: () => void;
  "timeout-callback"?: () => void;
  "expired-callback"?: () => void;
}

interface TurnstileApi {
  render(container: HTMLElement | string, options: TurnstileOptions): string | undefined;
  execute(widget: HTMLElement | string): void;
  reset(widget?: string): void;
}

type TurnstileWindow = Window & { turnstile?: TurnstileApi };

let scriptPromise: Promise<TurnstileApi> | null = null;
let widget: { id: string; siteKey: string } | null = null;
let pending: { resolve: (token: string) => void; reject: (error: Error) => void } | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  const win = window as TurnstileWindow;
  if (win.turnstile) return Promise.resolve(win.turnstile);
  scriptPromise ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = TURNSTILE_SRC;
    script.async = true;
    const timer = window.setTimeout(() => fail(new Error("turnstile load timeout")), TURNSTILE_TIMEOUT_MS);
    function fail(error: Error) {
      window.clearTimeout(timer);
      scriptPromise = null;
      script.remove();
      reject(error);
    }
    script.onload = () => {
      window.clearTimeout(timer);
      if (win.turnstile) resolve(win.turnstile);
      else fail(new Error("turnstile missing"));
    };
    script.onerror = () => fail(new Error("turnstile load failed"));
    document.head.append(script);
  });
  return scriptPromise;
}

/** Starts loading the Turnstile script once the ask UI opens, so the first question is not delayed. Never without a site key. */
export function prepareAsk(status: AskStatus | null | undefined) {
  if (typeof window === "undefined" || !isAskEnabled(status) || !status.turnstileSiteKey || isVerified()) return;
  void loadTurnstile().catch(() => {
    // askQuestion retries the load and reports the failure.
  });
}

function container(): HTMLElement {
  const existing = document.getElementById("hq-turnstile");
  if (existing) return existing;
  const node = document.createElement("div");
  node.id = "hq-turnstile";
  // Invisible unless Cloudflare needs an interaction (appearance: interaction-only), then it shows itself.
  node.style.cssText = "position:fixed;bottom:16px;left:50%;transform:translateX(-50%);z-index:70";
  document.body.append(node);
  return node;
}

/** A fresh, single-use Turnstile token from an invisible widget (`execution: "execute"`). */
export async function getTurnstileToken(siteKey: string, timeoutMs = TURNSTILE_TIMEOUT_MS): Promise<string> {
  const api = await loadTurnstile();
  pending?.reject(new Error("superseded"));
  return new Promise<string>((resolve, reject) => {
    const timer = window.setTimeout(() => settle.reject(new Error("turnstile timeout")), timeoutMs);
    const settle = {
      resolve: (token: string) => {
        window.clearTimeout(timer);
        if (pending === settle) pending = null;
        resolve(token);
      },
      reject: (error: Error) => {
        window.clearTimeout(timer);
        if (pending === settle) pending = null;
        reject(error);
      },
    };
    pending = settle;
    try {
      if (!widget || widget.siteKey !== siteKey) {
        const id = api.render(container(), {
          sitekey: siteKey,
          execution: "execute",
          appearance: "interaction-only",
          callback: (token) => pending?.resolve(token),
          "error-callback": () => pending?.reject(new Error("turnstile error")),
          "timeout-callback": () => pending?.reject(new Error("turnstile timeout")),
        });
        widget = { id: id ?? "", siteKey };
      } else {
        // Tokens are single use: reset before asking for another one.
        api.reset(widget.id);
      }
      api.execute(widget.id || container());
    } catch (error) {
      settle.reject(error instanceof Error ? error : new Error("turnstile failed"));
    }
  });
}

/* -------------------------------------------------------------------- ask */

let verifiedUntil = 0;
const isVerified = (now = Date.now()) => now < verifiedUntil;

export interface AskOptions {
  q: string;
  locale: AskLocale;
  signal?: AbortSignal;
  /** UI entry point, for analytics. */
  source?: AskEntry;
  /** Called with each sanitized text chunk, in order. */
  onDelta: (text: string) => void;
}

export interface AskDeps {
  fetch: FetchFn;
  getToken: (siteKey: string) => Promise<string>;
  now: () => number;
  status: () => Promise<AskStatus | null>;
}

const defaultDeps = (): AskDeps => ({
  fetch: (input, init) => fetch(input, init),
  getToken: (siteKey) => getTurnstileToken(siteKey),
  now: () => Date.now(),
  status: () => fetchAskStatus(),
});

async function readError(response: Response): Promise<AskError | null> {
  try {
    const body = (await response.json()) as Partial<AskError>;
    return typeof body?.error === "string" ? { error: body.error, retryAfter: typeof body.retryAfter === "number" ? body.retryAfter : undefined } : null;
  } catch {
    return null;
  }
}

function errorFor(status: number, body: AskError | null, response: Response): AskResult {
  if (status === 429) {
    const header = Number(response.headers.get("retry-after"));
    return { error: "rate_limited", retryAfter: body?.retryAfter ?? (Number.isFinite(header) && header > 0 ? header : undefined) };
  }
  if (status === 503) return { error: body?.error === "paused" ? "paused" : "disabled" };
  return { error: body?.error ?? "unavailable" };
}

/**
 * Asks one question. Gets a Turnstile token when the status has a site key and the session cookie
 * is not known to be valid, and retries once with a fresh token on `403 {error: "turnstile"}`.
 * Streams sanitized text to `onDelta` and resolves with the final frame or an error code.
 */
export async function askQuestion(options: AskOptions, overrides: Partial<AskDeps> = {}): Promise<AskResult> {
  const deps = { ...defaultDeps(), ...overrides };
  const { q, locale, signal, onDelta, source } = options;
  const status = await deps.status();
  if (!isAskEnabled(status)) return { error: "disabled" };
  const siteKey = status.turnstileSiteKey;
  const question = cleanQuestion(q, status.maxLength || 300);
  if (!question) return { error: "bad_request" };

  const token = async (): Promise<string | null> => {
    if (!siteKey) return null;
    try {
      return await deps.getToken(siteKey);
    } catch {
      return null;
    }
  };

  const post = (turnstileToken: string | null) => {
    const body: AskRequest = { q: question, locale, ...(turnstileToken ? { turnstileToken } : {}), ...(source ? { source } : {}) };
    return deps.fetch(ASK_ENDPOINT, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json", accept: "text/event-stream" },
      body: JSON.stringify(body),
      signal,
    });
  };

  let response: Response;
  try {
    response = await post(siteKey && !isVerified(deps.now()) ? await token() : null);
    if (response.status === 403) {
      const body = await readError(response);
      if (body?.error !== "turnstile") return { error: body?.error ?? "forbidden" };
      verifiedUntil = 0;
      const fresh = await token();
      if (!fresh) return { error: "turnstile" };
      response = await post(fresh);
    }
  } catch {
    return { error: signal?.aborted ? "aborted" : "network" };
  }

  if (!response.ok) {
    const body = await readError(response);
    return errorFor(response.status, body, response);
  }
  verifiedUntil = deps.now() + VERIFIED_MS;
  return readStream(response, onDelta, signal);
}

async function readStream(response: Response, onDelta: (text: string) => void, signal?: AbortSignal): Promise<AskResult> {
  let done: Extract<AskFrame, { done: true }> | null = null;
  let length = 0;
  const parser = createSseParser((data) => {
    if (done) return;
    const frame = parseFrame(data);
    if (!frame) return;
    if ("delta" in frame) {
      const text = sanitizeAnswer(frame.delta).slice(0, Math.max(0, MAX_ANSWER_CHARS - length));
      length += text.length;
      if (text) onDelta(text);
    } else {
      done = frame;
    }
  });

  if (!response.body) {
    try {
      parser.push(await response.text());
      parser.end();
    } catch {
      return { error: signal?.aborted ? "aborted" : "stream" };
    }
  } else {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const timer = setTimeout(() => void reader.cancel().catch(() => undefined), STREAM_TIMEOUT_MS);
    const onAbort = () => void reader.cancel().catch(() => undefined);
    signal?.addEventListener("abort", onAbort);
    try {
      for (;;) {
        const { value, done: finished } = await reader.read();
        if (finished) break;
        parser.push(decoder.decode(value, { stream: true }));
        if (done) {
          void reader.cancel().catch(() => undefined);
          break;
        }
      }
      parser.push(decoder.decode());
      parser.end();
    } catch {
      return { error: signal?.aborted ? "aborted" : "stream" };
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
  }

  if (signal?.aborted) return { error: "aborted" };
  const final = done as Extract<AskFrame, { done: true }> | null;
  return final
    ? { outcome: final.outcome, source: final.source, asOf: final.asOf, ...(final.tags ? { tags: final.tags } : {}), ...(final.cite ? { cite: final.cite } : {}) }
    : { error: "stream" };
}

/** Test hook: forgets the cached status, the Turnstile widget and the verified window. */
export function resetAskClient() {
  resetAskStatus();
  verifiedUntil = 0;
  widget = null;
  pending = null;
  scriptPromise = null;
}
