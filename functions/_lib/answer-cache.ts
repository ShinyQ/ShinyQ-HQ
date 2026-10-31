import type { AskLocale } from "../../src/ask/protocol";
import { PROMPT_VERSION, type ChatMessage } from "./prompt";
import { sha256Hex } from "./security";
import { normalizeQuestion } from "./text";
import type { KvNamespace } from "./types";

/**
 * Shared answer cache of Ask the HQ, keyed on what the model sees (owner decision 2026-10-31): the prompt version, the
 * locale, the route and the model messages (rules, routing lines, CONTEXT with the retrieved chunks, the question). A
 * content deploy only invalidates the answers whose prompt or retrieved context changed. First turns only (security
 * audit 2026-10-24); `runPipeline` reads and writes it.
 */

export const CACHE_PREFIX = "ans2:";
export const CACHE_TTL_SECONDS = 7 * 24 * 60 * 60;

/** Read never throws (a broken cache is a miss); `put` may be deferred by the caller and its failure is ignored. */
export interface AnswerCache {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<unknown>;
}

/** The system prompt line that dates the pack (`systemPrompt` in prompt.ts): it changes with almost every content commit. */
const datedLine = (packDate: string) => `Information is accurate as of ${packDate}.`;
const UNDATED_LINE = datedLine("{packDate}");

export interface AnswerKeyInput {
  locale: AskLocale;
  /** Route label (`PipelineResult.route`, `+partial` included). */
  route: string;
  /** The messages the model gets (`buildMessages`). */
  messages: readonly ChatMessage[];
  packDate: string;
}

/**
 * `ans2:` plus the SHA-256 of `[PROMPT_VERSION, locale, route, messages]`, with the pack date line of the system prompt
 * replaced by a fixed placeholder and the visitor's question (the last user message) in its cache form
 * (`normalizeQuestion`: case, punctuation and spacing aside).
 */
export async function answerCacheKey({ locale, route, messages, packDate }: AnswerKeyInput): Promise<string> {
  const dated = datedLine(packDate);
  const last = messages.length - 1;
  const keyed = messages.map((m, i) => {
    if (m.role === "system") return { role: m.role, content: m.content.split("\n").map((line) => (line === dated ? UNDATED_LINE : line)).join("\n") };
    return { role: m.role, content: i === last && m.role === "user" ? normalizeQuestion(m.content) : m.content };
  });
  return `${CACHE_PREFIX}${await sha256Hex(JSON.stringify([PROMPT_VERSION, locale, route, keyed]))}`;
}

/** The stored value: the model answer exactly as the output checks received it (after `normalizeDashes`). */
function cacheValue(answer: string): string {
  return JSON.stringify({ text: answer });
}

/** The stored answer text, or null for a missing or malformed entry. */
function cachedText(value: string | null): string | null {
  if (!value) return null;
  try {
    const data: unknown = JSON.parse(value);
    const text = data && typeof data === "object" ? (data as { text?: unknown }).text : undefined;
    return typeof text === "string" && text.trim() ? text : null;
  } catch {
    return null;
  }
}

export async function readCache(cache: AnswerCache, key: string): Promise<string | null> {
  try {
    return cachedText(await cache.get(key));
  } catch {
    return null;
  }
}

export function writeCache(cache: AnswerCache, key: string, answer: string): void {
  try {
    void Promise.resolve(cache.put(key, cacheValue(answer))).catch(() => {});
  } catch {
    // A failed write is ignored.
  }
}

/** KV-backed cache for the handler: `defer` receives every write (for `waitUntil`), so the response never waits on KV. */
export function kvAnswerCache(kv: KvNamespace, defer: (pending: Promise<unknown>) => void): AnswerCache {
  return {
    async get(key) {
      try {
        return await kv.get(key);
      } catch {
        return null;
      }
    },
    put(key, value) {
      const pending = (async () => kv.put(key, value, { expirationTtl: CACHE_TTL_SECONDS }))().catch(() => {});
      defer(pending);
      return pending;
    },
  };
}
