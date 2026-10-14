import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildRepoPack } from "@/ask/repo-pack";
import { ASK_MAX_TAGS, ASK_TAGS, type AskFrame } from "@/ask/protocol";
import { SUGGESTIONS } from "@/ask/suggestions";
import { cacheKey, createAskHandler, frame, pieces } from "../../functions/_lib/handler";
import { MESSAGES } from "../../functions/_lib/messages";
import { BREAKER_MIN_SAMPLES, resetBreaker, resetMinuteWindow } from "../../functions/_lib/limits";
import type { ModelClient } from "../../functions/_lib/model";
import { answerTags, chunkTags } from "../../functions/_lib/tags";
import { hasValidSession, issueSession, originAllowed, visitorHash } from "../../functions/_lib/security";
import type { AskEnv, KnowledgePack, KvNamespace, PagesContext, SafetyData } from "../../functions/_lib/types";

let pack: KnowledgePack;
let safety: SafetyData;
const ORIGIN = "https://kurniadi.pages.dev";
const NOW = Date.UTC(2026, 9, 11, 3, 0, 0);

beforeAll(() => {
  ({ pack, safety } = buildRepoPack("2026-10-11"));
});

beforeEach(() => {
  resetMinuteWindow();
  resetBreaker();
});

class MemoryKv implements KvNamespace {
  store = new Map<string, string>();
  writes = 0;
  async get(key: string) {
    return this.store.get(key) ?? null;
  }
  async put(key: string, value: string) {
    this.writes++;
    this.store.set(key, value);
  }
}

interface Setup {
  env?: Partial<AskEnv>;
  answer?: string | (() => AsyncIterable<string>);
  turnstile?: { success: boolean; hostname?: string };
}

function setup({ env = {}, answer = "Kurniadi works at Metrodata.", turnstile }: Setup = {}) {
  const kv = new MemoryKv();
  const events: { blobs?: string[] }[] = [];
  const modelCalls: string[] = [];
  const turnstileCalls: string[] = [];
  const pending: Promise<unknown>[] = [];
  const client: ModelClient = {
    stream(model) {
      modelCalls.push(model);
      if (typeof answer === "function") return answer();
      return (async function* () {
        yield answer;
      })();
    },
  };
  const fullEnv: AskEnv = {
    ASK_ENABLED: "true",
    ASK_ALLOWED_ORIGINS: `${ORIGIN},https://*.kurniadi.pages.dev`,
    ASK_IP_SALT_SEED: "seed",
    ASK_COOKIE_KEY: "cookie-key-for-tests-only",
    AI: { run: async () => ({}) },
    ASK_KV: kv,
    ASK_EVENTS: { writeDataPoint: (p) => void events.push(p) },
    ...env,
  };
  const handler = createAskHandler({
    pack,
    safety,
    now: () => NOW,
    streamDelayMs: 0,
    client: () => client,
    fetcher: async (_url, init) => {
      turnstileCalls.push(String((init?.body as FormData).get("response")));
      return new Response(JSON.stringify(turnstile ?? { success: true, hostname: "kurniadi.pages.dev" }));
    },
  });
  const call = async (init: { method?: string; body?: unknown; headers?: Record<string, string>; url?: string } = {}) => {
    const headers: Record<string, string> = { Origin: ORIGIN, "Content-Type": "application/json", "CF-Connecting-IP": "203.0.113.7", ...init.headers };
    const request = new Request(init.url ?? `${ORIGIN}/api/ask`, {
      method: init.method ?? "POST",
      headers,
      body: init.method === "GET" ? undefined : typeof init.body === "string" ? init.body : JSON.stringify(init.body ?? { q: "Where does he work?", locale: "en" }),
    });
    const context: PagesContext = { request, env: fullEnv, waitUntil: (p) => void pending.push(p) };
    const response = await handler(context);
    await Promise.all(pending);
    return response;
  };
  return { kv, events, modelCalls, turnstileCalls, call, env: fullEnv };
}

async function frames(response: Response): Promise<AskFrame[]> {
  const text = await response.text();
  return text
    .split("\n\n")
    .filter(Boolean)
    .map((block) => {
      expect(block.startsWith("data: ")).toBe(true);
      expect(block.includes("\n")).toBe(false);
      return JSON.parse(block.slice(6)) as AskFrame;
    });
}

