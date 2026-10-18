import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_BACKUP_MODELS,
  GROQ_DIRECT_URL,
  backupTiers,
  groqBaseUrl,
  groqClient,
  retryAfterSeconds,
  stripReasoning,
} from "../../functions/_lib/groq";
import { GPT_OSS_STYLE, UpstreamError, modelInput } from "../../functions/_lib/model";
import type { AskEnv } from "../../functions/_lib/types";

const messages = [
  { role: "system" as const, content: "sys" },
  { role: "user" as const, content: "hi" },
];

function reply(content: unknown, extra: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ choices: [{ message: { content, ...extra } }] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

async function collect(iterable: AsyncIterable<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const part of iterable) out.push(part);
  return out;
}

function client(fetcher: unknown, extra: Partial<Parameters<typeof groqClient>[0]> = {}) {
  return groqClient({ apiKey: "gsk_secret", baseUrl: async () => GROQ_DIRECT_URL, fetcher: fetcher as typeof fetch, ...extra });
}

describe("stripReasoning", () => {
  it("drops think blocks and an unclosed think", () => {
    expect(stripReasoning("<think>plan</think>Answer")).toBe("Answer");
    expect(stripReasoning("A<think>x</think>B<think>y</think>C")).toBe("ABC");
    expect(stripReasoning("Answer<think>never closed")).toBe("Answer");
    expect(stripReasoning("  plain  ")).toBe("plain");
  });
});

describe("retryAfterSeconds", () => {
  const h = (init: Record<string, string>) => new Headers(init);
  it("prefers retry-after", () => {
    expect(retryAfterSeconds(h({ "retry-after": "30", "x-ratelimit-reset-requests": "2m" }))).toBe(30);
  });
  it("parses ratelimit reset durations and takes the max", () => {
    expect(retryAfterSeconds(h({ "x-ratelimit-reset-requests": "7.66s" }))).toBe(8);
    expect(retryAfterSeconds(h({ "x-ratelimit-reset-tokens": "2m59.56s" }))).toBe(180);
    expect(retryAfterSeconds(h({ "x-ratelimit-reset-requests": "1h2m" }))).toBe(3720);
    expect(retryAfterSeconds(h({ "x-ratelimit-reset-requests": "5s", "x-ratelimit-reset-tokens": "20s" }))).toBe(20);
  });
  it("clamps to 1..86400 and returns undefined when nothing parses", () => {
    expect(retryAfterSeconds(h({ "retry-after": "0" }))).toBe(1);
    expect(retryAfterSeconds(h({ "retry-after": "999999" }))).toBe(86400);
    expect(retryAfterSeconds(h({}))).toBeUndefined();
    expect(retryAfterSeconds(h({ "retry-after": "soon" }))).toBeUndefined();
  });
});

