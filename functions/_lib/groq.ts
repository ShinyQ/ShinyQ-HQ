import { GROQ_TIMEOUTS, UpstreamError, type BackupTier, type ModelClient, type ModelInput } from "./model";
import type { AskEnv } from "./types";

export const GROQ_DIRECT_URL = "https://api.groq.com/openai/v1";
export const DEFAULT_BACKUP_MODELS = ["qwen/qwen3.8-27b", "openai/gpt-oss-120b"];

const MAX_RETRY_SECONDS = 86_400;

export interface GroqUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number };
}

export interface GroqOptions {
  apiKey: string;
  /** Base URL without a trailing slash: the AI Gateway Groq endpoint or `GROQ_DIRECT_URL`. */
  baseUrl: () => Promise<string>;
  /** Defaults to the global `fetch`, resolved per call. */
  fetcher?: typeof fetch;
  /** Sent as `cf-aig-metadata` when the request goes through the gateway. */
  metadata?: Record<string, string>;
  /** Forces the gateway headers on or off; by default the base URL decides (anything but `GROQ_DIRECT_URL`). */
  viaGateway?: boolean;
  /** Adds `cf-aig-skip-cache: true` through the gateway. */
  skipCache?: boolean;
  onUsage?: (model: string, usage: GroqUsage) => void;
}

/** Drops `<think>...</think>` blocks; an unclosed `<think>` drops the rest of the text. */
export function stripReasoning(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<think>[\s\S]*$/i, "")
    .trim();
}

/** Seconds of a Groq duration such as "7.66s", "2m59.56s", "1h2m" or "250ms"; a bare number is seconds. */
function durationSeconds(value: string): number | undefined {
  const text = value.trim();
  if (!text) return undefined;
  if (/^\d+(\.\d+)?$/.test(text)) return Number(text);
  const parts = [...text.matchAll(/(\d+(?:\.\d+)?)(ms|h|m|s)/g)];
  if (!parts.length || parts.map((part) => part[0]).join("") !== text) return undefined;
  const unit = { ms: 0.001, s: 1, m: 60, h: 3600 } as const;
  return parts.reduce((sum, part) => sum + Number(part[1]) * unit[part[2] as keyof typeof unit], 0);
}

/** `retry-after`, else the longest `x-ratelimit-reset-*` delay, rounded up and clamped to 1 s to 24 h. */
export function retryAfterSeconds(headers: Headers): number | undefined {
  const clamp = (seconds: number) => Math.min(MAX_RETRY_SECONDS, Math.max(1, Math.ceil(seconds)));
  const retryAfter = headers.get("retry-after");
  const direct = retryAfter === null ? undefined : durationSeconds(retryAfter);
  if (direct !== undefined) return clamp(direct);
  const resets = ["x-ratelimit-reset-requests", "x-ratelimit-reset-tokens"]
    .map((name) => headers.get(name))
    .map((value) => (value === null ? undefined : durationSeconds(value)))
    .filter((value): value is number => value !== undefined);
  return resets.length ? clamp(Math.max(...resets)) : undefined;
}

interface GroqErrorBody {
  code?: string;
  message?: string;
}

async function readError(response: Response): Promise<GroqErrorBody> {
  try {
    const body = (await response.json()) as { error?: GroqErrorBody } | null;
    const error = body?.error;
    return {
      code: typeof error?.code === "string" ? error.code : undefined,
      message: typeof error?.message === "string" ? error.message : undefined,
    };
  } catch {
    return {};
  }
}

function modelMissing(error: GroqErrorBody): boolean {
  return (
    error.code === "model_not_found" ||
    error.code === "model_decommissioned" ||
    /model\b.*(not found|does not exist|decommissioned)/i.test(error.message ?? "")
  );
}

/** ModelClient over Groq's OpenAI-compatible chat completions: one non-streaming request, the whole answer yielded once. */
export function groqClient(options: GroqOptions): ModelClient {
  return {
    async *stream(model: string, input: ModelInput, signal: AbortSignal) {
      const base = await options.baseUrl();
      const headers: Record<string, string> = {
        authorization: `Bearer ${options.apiKey}`,
        "content-type": "application/json",
      };
      if (options.viaGateway ?? base !== GROQ_DIRECT_URL) {
        if (options.metadata) headers["cf-aig-metadata"] = JSON.stringify(options.metadata);
        if (options.skipCache) headers["cf-aig-skip-cache"] = "true";
      }
      const body = {
        model,
        messages: input.messages,
        temperature: input.temperature,
        max_completion_tokens: input.max_tokens,
        stream: false,
        ...(input.reasoning_effort ? { reasoning_effort: input.reasoning_effort } : {}),
        ...(input.include_reasoning !== undefined ? { include_reasoning: input.include_reasoning } : {}),
      };
      const fetcher = options.fetcher ?? globalThis.fetch;
      const response = await fetcher(`${base}/chat/completions`, { method: "POST", headers, body: JSON.stringify(body), signal });
      if (!response.ok) {
        const error = await readError(response);
        const detail = (error.message ?? "").split(options.apiKey).join("[key]").slice(0, 200);
        const message = `groq ${response.status}${detail ? `: ${detail}` : ""}`;
        const { status } = response;
        if (status === 429 || status === 413) throw new UpstreamError("rate_limited", retryAfterSeconds(response.headers), message);
        if (status === 401 || status === 403) throw new UpstreamError("auth", undefined, message);
        if (status === 404 || (status === 400 && modelMissing(error))) throw new UpstreamError("unavailable", undefined, message);
        throw new UpstreamError("error", undefined, message);
      }
      const payload = (await response.json()) as {
        choices?: { message?: { content?: unknown } }[];
        usage?: GroqUsage;
      };
      if (payload.usage) options.onUsage?.(model, payload.usage);
      const content = payload.choices?.[0]?.message?.content;
      const text = typeof content === "string" ? stripReasoning(content) : "";
      if (text) yield text;
    },
  };
}

/** Memoized resolver of the Groq base URL: the AI Gateway endpoint when configured and reachable, else the direct API. */
export function groqBaseUrl(env: AskEnv): () => Promise<string> {
  let cached: Promise<string> | undefined;
  const resolve = async (): Promise<string> => {
    const id = env.ASK_GATEWAY_ID;
    const gateway = env.AI?.gateway;
    if (!id || typeof gateway !== "function") return GROQ_DIRECT_URL;
    try {
      const url = await gateway.call(env.AI, id).getUrl("groq");
      const trimmed = typeof url === "string" ? url.replace(/\/+$/, "") : "";
      return trimmed || GROQ_DIRECT_URL;
    } catch {
      return GROQ_DIRECT_URL;
    }
  };
  return () => (cached ??= resolve());
}

/** The Groq tiers tried after Workers AI, in order; none without `GROQ_API_KEY`. */
export function backupTiers(env: AskEnv, metadata: Record<string, string>, fetcher?: typeof fetch): BackupTier[] {
  const apiKey = env.GROQ_API_KEY?.trim();
  if (!apiKey) return [];
  const listed = (env.ASK_BACKUP_MODELS ?? "")
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean);
  const models = listed.length ? listed : DEFAULT_BACKUP_MODELS;
  const baseUrl = groqBaseUrl(env);
  return models.map((model) => ({
    model,
    client: groqClient({ apiKey, baseUrl, fetcher, metadata }),
    timeouts: GROQ_TIMEOUTS,
  }));
}
