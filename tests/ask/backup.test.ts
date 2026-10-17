import { beforeEach, describe, expect, it } from "vitest";
import { modelBreaker, resetModelBreakers, secondsToMidnight } from "../../functions/_lib/limits";
import {
  CHAIN_MS,
  generate,
  groqKey,
  isQuotaError,
  modelInput,
  UpstreamError,
  UNAVAILABLE_SECONDS,
  WORKERS_AI_KEY,
  type BackupTier,
  type ModelBreaker,
  type ModelClient,
} from "../../functions/_lib/model";
import type { KvNamespace } from "../../functions/_lib/types";

const fast = { firstTokenMs: 60, totalMs: 150 };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const QWEN = "qwen/qwen3.8-27b";
const GPT = "openai/gpt-oss-120b";

function mock(behaviour: Record<string, (signal: AbortSignal) => AsyncIterable<string>>) {
  const calls: { model: string; input: unknown }[] = [];
  const client: ModelClient = {
    stream(model, input, signal) {
      calls.push({ model, input });
      return behaviour[model](signal);
    },
  };
  return { client, calls };
}

const say = (text: string, delay = 0) =>
  async function* () {
    if (delay) await sleep(delay);
    yield text;
  };

const fail = (error: unknown) =>
  async function* (): AsyncGenerator<string> {
    throw error;
  };

const names = (calls: { model: string }[]) => calls.map((c) => c.model);

function recordingBreaker(open: string[] = []) {
  const trips: { key: string; seconds: number }[] = [];
  const breaker: ModelBreaker = {
    async isOpen(key) {
      return open.includes(key);
    },
    async trip(key, seconds) {
      trips.push({ key, seconds });
    },
  };
  return { breaker, trips };
}

function backups(groq: ModelClient): BackupTier[] {
  return [
    { model: QWEN, client: groq },
    { model: GPT, client: groq },
  ];
}

const models = { primary: "p", fallback: "f" };

describe("quota classification", () => {
  it("recognises the Workers AI daily allocation error", () => {
    expect(isQuotaError(new Error("3036: You have used up your daily free allocation of 10,000 neurons"))).toBe(true);
    expect(isQuotaError(new Error("AiError 4006"))).toBe(true);
    expect(isQuotaError(new Error("5xx upstream"))).toBe(false);
    expect(isQuotaError(new Error("code 30360"))).toBe(false);
    expect(isQuotaError("3036")).toBe(false);
    expect(isQuotaError(null)).toBe(false);
  });
});

