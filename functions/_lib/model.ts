import { secondsToMidnight } from "./limits";
import type { ChatMessage } from "./prompt";
import type { AiBinding } from "./types";

export const DEFAULT_PRIMARY = "@cf/google/gemma-4-26b-a4b-it";
export const DEFAULT_FALLBACK = "@cf/mistralai/mistral-small-3.1-24b-instruct";
export const MAX_TOKENS = 300;
export const TEMPERATURE = 0.2;
export const FIRST_TOKEN_MS = 4000;
export const TOTAL_MS = 8000;
export const GPT_OSS_MAX_TOKENS = 1024;
export const GROQ_TIMEOUTS: Timeouts = { firstTokenMs: 6000, totalMs: 6000 };
/** Whole chain budget: the client stream timeout is 30 s. */
export const CHAIN_MS = 24_000;
export const MIN_ATTEMPT_MS = 1500;
export const WORKERS_AI_KEY = "wai";
export const groqKey = (model: string) => `groq:${model}`;
export const UNAVAILABLE_SECONDS = 6 * 3600;
export const AUTH_SECONDS = 3600;
export const RATE_LIMIT_DEFAULT_SECONDS = 60;

export interface ModelInput {
  messages: ChatMessage[];
  max_tokens: number;
  temperature: number;
  chat_template_kwargs?: Record<string, unknown>;
  reasoning_effort?: "none" | "low";
  include_reasoning?: boolean;
}

/** Anything that can stream text deltas for a model: the Workers AI binding, or REST in the nightly eval. */
export interface ModelClient {
  stream(model: string, input: ModelInput, signal: AbortSignal): AsyncIterable<string>;
}

/**
 * Gemma 4 returns an empty answer unless thinking is disabled (benchmark finding). The Groq backups
 * keep reasoning off (Qwen) or low and hidden with a larger token cap (gpt-oss).
 */
export function modelInput(model: string, messages: ChatMessage[]): ModelInput {
  const input: ModelInput = { messages, max_tokens: MAX_TOKENS, temperature: TEMPERATURE };
  if (/gemma-4/i.test(model)) input.chat_template_kwargs = { enable_thinking: false };
  if (/qwen/i.test(model)) input.reasoning_effort = "none";
  if (/gpt-oss/i.test(model)) {
    input.reasoning_effort = "low";
    input.include_reasoning = false;
    input.max_tokens = GPT_OSS_MAX_TOKENS;
  }
  return input;
}

export type UpstreamReason = "quota" | "rate_limited" | "unavailable" | "auth" | "error";

/** A classified upstream failure that a ModelClient can throw. */
export class UpstreamError extends Error {
  constructor(
    readonly reason: UpstreamReason,
    readonly retryAfterSec?: number,
    message?: string,
  ) {
    super(message ?? reason);
  }
}

/** Workers AI code 3036 ("You have used up your daily free allocation of 10,000 neurons") and 4006. */
export function isQuotaError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : (error as { message?: unknown } | null | undefined)?.message;
  return typeof message === "string" && /\b(3036|4006)\b|daily free allocation|neurons/i.test(message);
}

/** Text of one streamed or whole Workers AI result in either the classic or the OpenAI-compatible shape. */
export function extractText(payload: unknown): string {
  if (typeof payload === "string") return payload;
  if (!payload || typeof payload !== "object") return "";
  const p = payload as Record<string, unknown>;
  if (typeof p.response === "string") return p.response;
  if (p.result && typeof p.result === "object") return extractText(p.result);
  const choice = Array.isArray(p.choices) ? (p.choices[0] as Record<string, unknown> | undefined) : undefined;
  if (choice) {
    const delta = choice.delta as Record<string, unknown> | undefined;
    if (delta && typeof delta.content === "string") return delta.content;
    const message = choice.message as Record<string, unknown> | undefined;
    if (message && typeof message.content === "string") return message.content;
    if (typeof choice.text === "string") return choice.text;
  }
  return "";
}

/** Parses a Server-Sent Events byte stream from Workers AI into text deltas. */
export async function* parseModelStream(stream: ReadableStream<Uint8Array>, signal: AbortSignal): AsyncGenerator<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const onAbort = () => void reader.cancel().catch(() => {});
  signal.addEventListener("abort", onAbort);
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline: number;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") return;
        try {
          const text = extractText(JSON.parse(data));
          if (text) yield text;
        } catch {
          // Ignore keep-alives and partial frames that are not JSON.
        }
      }
    }
  } finally {
    signal.removeEventListener("abort", onAbort);
    reader.releaseLock();
  }
}

/** ModelClient over the Workers AI binding, routed through AI Gateway when a gateway id is set. */
export function bindingClient(ai: AiBinding, gatewayId?: string, metadata?: Record<string, string>): ModelClient {
  return {
    async *stream(model, input, signal) {
      const options = gatewayId ? { gateway: { id: gatewayId, metadata } } : undefined;
      const result = await ai.run(model, { ...input, stream: true }, options);
      if (signal.aborted) return;
      if (result instanceof ReadableStream) {
        yield* parseModelStream(result as ReadableStream<Uint8Array>, signal);
      } else {
        const text = extractText(result);
        if (text) yield text;
      }
    },
  };
}

export type AttemptFailure =
  | "error"
  | "first_token_timeout"
  | "total_timeout"
  | "empty"
  | "quota"
  | "rate_limited"
  | "unavailable"
  | "auth"
  | "breaker_open"
  | "deadline";

class AttemptError extends Error {
  constructor(
    readonly reason: AttemptFailure,
    readonly retryAfterSec?: number,
  ) {
    super(reason);
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, reason: AttemptFailure): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new AttemptError(reason)), Math.max(0, ms));
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