describe("groqClient request", () => {
  it("sends the qwen request", async () => {
    const fetcher = vi.fn(async () => reply("Hello"));
    const out = await collect(client(fetcher).stream("qwen/qwen3.8-27b", modelInput("qwen/qwen3.8-27b", messages), new AbortController().signal));
    expect(out).toEqual(["Hello"]);
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${GROQ_DIRECT_URL}/chat/completions`);
    expect(init.method).toBe("POST");
    const headers = new Headers(init.headers);
    expect(headers.get("authorization")).toBe("Bearer gsk_secret");
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.has("cf-aig-metadata")).toBe(false);
    expect(JSON.parse(init.body as string)).toEqual({
      model: "qwen/qwen3.8-27b",
      messages,
      temperature: 0.2,
      max_completion_tokens: 300,
      stream: false,
      reasoning_effort: "none",
    });
  });

  it("sends the gpt-oss request without max_tokens or template kwargs", async () => {
    const fetcher = vi.fn(async () => reply("Hello"));
    await collect(client(fetcher).stream("openai/gpt-oss-120b", modelInput("openai/gpt-oss-120b", messages), new AbortController().signal));
    const body = JSON.parse((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body).toEqual({
      model: "openai/gpt-oss-120b",
      messages: [...messages, { role: "system", content: GPT_OSS_STYLE() }],
      temperature: 0.2,
      max_completion_tokens: 1024,
      stream: false,
      reasoning_effort: "low",
      include_reasoning: false,
    });
    expect(body).not.toHaveProperty("max_tokens");
    expect(body).not.toHaveProperty("chat_template_kwargs");
  });

  it("omits reasoning fields when the input has none", async () => {
    const fetcher = vi.fn(async () => reply("Hello"));
    await collect(client(fetcher).stream("x/y", { messages, max_tokens: 50, temperature: 0.1, chat_template_kwargs: { a: 1 } }, new AbortController().signal));
    const body = JSON.parse((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body).toEqual({ model: "x/y", messages, temperature: 0.1, max_completion_tokens: 50, stream: false });
  });

  it("passes the abort signal", async () => {
    const fetcher = vi.fn(async () => reply("Hello"));
    const controller = new AbortController();
    await collect(client(fetcher).stream("x/y", modelInput("x/y", messages), controller.signal));
    expect((fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].signal).toBe(controller.signal);
  });

  it("adds gateway headers only through the gateway", async () => {
    const fetcher = vi.fn(async () => reply("Hello"));
    const gateway = client(fetcher, {
      baseUrl: async () => "https://gateway.ai.cloudflare.com/v1/acc/gw/groq",
      metadata: { surface: "ask" },
      skipCache: true,
    });
    await collect(gateway.stream("x/y", modelInput("x/y", messages), new AbortController().signal));
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://gateway.ai.cloudflare.com/v1/acc/gw/groq/chat/completions");
    const headers = new Headers(init.headers);
    expect(headers.get("cf-aig-metadata")).toBe(JSON.stringify({ surface: "ask" }));
    expect(headers.get("cf-aig-skip-cache")).toBe("true");

    const direct = vi.fn(async () => reply("Hello"));
    await collect(client(direct, { metadata: { surface: "ask" }, skipCache: true }).stream("x/y", modelInput("x/y", messages), new AbortController().signal));
    const directHeaders = new Headers((direct.mock.calls[0] as unknown as [string, RequestInit])[1].headers);
    expect(directHeaders.has("cf-aig-metadata")).toBe(false);
    expect(directHeaders.has("cf-aig-skip-cache")).toBe(false);
  });
});

describe("groqClient response", () => {
  it("strips think blocks and ignores message.reasoning", async () => {
    const fetcher = vi.fn(async () => reply("<think>secret plan</think>Visible answer", { reasoning: "hidden chain" }));
    const out = await collect(client(fetcher).stream("x/y", modelInput("x/y", messages), new AbortController().signal));
    expect(out).toEqual(["Visible answer"]);
  });

  it("yields nothing for empty content and reasoning-only replies", async () => {
    for (const content of ["", "<think>only thinking", null]) {
      const fetcher = vi.fn(async () => reply(content, { reasoning: "hidden" }));
      expect(await collect(client(fetcher).stream("x/y", modelInput("x/y", messages), new AbortController().signal))).toEqual([]);
    }
  });

  it("reports usage", async () => {
    const usage = { prompt_tokens: 10, completion_tokens: 5, prompt_tokens_details: { cached_tokens: 4 } };
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }], usage }), { status: 200 }));
    const onUsage = vi.fn();
    await collect(client(fetcher, { onUsage }).stream("x/y", modelInput("x/y", messages), new AbortController().signal));
    expect(onUsage).toHaveBeenCalledWith("x/y", usage);
  });
});

describe("groqClient status mapping", () => {
  async function failure(status: number, body: unknown, headers: Record<string, string> = {}): Promise<UpstreamError> {
    const fetcher = vi.fn(async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers }));
    try {
      await collect(client(fetcher).stream("x/y", modelInput("x/y", messages), new AbortController().signal));
    } catch (error) {
      expect(error).toBeInstanceOf(UpstreamError);
      return error as UpstreamError;
    }
    throw new Error("expected a failure");
  }

  it("maps 429 and 413 to rate_limited with the retry delay", async () => {
    const limited = await failure(429, { error: { message: "slow down" } }, { "retry-after": "12" });
    expect(limited.reason).toBe("rate_limited");
    expect(limited.retryAfterSec).toBe(12);
    const large = await failure(413, { error: { message: "too large" } }, { "x-ratelimit-reset-tokens": "7.66s" });
    expect(large.reason).toBe("rate_limited");
    expect(large.retryAfterSec).toBe(8);
  });

  it("maps 401 and 403 to auth", async () => {
    expect((await failure(401, { error: { message: "bad key" } })).reason).toBe("auth");
    expect((await failure(403, "forbidden")).reason).toBe("auth");
  });

  it("maps 404 and model-not-found 400s to unavailable", async () => {
    expect((await failure(404, { error: { message: "nope" } })).reason).toBe("unavailable");
    expect((await failure(400, { error: { code: "model_not_found", message: "x" } })).reason).toBe("unavailable");
    expect((await failure(400, { error: { code: "model_decommissioned", message: "x" } })).reason).toBe("unavailable");
    expect((await failure(400, { error: { message: "The model `x/y` does not exist" } })).reason).toBe("unavailable");
  });

  it("maps other failures to error, even with an unreadable body", async () => {
    expect((await failure(400, { error: { code: "invalid_request", message: "bad" } })).reason).toBe("error");
    expect((await failure(500, "<html>oops</html>")).reason).toBe("error");
    expect((await failure(503, "")).reason).toBe("error");
  });

  it("never includes the API key in an error", async () => {
    const error = await failure(401, { error: { message: "Invalid API key gsk_secret" } });
    expect(error.message).not.toContain("gsk_secret");
  });
});

describe("groqBaseUrl", () => {
  const gatewayEnv = (getUrl: () => Promise<unknown>, extra: Partial<AskEnv> = {}) =>
    ({ ASK_GATEWAY_ID: "gw", AI: { run: vi.fn(), gateway: vi.fn(() => ({ getUrl })) }, ...extra }) as unknown as AskEnv;

  it("uses the gateway URL without trailing slashes and memoizes it", async () => {
    const getUrl = vi.fn(async () => "https://gateway.ai.cloudflare.com/v1/acc/gw/groq//");
    const env = gatewayEnv(getUrl);
    const base = groqBaseUrl(env);
    expect(await base()).toBe("https://gateway.ai.cloudflare.com/v1/acc/gw/groq");
    expect(await base()).toBe("https://gateway.ai.cloudflare.com/v1/acc/gw/groq");
    expect(getUrl).toHaveBeenCalledTimes(1);
    expect(env.AI?.gateway).toHaveBeenCalledWith("gw");
    expect(getUrl).toHaveBeenCalledWith("groq");
  });

  it("falls back to the direct URL", async () => {
    expect(await groqBaseUrl({})()).toBe(GROQ_DIRECT_URL);
    expect(await groqBaseUrl({ AI: { run: vi.fn() } })()).toBe(GROQ_DIRECT_URL);
    expect(await groqBaseUrl({ ASK_GATEWAY_ID: "gw", AI: { run: vi.fn() } })()).toBe(GROQ_DIRECT_URL);
    expect(await groqBaseUrl(gatewayEnv(async () => { throw new Error("boom"); }))()).toBe(GROQ_DIRECT_URL);
    expect(await groqBaseUrl(gatewayEnv(async () => ""))()).toBe(GROQ_DIRECT_URL);
    expect(await groqBaseUrl(gatewayEnv(async () => 42))()).toBe(GROQ_DIRECT_URL);
    expect(await groqBaseUrl(gatewayEnv(async () => "https://x/groq", { ASK_GATEWAY_ID: "" }))()).toBe(GROQ_DIRECT_URL);
  });
});

describe("backupTiers", () => {
  it("is empty without a key", () => {
    expect(backupTiers({}, {})).toEqual([]);
    expect(backupTiers({ GROQ_API_KEY: "   " }, {})).toEqual([]);
  });

  it("builds the default order", () => {
    expect(DEFAULT_BACKUP_MODELS).toEqual(["qwen/qwen3.8-27b", "openai/gpt-oss-120b"]);
    const tiers = backupTiers({ GROQ_API_KEY: "k" }, {});
    expect(tiers.map((t) => t.model)).toEqual(DEFAULT_BACKUP_MODELS);
  });

  it("honors ASK_BACKUP_MODELS, trimming and dropping empties", () => {
    const tiers = backupTiers({ GROQ_API_KEY: "k", ASK_BACKUP_MODELS: " openai/gpt-oss-120b , ,a/b," }, {});
    expect(tiers.map((t) => t.model)).toEqual(["openai/gpt-oss-120b", "a/b"]);
    expect(backupTiers({ GROQ_API_KEY: "k", ASK_BACKUP_MODELS: " , " }, {}).map((t) => t.model)).toEqual(DEFAULT_BACKUP_MODELS);
  });

  it("calls the injected fetcher with the key and metadata through the gateway", async () => {
    const fetcher = vi.fn(async () => reply("Hello"));
    const env = {
      GROQ_API_KEY: "k",
      ASK_GATEWAY_ID: "gw",
      AI: { run: vi.fn(), gateway: () => ({ getUrl: async () => "https://gw.example/groq/" }) },
    } as unknown as AskEnv;
    const [tier] = backupTiers(env, { surface: "ask" }, fetcher as unknown as typeof fetch);
    const out = await collect(tier.client.stream(tier.model, modelInput(tier.model, messages), new AbortController().signal));
    expect(out).toEqual(["Hello"]);
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://gw.example/groq/chat/completions");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer k");
    expect(new Headers(init.headers).get("cf-aig-metadata")).toBe(JSON.stringify({ surface: "ask" }));
  });
});