describe("tier chain", () => {
  it("answers from Qwen when the primary hits its quota and skips Mistral", async () => {
    const { client, calls } = mock({ p: fail(new Error("3036: daily free allocation of 10,000 neurons")), f: say("mistral"), [QWEN]: say("qwen"), [GPT]: say("gpt") });
    const result = await generate(client, models, [], fast, { backups: backups(client) });
    expect(result).toMatchObject({ text: "qwen", source: "backup", model: QWEN });
    expect(names(calls)).toEqual(["p", QWEN]);
    expect(result.failures).toEqual([
      { model: "p", reason: "quota" },
      { model: "f", reason: "breaker_open" },
    ]);
  });

  it("tries Mistral after a generic error", async () => {
    const { client, calls } = mock({ p: fail(new Error("boom")), f: say("mistral") });
    const result = await generate(client, models, [], fast, { backups: backups(client) });
    expect(result).toMatchObject({ text: "mistral", source: "fallback", model: "f" });
    expect(names(calls)).toEqual(["p", "f"]);
  });

  it("tries Mistral after a timeout", async () => {
    const { client, calls } = mock({ p: say("late", 120), f: say("mistral") });
    const result = await generate(client, models, [], fast, { backups: backups(client) });
    expect(result.source).toBe("fallback");
    expect(result.failures[0]).toEqual({ model: "p", reason: "first_token_timeout" });
    expect(names(calls)).toEqual(["p", "f"]);
  });

  it("reaches Qwen when Mistral fails too", async () => {
    const { client, calls } = mock({ p: fail(new Error("x")), f: fail(new Error("y")), [QWEN]: say("qwen"), [GPT]: say("gpt") });
    const result = await generate(client, models, [], fast, { backups: backups(client) });
    expect(result).toMatchObject({ text: "qwen", source: "backup", model: QWEN });
    expect(names(calls)).toEqual(["p", "f", QWEN]);
  });

  it("reaches gpt-oss and trips Qwen for 6 h when Qwen is unavailable", async () => {
    const { client, calls } = mock({
      p: fail(new Error("x")),
      f: fail(new Error("y")),
      [QWEN]: fail(new UpstreamError("unavailable")),
      [GPT]: say("gpt"),
    });
    const { breaker, trips } = recordingBreaker();
    const result = await generate(client, models, [], fast, { backups: backups(client), breaker });
    expect(result).toMatchObject({ text: "gpt", source: "backup", model: GPT });
    expect(names(calls)).toEqual(["p", "f", QWEN, GPT]);
    expect(trips).toEqual([{ key: groqKey(QWEN), seconds: UNAVAILABLE_SECONDS }]);
    expect(result.failures.at(-1)).toEqual({ model: QWEN, reason: "unavailable" });
  });

  it("trips a rate limited backup for its retry-after seconds", async () => {
    const { client } = mock({
      p: fail(new Error("x")),
      f: fail(new Error("y")),
      [QWEN]: fail(new UpstreamError("rate_limited", 42)),
      [GPT]: say("gpt"),
    });
    const { breaker, trips } = recordingBreaker();
    const result = await generate(client, models, [], fast, { backups: backups(client), breaker });
    expect(result.model).toBe(GPT);
    expect(trips).toEqual([{ key: groqKey(QWEN), seconds: 42 }]);
    expect(result.failures.at(-1)).toEqual({ model: QWEN, reason: "rate_limited", retryAfterSec: 42 });
  });

  it("trips rate limited with 60 s by default and auth for an hour", async () => {
    const { client } = mock({
      p: fail(new Error("x")),
      f: fail(new Error("y")),
      [QWEN]: fail(new UpstreamError("rate_limited")),
      [GPT]: fail(new UpstreamError("auth")),
    });
    const { breaker, trips } = recordingBreaker();
    await generate(client, models, [], fast, { backups: backups(client), breaker });
    expect(trips).toEqual([
      { key: groqKey(QWEN), seconds: 60 },
      { key: groqKey(GPT), seconds: 3600 },
    ]);
  });

  it("returns none when every tier fails and never trips on plain errors or timeouts", async () => {
    const { client } = mock({
      p: fail(new Error("x")),
      f: say("late", 120),
      [QWEN]: fail(new Error("z")),
      [GPT]: say("  "),
    });
    const { breaker, trips } = recordingBreaker();
    const result = await generate(client, models, [], fast, { backups: backups(client), breaker });
    expect(result).toMatchObject({ text: "", source: "none" });
    expect(result.failures.map((f) => f.reason)).toEqual(["error", "first_token_timeout", "error", "empty"]);
    expect(trips).toEqual([]);
  });

  it("does not trip Workers AI tiers on unavailable or rate limits", async () => {
    const { client } = mock({ p: fail(new UpstreamError("unavailable")), f: say("ok") });
    const { breaker, trips } = recordingBreaker();
    const result = await generate(client, models, [], fast, { breaker });
    expect(result.source).toBe("fallback");
    expect(result.failures[0].reason).toBe("unavailable");
    expect(trips).toEqual([]);
  });

  it("skips a model with an open breaker without calling it", async () => {
    const { client, calls } = mock({ p: say("p"), f: say("f"), [QWEN]: say("qwen"), [GPT]: say("gpt") });
    const { breaker } = recordingBreaker([WORKERS_AI_KEY, groqKey(QWEN)]);
    const result = await generate(client, models, [], fast, { backups: backups(client), breaker });
    expect(result).toMatchObject({ text: "gpt", model: GPT });
    expect(names(calls)).toEqual([GPT]);
    expect(result.failures).toEqual([
      { model: "p", reason: "breaker_open" },
      { model: "f", reason: "breaker_open" },
      { model: QWEN, reason: "breaker_open" },
    ]);
  });

  it("trips wai until midnight on quota so the next call skips both Workers AI tiers", async () => {
    resetModelBreakers();
    const breaker = modelBreaker(undefined);
    const first = mock({ p: fail(new Error("3036 daily free allocation")), f: say("f"), [QWEN]: say("qwen"), [GPT]: say("gpt") });
    const now = Date.UTC(2026, 9, 18, 12, 0, 0);
    await generate(first.client, models, [], fast, { backups: backups(first.client), breaker, now: () => now });
    expect(await breaker.isOpen(WORKERS_AI_KEY, now)).toBe(true);
    expect(await breaker.isOpen(WORKERS_AI_KEY, now + secondsToMidnight(now) * 1000 + 1)).toBe(false);
    const second = mock({ p: say("p"), f: say("f"), [QWEN]: say("qwen"), [GPT]: say("gpt") });
    const result = await generate(second.client, models, [], fast, { backups: backups(second.client), breaker, now: () => now });
    expect(names(second.calls)).toEqual([QWEN]);
    expect(result.model).toBe(QWEN);
    resetModelBreakers();
  });

  it("skips the same-key tier after a quota failure even without a breaker", async () => {
    const { client, calls } = mock({ p: fail(new Error("4006 neurons")), f: say("f") });
    const result = await generate(client, models, [], fast);
    expect(result).toMatchObject({ text: "", source: "none" });
    expect(names(calls)).toEqual(["p"]);
    expect(result.failures.map((f) => f.reason)).toEqual(["quota", "breaker_open"]);
  });

  it("keeps the two model behaviour without backups", async () => {
    const { client, calls } = mock({ p: fail(new Error("x")), f: say("f") });
    const result = await generate(client, models, [], fast);
    expect(result).toMatchObject({ text: "f", source: "fallback", model: "f" });
    expect(names(calls)).toEqual(["p", "f"]);
  });

  it("skips the remaining tiers when the deadline is spent", async () => {
    let clock = 1_000_000;
    const { client, calls } = mock({ p: fail(new Error("x")), f: say("f"), [QWEN]: say("qwen"), [GPT]: say("gpt") });
    const advancing: ModelClient = {
      stream(model, input, signal) {
        clock += 10_000;
        return client.stream(model, input, signal);
      },
    };
    const result = await generate(advancing, models, [], fast, { backups: backups(advancing), now: () => clock, deadlineMs: 15_000 });
    expect(result.source).toBe("fallback");
    const slow = mock({ p: fail(new Error("x")), f: fail(new Error("y")), [QWEN]: say("qwen"), [GPT]: say("gpt") });
    clock = 1_000_000;
    const skipping: ModelClient = {
      stream(model, input, signal) {
        clock += 10_000;
        return slow.client.stream(model, input, signal);
      },
    };
    const out = await generate(skipping, models, [], fast, { backups: backups(skipping), now: () => clock, deadlineMs: 15_000 });
    expect(out.source).toBe("none");
    expect(names(slow.calls)).toEqual(["p", "f"]);
    expect(out.failures.slice(2)).toEqual([
      { model: QWEN, reason: "deadline" },
      { model: GPT, reason: "deadline" },
    ]);
    expect(calls.length).toBe(2);
  });

  it("defaults the deadline to the chain budget", () => {
    expect(CHAIN_MS).toBe(24_000);
  });
});