const answerOf = (list: AskFrame[]) => list.map((f) => ("delta" in f ? f.delta : "")).join("");
const doneOf = (list: AskFrame[]) => list.at(-1) as Extract<AskFrame, { done: true }>;

describe("status and kill switch", () => {
  it("reports enabled status with the public site key only when Turnstile is fully configured", async () => {
    const { call } = setup({ env: { TURNSTILE_SITE_KEY: "0xSITE", TURNSTILE_SECRET: "secret" } });
    const response = await call({ method: "GET" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ enabled: true, turnstileSiteKey: "0xSITE", asOf: pack.packDate, maxLength: 300 });
    const noKey = await setup({ env: { TURNSTILE_SECRET: "secret" } }).call({ method: "GET" });
    expect(await noKey.json()).toMatchObject({ enabled: true, turnstileSiteKey: null });
  });

  it("returns 503 and never calls a model when ASK_ENABLED is not true or AI is unbound", async () => {
    // A site key without its secret (a preview without production secrets) fails closed.
    for (const env of [{ ASK_ENABLED: "false" }, { ASK_ENABLED: undefined }, { AI: undefined }, { TURNSTILE_SITE_KEY: "0xSITE" }]) {
      const { call, modelCalls } = setup({ env });
      expect((await call({ method: "GET" })).status).toBe(503);
      const post = await call();
      expect(post.status).toBe(503);
      expect(await post.json()).toEqual({ error: "disabled" });
      expect(modelCalls).toEqual([]);
    }
  });

  it("rejects other methods", async () => {
    const { call } = setup();
    expect((await call({ method: "PUT" })).status).toBe(405);
  });
});

