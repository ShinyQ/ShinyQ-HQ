import type { ChatMessage } from "./prompt";
import type { AiBinding } from "./types";

export const DEFAULT_PRIMARY = "@cf/google/gemma-4-26b-a4b-it";
export const DEFAULT_FALLBACK = "@cf/mistralai/mistral-small-3.1-24b-instruct";
export const MAX_TOKENS = 300;
export const TEMPERATURE = 0.2;
export const FIRST_TOKEN_MS = 4000;
export const TOTAL_MS = 8000;

export interface ModelInput {
  messages: ChatMessage[];
  max_tokens: number;
  temperature: number;
  chat_template_kwargs?: Record<string, unknown>;
}

/** Anything that can stream text deltas for a model: the Workers AI binding, or REST in the nightly eval. */
export interface ModelClient {
  stream(model: string, input: ModelInput, signal: AbortSignal): AsyncIterable<string>;
}

/** Gemma 4 returns an empty answer unless thinking is disabled (benchmark finding). */
export function modelInput(model: string, messages: ChatMessage[]): ModelInput {
  const input: ModelInput = { messages, max_tokens: MAX_TOKENS, temperature: TEMPERATURE };
  if (/gemma-4/i.test(model)) input.chat_template_kwargs = { enable_thinking: false };
  return input;
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

export type AttemptFailure = "error" | "first_token_timeout" | "total_timeout" | "empty";

class AttemptError extends Error {
  constructor(readonly reason: AttemptFailure) {
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
    throw new AttemptError("error");
  } finally {
    controller.abort();
    void iterator?.return?.()?.catch(() => {});
  }
  if (!text.trim()) throw new AttemptError("empty");
  return text;
}

export interface Generation {
  text: string;
  source: "primary" | "fallback" | "none";
  failures: { model: string; reason: AttemptFailure }[];
}

/**
 * Primary, then at most one fallback (never both in parallel, to save quota). Fallback triggers:
 * an error, no first token in 4 s, over 8 s in total, or an empty answer.
 */
export async function generate(
  client: ModelClient,
  models: { primary: string; fallback?: string },
  messages: ChatMessage[],
  t: Timeouts = { firstTokenMs: FIRST_TOKEN_MS, totalMs: TOTAL_MS },
): Promise<Generation> {
  const failures: Generation["failures"] = [];
  const chain: [string, Generation["source"]][] = [[models.primary, "primary"]];
  if (models.fallback && models.fallback !== models.primary) chain.push([models.fallback, "fallback"]);
  for (const [model, source] of chain) {
    try {
      return { text: await attempt(client, model, modelInput(model, messages), t), source, failures };
    } catch (error) {
      failures.push({ model, reason: error instanceof AttemptError ? error.reason : "error" });
    }
  }
  return { text: "", source: "none", failures };
}