export interface Timeouts {
  firstTokenMs: number;
  totalMs: number;
}

/** One model attempt with the first-token and total deadlines. Resolves with the full text. */
export async function attempt(client: ModelClient, model: string, input: ModelInput, t: Timeouts): Promise<string> {
  const controller = new AbortController();
  const started = Date.now();
  let text = "";
  let iterator: AsyncIterator<string> | undefined;
  try {
    iterator = client.stream(model, input, controller.signal)[Symbol.asyncIterator]();
    while (true) {
      const elapsed = Date.now() - started;
      const budget = text ? t.totalMs - elapsed : Math.min(t.firstTokenMs, t.totalMs) - elapsed;
      if (budget <= 0) throw new AttemptError(text ? "total_timeout" : "first_token_timeout");
      const next = await withTimeout(iterator.next(), budget, text ? "total_timeout" : "first_token_timeout");
      if (next.done) break;
      text += next.value;
    }
  } catch (error) {
    if (error instanceof AttemptError) throw error;
    if (error instanceof UpstreamError) throw new AttemptError(error.reason, error.retryAfterSec);
    throw new AttemptError(isQuotaError(error) ? "quota" : "error");
  } finally {
    controller.abort();
    void iterator?.return?.()?.catch(() => {});
  }
  if (!text.trim()) throw new AttemptError("empty");
  return text;
}

export interface BackupTier {
  model: string;
  client: ModelClient;
  timeouts?: Timeouts;
}

/** Per-model pause shared across requests (see `modelBreaker` in limits.ts). */
export interface ModelBreaker {
  isOpen(key: string, now: number): Promise<boolean>;
  trip(key: string, seconds: number, now: number): Promise<void>;
}

export interface GenerateOptions {
  backups?: BackupTier[];
  breaker?: ModelBreaker;
  deadlineMs?: number;
  now?: () => number;
}

export interface Generation {
  text: string;
  source: "primary" | "fallback" | "backup" | "none";
  model?: string;
  failures: { model: string; reason: AttemptFailure; retryAfterSec?: number }[];
}

interface Tier {
  model: string;
  client: ModelClient;
  source: Exclude<Generation["source"], "none">;
  key: string;
  timeouts: Timeouts;
}

/** Seconds a failed backup tier stays paused; timeouts, plain errors and empty answers never pause it. */
function pauseSeconds(reason: AttemptFailure, retryAfterSec: number | undefined): number | undefined {
  if (reason === "rate_limited") return retryAfterSec ?? RATE_LIMIT_DEFAULT_SECONDS;
  if (reason === "auth") return AUTH_SECONDS;
  if (reason === "unavailable") return UNAVAILABLE_SECONDS;
  return undefined;
}

/**
 * Primary, then at most one fallback, then the backup tiers in order (never in parallel, to save quota).
 * A tier is tried after an error, no first token in time, a total timeout or an empty answer. A quota
 * failure skips every tier on the same key (both Workers AI models) and pauses it until UTC midnight;
 * backup tiers also pause on rate limits, auth failures and outages. The whole chain stops at the deadline.
 */
export async function generate(
  client: ModelClient,
  models: { primary: string; fallback?: string },
  messages: ChatMessage[],
  t: Timeouts = { firstTokenMs: FIRST_TOKEN_MS, totalMs: TOTAL_MS },
  opts: GenerateOptions = {},
): Promise<Generation> {
  const now = opts.now ?? Date.now;
  const started = now();
  const deadlineMs = opts.deadlineMs ?? CHAIN_MS;
  const failures: Generation["failures"] = [];
  const tiers: Tier[] = [{ model: models.primary, client, source: "primary", key: WORKERS_AI_KEY, timeouts: t }];
  if (models.fallback && models.fallback !== models.primary) {
    tiers.push({ model: models.fallback, client, source: "fallback", key: WORKERS_AI_KEY, timeouts: t });
  }
  for (const backup of opts.backups ?? []) {
    tiers.push({ model: backup.model, client: backup.client, source: "backup", key: groqKey(backup.model), timeouts: backup.timeouts ?? GROQ_TIMEOUTS });
  }

  const skipped = new Set<string>();
  for (const tier of tiers) {
    if (skipped.has(tier.key) || (await opts.breaker?.isOpen(tier.key, now()))) {
      failures.push({ model: tier.model, reason: "breaker_open" });
      continue;
    }
    const remaining = deadlineMs - (now() - started);
    if (remaining < MIN_ATTEMPT_MS) {
      failures.push({ model: tier.model, reason: "deadline" });
      continue;
    }
    const timeouts = { firstTokenMs: Math.min(tier.timeouts.firstTokenMs, remaining), totalMs: Math.min(tier.timeouts.totalMs, remaining) };
    try {
      const text = await attempt(tier.client, tier.model, modelInput(tier.model, messages), timeouts);
      return { text, source: tier.source, model: tier.model, failures };
    } catch (error) {
      const reason = error instanceof AttemptError ? error.reason : "error";
      const retryAfterSec = error instanceof AttemptError ? error.retryAfterSec : undefined;
      failures.push(retryAfterSec === undefined ? { model: tier.model, reason } : { model: tier.model, reason, retryAfterSec });
      let seconds: number | undefined;
      if (reason === "quota") {
        skipped.add(tier.key);
        seconds = secondsToMidnight(now());
      } else if (tier.source === "backup") {
        seconds = pauseSeconds(reason, retryAfterSec);
      }
      if (seconds !== undefined) await opts.breaker?.trip(tier.key, seconds, now());
    }
  }
  return { text: "", source: "none", failures };
}