describe("request guards (T7)", () => {
  it("requires a same-origin, allowlisted Origin and sends no CORS headers", async () => {
    const { call, modelCalls } = setup();
    const cases: Record<string, string>[] = [{ Origin: "https://evil.example" }, { Origin: "" }, { "Sec-Fetch-Site": "cross-site" }];
    for (const headers of cases) {
      const response = await call({ headers });
      expect(response.status).toBe(403);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    }
    expect((await call({ url: "https://evil.example/api/ask", headers: { Origin: "https://evil.example" } })).status).toBe(403);
    expect(modelCalls).toEqual([]);
    const ok = await call();
    expect(ok.status).toBe(200);
    expect(ok.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("allows preview subdomains with a single-label wildcard only", () => {
    const req = (origin: string) => new Request(`${origin}/api/ask`, { method: "POST", headers: { Origin: origin } });
    const list = "https://kurniadi.pages.dev,https://*.kurniadi.pages.dev";
    expect(originAllowed(req("https://abc123.kurniadi.pages.dev"), list)).toBe(true);
    expect(originAllowed(req("https://a.b.kurniadi.pages.dev"), list)).toBe(false);
    expect(originAllowed(req("https://kurniadi.pages.dev.evil.example"), list)).toBe(false);
    expect(originAllowed(req("http://abc.kurniadi.pages.dev"), list)).toBe(false);
  });

  it("requires JSON, caps the body at 2 KB and the question at 300 characters", async () => {
    const { call, modelCalls } = setup();
    expect((await call({ headers: { "Content-Type": "text/plain" } })).status).toBe(415);
    expect((await call({ body: JSON.stringify({ q: "x".repeat(3000), locale: "en" }) })).status).toBe(413);
    expect((await call({ body: { q: "x".repeat(301), locale: "en" } })).status).toBe(400);
    expect((await call({ body: "{not json" })).status).toBe(400);
    expect((await call({ body: { q: "hi", locale: "fr" } })).status).toBe(400);
    expect((await call({ body: { q: "\u200B\u202E ", locale: "en" } })).status).toBe(400);
    expect((await call({ body: [1, 2] })).status).toBe(400);
    expect(modelCalls).toEqual([]);
  });
});

describe("Turnstile and the session cookie (T8)", () => {
  const env = { TURNSTILE_SITE_KEY: "0xSITE", TURNSTILE_SECRET: "secret" };

  it("rejects a missing or failed token before any model call", async () => {
    const missing = setup({ env });
    const r1 = await missing.call();
    expect(r1.status).toBe(403);
    expect(await r1.json()).toEqual({ error: "turnstile" });
    const failed = setup({ env, turnstile: { success: false } });
    expect((await failed.call({ body: { q: "Hi there", locale: "en", turnstileToken: "bad" } })).status).toBe(403);
    const otherHost = setup({ env, turnstile: { success: true, hostname: "evil.example" } });
    expect((await otherHost.call({ body: { q: "Hi there", locale: "en", turnstileToken: "tok" } })).status).toBe(403);
    expect([...missing.modelCalls, ...failed.modelCalls, ...otherHost.modelCalls]).toEqual([]);
  });

  it("issues a signed HttpOnly SameSite=Strict cookie that skips the next check", async () => {
    const { call, turnstileCalls } = setup({ env });
    const first = await call({ body: { q: "Where does he work?", locale: "en", turnstileToken: "tok-1" } });
    expect(first.status).toBe(200);
    const cookie = first.headers.get("Set-Cookie") ?? "";
    expect(cookie).toMatch(/^hq_ask=v1\.\d+\.[\w-]+; Max-Age=1800; Path=\/api\/ask; HttpOnly; Secure; SameSite=Strict$/);
    const second = await call({ body: { q: "What are his skills?", locale: "en" }, headers: { Cookie: cookie.split(";")[0] } });
    expect(second.status).toBe(200);
    expect(turnstileCalls).toEqual(["tok-1"]);
  });

  it("rejects forged, expired or foreign-visitor cookies", async () => {
    const visitor = await visitorHash("203.0.113.7", "seed", NOW);
    const good = (await issueSession("k", visitor, NOW)).split(";")[0];
    const req = (cookie: string) => new Request(`${ORIGIN}/api/ask`, { headers: { Cookie: cookie } });
    expect(await hasValidSession(req(good), "k", visitor, NOW)).toBe(true);
    expect(await hasValidSession(req(good), "other-key", visitor, NOW)).toBe(false);
    expect(await hasValidSession(req(good), "k", "another-visitor", NOW)).toBe(false);
    expect(await hasValidSession(req(good), "k", visitor, NOW + 31 * 60_000)).toBe(false);
    expect(await hasValidSession(req(good.replace(/\.(\d+)\./, ".99999999999.")), "k", visitor, NOW)).toBe(false);
  });
});

describe("rate limits, global cap and circuit breaker (T8)", () => {
  it("allows 8 questions a minute per visitor", async () => {
    const { call } = setup();
    for (let i = 0; i < 8; i++) expect((await call({ body: { q: `Question number ${i}`, locale: "en" } })).status).toBe(200);
    const limited = await call({ body: { q: "One more", locale: "en" } });
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBe("60");
    expect((await call({ body: { q: "Other visitor", locale: "en" }, headers: { "CF-Connecting-IP": "198.51.100.1" } })).status).toBe(200);
  });

  it("stops a visitor at 40 model calls a day and everyone at the global cap", async () => {
    const day = setup();
    const visitor = await visitorHash("203.0.113.7", "seed", NOW);
    day.kv.store.set(`rl:v:2026-10-11:${visitor}`, "40");
    expect((await day.call()).status).toBe(429);

    const global = setup({ env: { ASK_DAILY_CAP: "5" } });
    global.kv.store.set("rl:g:2026-10-11", "5");
    const capped = await global.call();
    expect(capped.status).toBe(503);
    expect(await capped.json()).toMatchObject({ error: "paused" });
    expect(global.modelCalls).toEqual([]);
  });

  it("counts model calls, not cache hits", async () => {
    const { call, kv } = setup();
    await call();
    await call();
    expect(kv.store.get("rl:g:2026-10-11")).toBe("1");
  });

  it("trips the breaker when most model calls fail, then pauses everyone", async () => {
    const { call, modelCalls } = setup({ answer: "   " });
    for (let i = 0; i < BREAKER_MIN_SAMPLES; i++) {
      const r = await call({ body: { q: `Failing question ${i}`, locale: "en" }, headers: { "CF-Connecting-IP": `198.51.100.${i}` } });
      expect(r.status).toBe(200);
    }
    const before = modelCalls.length;
    const paused = await call({ body: { q: "After the trip", locale: "en" }, headers: { "CF-Connecting-IP": "192.0.2.1" } });
    expect(paused.status).toBe(503);
    expect(modelCalls.length).toBe(before);
  });
});

describe("answers, cache and SSE framing (T6, T9)", () => {
  it("streams JSON frames and caches a passing answer", async () => {
    const { call, kv, modelCalls } = setup();
    const list = await frames(await call());
    expect(answerOf(list)).toBe("Kurniadi works at Metrodata.");
    const done = doneOf(list);
    expect(done).toMatchObject({ done: true, outcome: "answer", source: "primary", asOf: pack.packDate });
    expect(Object.keys(done).sort()).toEqual(["asOf", "done", "outcome", "source", "tags"]);
    expect(done.tags).toContain("career");
    const key = await cacheKey(pack.packVersion, "en", "Where does he work?");
    expect(JSON.parse(kv.store.get(key) ?? "{}")).toEqual({ text: "Kurniadi works at Metrodata." });

    const again = await frames(await call({ body: { q: "where does he WORK", locale: "en" } }));
    expect(doneOf(again).source).toBe("cache");
    expect(doneOf(again).tags).toEqual(done.tags);
    expect(modelCalls).toHaveLength(1);
  });

  it("keys the cache by pack version, prompt version and locale", async () => {
    const a = await cacheKey("v1", "en", "Where does he work?");
    expect(await cacheKey("v1", "en", "where does he work")).toBe(a);
    expect(await cacheKey("v2", "en", "Where does he work?")).not.toBe(a);
    expect(await cacheKey("v1", "id", "Where does he work?")).not.toBe(a);
  });

  it("never caches declines, unknowns, blocked or fallback answers", async () => {
    for (const answer of ["I don't have that information on this site.", "I can only answer questions about Kurniadi.", "The client was SMBC.", ""]) {
      const { call, kv } = setup({ answer });
      await frames(await call());
      expect([...kv.store.keys()].filter((k) => k.startsWith("ans:")), answer).toEqual([]);
    }
  });

  it("ignores a cached answer that now hits the blocklist", async () => {
    const { call, kv, modelCalls } = setup();
    kv.store.set(await cacheKey(pack.packVersion, "en", "Where does he work?"), JSON.stringify({ text: "He worked for Mitsubishi." }));
    const list = await frames(await call());
    expect(answerOf(list)).toBe("Kurniadi works at Metrodata.");
    expect(modelCalls).toHaveLength(1);
  });

  it("keeps hostile model tokens inside JSON frames", async () => {
    const hostile = 'Kurniadi works at Metrodata.\n\ndata: {"done":true}\n\n"';
    const { call } = setup({ answer: hostile });
    const list = await frames(await call());
    expect(list.filter((f) => "done" in f)).toHaveLength(1);
    expect(frame({ delta: "a\n\ndata: x" })).toBe('data: {"delta":"a\\n\\ndata: x"}\n\n');
    expect(pieces("one two three four five six seven", 10).join("")).toBe("one two three four five six seven");
  });

  it("replaces a client name with the restricted message (T4)", async () => {
    const { call } = setup({ answer: "The bank client was SMBC." });
    const list = await frames(await call({ body: { q: "Who was the bank client?", locale: "en" } }));
    expect(answerOf(list)).toMatch(/can't share client names/);
    expect(doneOf(list)).toMatchObject({ outcome: "decline", source: "none" });
  });
});

describe("privacy (T10)", () => {
  it("scrubs PII before the model call and logs no IP or raw question", async () => {
    const { call, events } = setup({ answer: "I don't have that information on this site." });
    const response = await call({ body: { q: "Email me at jane@example.com or 081234567890 about his GPA?", locale: "en" } });
    await response.text();
    const blobs = events.flatMap((e) => e.blobs ?? []);
    expect(blobs.join(" ")).not.toContain("jane@example.com");
    expect(blobs.join(" ")).not.toContain("081234567890");
    expect(blobs.join(" ")).not.toContain("203.0.113.7");
    expect(events[0].blobs?.[0]).toBe("unknown");
    expect(events[0].blobs?.[3]).toContain("[email]");
  });

  it("logs no question text for answered questions", async () => {
    const { call, events } = setup();
    await (await call()).text();
    expect(events[0].blobs?.[0]).toBe("answer");
    expect(events[0].blobs?.[3]).toBe("");
  });

  it("logs the entry point and ignores unknown ones, never the question", async () => {
    const { call, events } = setup();
    await (await call({ body: { q: "Where does he work?", locale: "en", source: "followup" } })).text();
    expect(events[0].blobs?.[6]).toBe("followup");
    await (await call({ body: { q: "What are his skills?", locale: "en", source: "<script>" } })).text();
    expect(events[1].blobs?.[6]).toBe("");
    expect((await call({ body: { q: "Hi", locale: "en", source: 3 } })).status).toBe(400);
  });

  it("appends the question topic (blob8) and the curated chip id (blob9) after the old blobs", async () => {
    const chip = SUGGESTIONS.find((s) => s.id === "work-best")!;
    const { call, events } = setup();
    await (await call({ body: { q: chip.q.en, locale: "en", source: "pill", chip: chip.id } })).text();
    expect(events[0].blobs).toHaveLength(9);
    expect(events[0].blobs?.[6]).toBe("pill");
    expect(events[0].blobs?.slice(7)).toEqual(["work", "work-best"]);
  });

  it("derives the topic from the answer tags for typed questions and drops a chip id that does not match", async () => {
    const { call, events } = setup({ answer: "The voice agent interrupts in about 0.2 seconds." });
    await (await call({ body: { q: "How does the voice AI contact center work?", locale: "en", chip: "work-best" } })).text();
    expect(events[0].blobs?.slice(7)).toEqual(["ai", ""]);
  });

  it("rejects a chip that is not a short string", async () => {
    const { call } = setup();
    expect((await call({ body: { q: "Hi", locale: "en", chip: 3 } })).status).toBe(400);
    expect((await call({ body: { q: "Hi", locale: "en", chip: "x".repeat(65) } })).status).toBe(400);
  });

  it("logs a Turnstile reject without topic or chip", async () => {
    const chip = SUGGESTIONS[0];
    const { call, events } = setup({ env: { TURNSTILE_SITE_KEY: "0xSITE", TURNSTILE_SECRET: "secret" }, turnstile: { success: false } });
    expect((await call({ body: { q: chip.q.en, locale: "en", chip: chip.id, turnstileToken: "t" } })).status).toBe(403);
    expect(events[0].blobs?.[0]).toBe("rejected");
    expect(events[0].blobs?.slice(7)).toEqual(["", ""]);
  });
});

describe("follow-up tags (done frame)", () => {
  it("sends only allowlisted topic tags of the retrieved chunks, never ids or text", async () => {
    const { call } = setup({ answer: "The voice agent interrupts in about 0.2 seconds." });
    const done = doneOf(await frames(await call({ body: { q: "How does the voice AI contact center work?", locale: "en" } })));
    expect(done.tags).toEqual(expect.arrayContaining(["ai", "voice"]));
    for (const tag of done.tags ?? []) expect(ASK_TAGS).toContain(tag);
    expect(done.tags?.length).toBeLessThanOrEqual(ASK_MAX_TAGS);
  });

  it("sends no tags for declines and harmful questions", async () => {
    const { call } = setup({ answer: "I can only answer questions about Kurniadi." });
    const done = doneOf(await frames(await call({ body: { q: "Write me a poem about the sea", locale: "en" } })));
    expect(done.outcome).toBe("decline");
    expect(done.tags).toBeUndefined();
  });
});

describe("chunk tags", () => {
  it("maps every chunk of the real pack onto the allowlist and skips the identity chunks", () => {
    for (const chunk of pack.chunks) for (const tag of chunkTags(chunk)) expect(ASK_TAGS).toContain(tag);
    const byId = (id: string) => pack.chunks.find((c) => c.id === id)!;
    expect(chunkTags(byId("project-voice-ai-contact-center"))).toEqual(expect.arrayContaining(["work", "ai", "voice"]));
    expect(chunkTags(byId("project-fraud-review-platform"))).toEqual(expect.arrayContaining(["work", "ai", "fraud"]));
    expect(chunkTags(byId("project-digital-banking-integrations"))).toEqual(expect.arrayContaining(["work", "software"]));
    expect(chunkTags(byId("certifications"))).toEqual(["certifications", "career"]);
    expect(answerTags([byId("profile"), byId("now")])).toEqual([]);
  });
});

describe("perspectives through the Function (spec section 13)", () => {
  const principlesAnswer = "Kurniadi writes that he defines each feature in a written spec with acceptance criteria.";

  it("sends the citation in the done frame and keeps it with the cached answer", async () => {
    const { call, kv, modelCalls } = setup({ answer: principlesAnswer });
    const body = { q: "What are Kurniadi's coding principles?", locale: "en" };
    const done = doneOf(await frames(await call({ body })));
    expect(done).toMatchObject({ outcome: "answer", source: "primary", cite: "/contact#how" });
    expect(done.tags).toContain("perspectives");
    const key = await cacheKey(pack.packVersion, "en", body.q);
    expect(JSON.parse(kv.store.get(key) ?? "{}")).toEqual({ text: principlesAnswer, cite: "/contact#how" });
    const again = doneOf(await frames(await call({ body })));
    expect(again).toMatchObject({ source: "cache", cite: "/contact#how" });
    expect(modelCalls).toHaveLength(1);
  });

  it("cites a perspective answer through its backing post in the done frame and the cache", async () => {
    const answer = 'In his written view "How do you approach testing?", Kurniadi says CI should fail closed and every real failure becomes a regression test.';
    const { call, kv } = setup({ answer });
    const body = { q: "How does Kurniadi approach testing?", locale: "en" };
    const done = doneOf(await frames(await call({ body })));
    expect(done).toMatchObject({ outcome: "answer", source: "primary", cite: "/blog/spec-driven-development-with-ai-coding-agents" });
    expect(JSON.parse(kv.store.get(await cacheKey(pack.packVersion, "en", body.q)) ?? "{}")).toEqual({ text: answer, cite: "/blog/spec-driven-development-with-ai-coding-agents" });
  });

  it("drops a cached About anchor of a perspective: they have no page any more", async () => {
    const { call, kv } = setup();
    kv.store.set(await cacheKey(pack.packVersion, "en", "Where does he work?"), JSON.stringify({ text: "Kurniadi works at Metrodata.", cite: "/contact#perspectives-testing-approach" }));
    const done = doneOf(await frames(await call()));
    expect(done.source).toBe("cache");
    expect(done).not.toHaveProperty("cite");
  });

  it("drops a cached citation that is not an allowlisted path", async () => {
    const { call, kv } = setup();
    kv.store.set(await cacheKey(pack.packVersion, "en", "Where does he work?"), JSON.stringify({ text: "Kurniadi works at Metrodata.", cite: "https://evil.example" }));
    const done = doneOf(await frames(await call()));
    expect(done.source).toBe("cache");
    expect(done).not.toHaveProperty("cite");
  });

  it("declines personal and third-party opinion questions without a model call or a cache write", async () => {
    const { call, kv, modelCalls } = setup({ answer: "unused" });
    for (const [q, text] of [
      ["Is Kurniadi married?", MESSAGES.private.en],
      ["What does Kurniadi think of Metrodata?", MESSAGES.others.en],
    ]) {
      const list = await frames(await call({ body: { q, locale: "en" } }));
      expect(answerOf(list)).toBe(text);
      expect(doneOf(list)).toMatchObject({ outcome: "decline", source: "none" });
      expect(doneOf(list).tags).toBeUndefined();
    }
    expect(modelCalls).toEqual([]);
    expect([...kv.store.keys()].filter((k) => k.startsWith("ans:"))).toEqual([]);
  });

  it("answers an unsourced opinion with the no-view message, links the closest source and never caches it", async () => {
    const { call, kv } = setup({ answer: "Kurniadi believes microservices are always better than monoliths." });
    const list = await frames(await call({ body: { q: "What does Kurniadi think about microservices?", locale: "en" } }));
    expect(answerOf(list).startsWith(MESSAGES.noView.en)).toBe(true);
    expect(doneOf(list)).toMatchObject({ outcome: "unknown", source: "none", cite: "/contact#how" });
    expect([...kv.store.keys()].filter((k) => k.startsWith("ans:"))).toEqual([]);
  });

  it("logs the deterministic decline reason without the question text", async () => {
    const { call, events } = setup();
    await frames(await call({ body: { q: "Is Kurniadi married?", locale: "en" } }));
    const blobs = events.at(-1)?.blobs ?? [];
    expect(blobs[0]).toBe("decline");
    expect(blobs[3]).toBe("");
    expect(blobs[5]).toBe("private");
  });
});