describe("modelInput for backups", () => {
  it("turns reasoning off for Qwen", () => {
    expect(modelInput(QWEN, [])).toMatchObject({ reasoning_effort: "none", max_tokens: 300, temperature: 0.2 });
    expect(modelInput(QWEN, []).chat_template_kwargs).toBeUndefined();
  });

  it("keeps gpt-oss reasoning low, hidden and with a larger token cap", () => {
    expect(modelInput(GPT, [])).toMatchObject({ reasoning_effort: "low", include_reasoning: false, max_tokens: 1024 });
  });

  it("leaves Mistral untouched", () => {
    const input = modelInput("@cf/mistralai/mistral-small-3.1-24b-instruct", []);
    expect(input.reasoning_effort).toBeUndefined();
    expect(input.include_reasoning).toBeUndefined();
  });
});

describe("modelBreaker", () => {
  beforeEach(() => resetModelBreakers());

  function fakeKv(initial: Record<string, string> = {}) {
    const store = new Map(Object.entries(initial));
    const puts: { key: string; value: string; ttl?: number }[] = [];
    const kv: KvNamespace = {
      async get(key) {
        return store.get(key) ?? null;
      },
      async put(key, value, options) {
        store.set(key, value);
        puts.push({ key, value, ttl: options?.expirationTtl });
      },
    };
    return { kv, puts, store };
  }

  it("remembers a trip in memory until it expires", async () => {
    const breaker = modelBreaker(undefined);
    expect(await breaker.isOpen("k", 1000)).toBe(false);
    await breaker.trip("k", 30, 1000);
    expect(await breaker.isOpen("k", 1000 + 29_000)).toBe(true);
    expect(await breaker.isOpen("k", 1000 + 30_000)).toBe(false);
  });

  it("reads an open breaker from KV and caches it", async () => {
    const { kv } = fakeKv({ "mb:groq:x": String(10_000) });
    const breaker = modelBreaker(kv);
    expect(await breaker.isOpen("groq:x", 5000)).toBe(true);
    expect(await modelBreaker(undefined).isOpen("groq:x", 5000)).toBe(true);
    expect(await breaker.isOpen("groq:x", 10_001)).toBe(false);
  });

  it("ignores an expired KV value", async () => {
    const { kv } = fakeKv({ "mb:y": String(1000) });
    expect(await modelBreaker(kv).isOpen("y", 5000)).toBe(false);
  });

  it("does not write KV for trips under 60 s", async () => {
    const { kv, puts } = fakeKv();
    await modelBreaker(kv).trip("k", 59, 0);
    expect(puts).toEqual([]);
  });

  it("writes KV with ttl for trips of 60 s or more", async () => {
    const { kv, puts } = fakeKv();
    await modelBreaker(kv).trip("k", 90.2, 1000);
    expect(puts).toEqual([{ key: "mb:k", value: String(1000 + 90_200), ttl: 91 + 60 }]);
  });

  it("fails open when KV throws", async () => {
    const kv: KvNamespace = {
      async get() {
        throw new Error("kv down");
      },
      async put() {
        throw new Error("kv down");
      },
    };
    const breaker = modelBreaker(kv);
    expect(await breaker.isOpen("k", 1)).toBe(false);
    await expect(breaker.trip("k", 3600, 1)).resolves.toBeUndefined();
    expect(await breaker.isOpen("k", 2)).toBe(true);
  });
});
