import { afterEach, describe, expect, it, vi } from "vitest";
import {
  askQuestion,
  createSseParser,
  fetchAskStatus,
  parseFrame,
  peekAskStatus,
  resetAskClient,
  sanitizeAnswer,
  VERIFIED_MS,
  type AskDeps,
  type FetchFn,
} from "@/ask/client";
import type { AskStatus } from "@/ask/protocol";

const STATUS: AskStatus = { enabled: true, turnstileSiteKey: "site-key", asOf: "2026-10-01", maxLength: 300 };
const encoder = new TextEncoder();

/** A 200 SSE response whose body arrives in the given chunks. */
function sse(chunks: string[]): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

const frame = (value: unknown) => `data: ${JSON.stringify(value)}\n\n`;
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const answer = () => sse([frame({ delta: "Hi" }), frame({ done: true, outcome: "answer", source: "primary", asOf: "2026-10-01" })]);
const bodyOf = (call: unknown[]) => JSON.parse(String((call[1] as RequestInit).body)) as Record<string, unknown>;

function deps(responses: Response[], overrides: Partial<Pick<AskDeps, "now" | "status">> = {}) {
  const fetchMock = vi.fn<FetchFn>(async () => {
    const next = responses.shift();
    if (!next) throw new Error("unexpected fetch");
    return next;
  });
  let n = 0;
  const getToken = vi.fn(async () => `token-${++n}`);
  return { now: () => 1_000_000, status: async () => STATUS, ...overrides, fetch: fetchMock, getToken };
}

afterEach(() => resetAskClient());

describe("SSE parser", () => {
  it("handles frames split across chunks, CRLF and multi-line data", () => {
    const seen: string[] = [];
    const parser = createSseParser((data) => seen.push(data));
    for (const chunk of ['da', 'ta: {"delta":"a', '"}\n', "\n", ": comment\r", "\n", "event: x\r\ndata: one\r\ndata: two\r\n\r\n", "data: tail"]) parser.push(chunk);
    expect(seen).toEqual(['{"delta":"a"}', "one\ntwo"]);
    parser.end();
    expect(seen).toEqual(['{"delta":"a"}', "one\ntwo", "tail"]);
  });

  it("parses known frames and ignores unknown or malformed ones", () => {
    expect(parseFrame('{"delta":"x"}')).toEqual({ delta: "x" });
    expect(parseFrame('{"done":true,"outcome":"decline","source":"cache","asOf":"2026-10-01"}')).toEqual({
      done: true,
      outcome: "decline",
      source: "cache",
      asOf: "2026-10-01",
    });
    expect(parseFrame('{"done":true,"outcome":"weird"}')).toBeNull();
    expect(parseFrame('{"ping":1}')).toBeNull();
    expect(parseFrame("not json")).toBeNull();
    expect(parseFrame("[1]")).toBeNull();
  });

  it("keeps only allowlisted follow-up tags on the done frame", () => {
    expect(parseFrame('{"done":true,"outcome":"answer","source":"primary","asOf":"2026-10-01","tags":["ai","voice","<b>","ai",3]}')).toEqual({
      done: true,
      outcome: "answer",
      source: "primary",
      asOf: "2026-10-01",
      tags: ["ai", "voice"],
    });
    expect(parseFrame('{"done":true,"outcome":"answer","source":"primary","asOf":"2026-10-01","tags":"ai"}')).not.toHaveProperty("tags");
  });

  it("strips control, zero-width and bidi characters", () => {
    expect(sanitizeAnswer("a\u202Eb\u200Bc\u0007d\u2066e\uFEFF\r\nf\tg")).toBe("abcde\nf\tg");
  });
});

describe("askQuestion", () => {
  it("streams sanitized deltas and resolves with the done frame", async () => {
    const d = deps([
      sse(['data: {"delta":"<img src=x onerror=alert(1)>', '"}\n\ndata: {"delta":" ok\\u202E"}\n\n', frame({ unknown: true }), frame({ done: true, outcome: "answer", source: "primary", asOf: "2026-10-01" })]),
    ]);
    const deltas: string[] = [];
    const result = await askQuestion({ q: "  What   now? ", locale: "en", onDelta: (text) => deltas.push(text) }, d);
    expect(result).toEqual({ outcome: "answer", source: "primary", asOf: "2026-10-01" });
    expect(deltas.join("")).toBe("<img src=x onerror=alert(1)> ok");
    const [url, init] = d.fetch.mock.calls[0];
    expect(url).toBe("/api/ask");
    expect(init).toMatchObject({ method: "POST", credentials: "same-origin" });
    expect(new Headers(init?.headers).get("content-type")).toBe("application/json");
    expect(bodyOf(d.fetch.mock.calls[0])).toEqual({ q: "What now?", locale: "en", turnstileToken: "token-1" });
  });

  it("sends the entry point and returns the answer's tags", async () => {
    const d = deps([sse([frame({ delta: "Hi" }), frame({ done: true, outcome: "answer", source: "primary", asOf: "2026-10-01", tags: ["career"] })])]);
    const result = await askQuestion({ q: "Where did he work?", locale: "en", source: "followup", onDelta: () => {} }, d);
    expect(result).toEqual({ outcome: "answer", source: "primary", asOf: "2026-10-01", tags: ["career"] });
    expect(bodyOf(d.fetch.mock.calls[0])).toMatchObject({ q: "Where did he work?", locale: "en", source: "followup" });
  });

  it("sends a curated chip id only when given and short", async () => {
    const d = deps([sse([frame({ done: true, outcome: "answer", source: "primary", asOf: "2026-10-01" })]), sse([frame({ done: true, outcome: "answer", source: "primary", asOf: "2026-10-01" })]), sse([frame({ done: true, outcome: "answer", source: "primary", asOf: "2026-10-01" })])]);
    await askQuestion({ q: "What are his best software projects?", locale: "en", source: "pill", chip: "work-best", onDelta: () => {} }, d);
    expect(bodyOf(d.fetch.mock.calls[0])).toMatchObject({ source: "pill", chip: "work-best" });
    await askQuestion({ q: "Typed?", locale: "en", onDelta: () => {} }, d);
    expect(bodyOf(d.fetch.mock.calls[1])).not.toHaveProperty("chip");
    await askQuestion({ q: "Typed?", locale: "en", chip: "x".repeat(65), onDelta: () => {} }, d);
    expect(bodyOf(d.fetch.mock.calls[2])).not.toHaveProperty("chip");
  });

  it("flags an automated browser (navigator.webdriver) so its questions stay out of the public stats", async () => {
    const done = () => sse([frame({ done: true, outcome: "answer", source: "primary", asOf: "2026-10-01" })]);
    const d = deps([done(), done()]);
    await askQuestion({ q: "Typed?", locale: "en", onDelta: () => {} }, d);
    expect(bodyOf(d.fetch.mock.calls[0])).not.toHaveProperty("auto");
    vi.stubGlobal("navigator", { webdriver: true });
    try {
      await askQuestion({ q: "Typed?", locale: "en", onDelta: () => {} }, d);
    } finally {
      vi.unstubAllGlobals();
    }
    expect(bodyOf(d.fetch.mock.calls[1])).toMatchObject({ q: "Typed?", auto: true });
  });

  it("reports a stream that ends without a done frame", async () => {
    const d = deps([sse([frame({ delta: "half" })])]);
    expect(await askQuestion({ q: "hi there", locale: "en", onDelta: () => {} }, d)).toEqual({ error: "stream" });
  });

  it("retries once with a fresh token on 403 turnstile", async () => {
    const d = deps([json(403, { error: "turnstile" }), answer()]);
    const result = await askQuestion({ q: "hello", locale: "id", onDelta: () => {} }, d);
    expect(result).toMatchObject({ outcome: "answer" });
    expect(d.fetch).toHaveBeenCalledTimes(2);
    expect(bodyOf(d.fetch.mock.calls[0]).turnstileToken).toBe("token-1");
    expect(bodyOf(d.fetch.mock.calls[1]).turnstileToken).toBe("token-2");
  });

  it("does not retry a second time", async () => {
    const d = deps([json(403, { error: "turnstile" }), json(403, { error: "turnstile" })]);
    expect(await askQuestion({ q: "hello", locale: "en", onDelta: () => {} }, d)).toEqual({ error: "turnstile" });
    expect(d.fetch).toHaveBeenCalledTimes(2);
  });

  it("does not retry other 403s", async () => {
    const d = deps([json(403, { error: "forbidden" })]);
    expect(await askQuestion({ q: "hello", locale: "en", onDelta: () => {} }, d)).toEqual({ error: "forbidden" });
    expect(d.fetch).toHaveBeenCalledTimes(1);
  });

  it("skips the token while the session cookie is fresh, and gets one again on 403", async () => {
    let now = 1_000_000;
    const d = deps([answer(), answer(), json(403, { error: "turnstile" }), answer(), answer()], { now: () => now });
    await askQuestion({ q: "one", locale: "en", onDelta: () => {} }, d);
    now += 60_000;
    await askQuestion({ q: "two", locale: "en", onDelta: () => {} }, d);
    expect(bodyOf(d.fetch.mock.calls[1])).not.toHaveProperty("turnstileToken");
    await askQuestion({ q: "three", locale: "en", onDelta: () => {} }, d);
    expect(bodyOf(d.fetch.mock.calls[2])).not.toHaveProperty("turnstileToken");
    expect(bodyOf(d.fetch.mock.calls[3]).turnstileToken).toBe("token-2");
    now += VERIFIED_MS + 1;
    await askQuestion({ q: "four", locale: "en", onDelta: () => {} }, d);
    expect(bodyOf(d.fetch.mock.calls[4]).turnstileToken).toBe("token-3");
  });

  it("never asks for a token without a site key", async () => {
    const d = deps([answer()], { status: async () => ({ ...STATUS, turnstileSiteKey: null }) });
    await askQuestion({ q: "hello", locale: "en", onDelta: () => {} }, d);
    expect(d.getToken).not.toHaveBeenCalled();
    expect(bodyOf(d.fetch.mock.calls[0])).toEqual({ q: "hello", locale: "en" });
  });

  it("maps 429, 503 and network errors", async () => {
    expect(await askQuestion({ q: "a b", locale: "en", onDelta: () => {} }, deps([json(429, { error: "rate_limited", retryAfter: 42 })]))).toEqual({
      error: "rate_limited",
      retryAfter: 42,
    });
    expect(await askQuestion({ q: "a b", locale: "en", onDelta: () => {} }, deps([json(503, { error: "paused" })]))).toEqual({ error: "paused" });
    expect(await askQuestion({ q: "a b", locale: "en", onDelta: () => {} }, deps([json(503, {})]))).toEqual({ error: "disabled" });
    expect(await askQuestion({ q: "a b", locale: "en", onDelta: () => {} }, deps([]))).toEqual({ error: "network" });
  });

  it("returns disabled without posting when the feature is off", async () => {
    const d = deps([], { status: async () => null });
    expect(await askQuestion({ q: "hello", locale: "en", onDelta: () => {} }, d)).toEqual({ error: "disabled" });
    expect(d.fetch).not.toHaveBeenCalled();
  });
});

describe("fetchAskStatus", () => {
  it("caches one request per page load", async () => {
    const fetchMock = vi.fn<FetchFn>(async () => json(200, STATUS));
    expect(peekAskStatus()).toBeUndefined();
    expect(await fetchAskStatus(fetchMock)).toEqual(STATUS);
    expect(await fetchAskStatus(fetchMock)).toEqual(STATUS);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(peekAskStatus()).toEqual(STATUS);
  });

  it("treats 404, 503, bad bodies and network errors as unavailable", async () => {
    for (const make of [() => json(404, {}), () => json(503, { error: "disabled" }), () => json(200, { enabled: "yes" })]) {
      resetAskClient();
      expect(await fetchAskStatus(async () => make())).toBeNull();
    }
    resetAskClient();
    expect(await fetchAskStatus(async () => Promise.reject(new Error("offline")))).toBeNull();
    expect(peekAskStatus()).toBeNull();
  });
});

describe("done frame citation", () => {
  const done = (cite: unknown) => parseFrame(JSON.stringify({ done: true, outcome: "answer", source: "primary", asOf: "2026-10-12", cite }));

  it("keeps an allowlisted Page View path", () => {
    expect(done("/blog/spec-driven-development-with-ai-coding-agents")).toMatchObject({ cite: "/blog/spec-driven-development-with-ai-coding-agents" });
    expect(done("/labs/ai-solutions-assistant")).toMatchObject({ cite: "/labs/ai-solutions-assistant" });
    expect(done("/contact#how")).toMatchObject({ cite: "/contact#how" });
  });

  it("drops anything else", () => {
    for (const cite of ["https://evil.example", "//evil.example", "javascript:alert(1)", '/contact#how"><img src=x>', "/contact#perspectives-spec-before-code", "/labs/", 42, null]) {
      expect(done(cite), String(cite)).not.toHaveProperty("cite");
    }
  });

  it("keeps up to two allowlisted cites and drops forged ones (owner decision 2026-10-24)", () => {
    const frame = (cites: unknown) => parseFrame(JSON.stringify({ done: true, outcome: "answer", source: "primary", asOf: "2026-10-24", cite: "/contact#how", cites }));
    expect(frame(["/contact#how", "/blog/spec-driven-development-with-ai-coding-agents"])).toMatchObject({ cites: ["/contact#how", "/blog/spec-driven-development-with-ai-coding-agents"] });
    expect(frame(["/contact#how", "//evil.example", "/labs/clearbox", "/library"])).toMatchObject({ cites: ["/contact#how", "/labs/clearbox"] });
    for (const bad of [["//evil.example"], ["/contact#how"], "nope", 42]) expect(frame(bad), JSON.stringify(bad)).not.toHaveProperty("cites");
  });
});

describe("done frame contact card (lead intent)", () => {
  const done = (contact: unknown) => parseFrame(JSON.stringify({ done: true, outcome: "answer", source: "primary", asOf: "2026-10-15", contact }));
  const good = { email: "kurniadiahmadwijaya@gmail.com", linkedin: "https://www.linkedin.com/in/kurniadiwijaya" };

  it("keeps a valid email and LinkedIn profile, and only those two fields", () => {
    expect(done({ ...good, extra: "x" })).toMatchObject({ contact: good });
    expect(done(good)).toHaveProperty("contact", good);
  });

  it("drops a forged card", () => {
    for (const contact of [{ email: good.email }, { ...good, linkedin: "javascript:alert(1)" }, { ...good, linkedin: "https://evil.example/in/x" }, { ...good, email: "x@y.co<img>" }, "mailto:x@y.co", null]) {
      expect(done(contact), JSON.stringify(contact)).not.toHaveProperty("contact");
    }
  });
});

describe("signed multi-turn history", () => {
  const SIG = "Ab_-".repeat(10) + "xyz";
  const done = (sig: unknown) => parseFrame(JSON.stringify({ done: true, outcome: "answer", source: "primary", asOf: "2026-10-17", sig }));
  const signedAnswer = () => sse([frame({ delta: "Hi" }), frame({ done: true, outcome: "answer", source: "primary", asOf: "2026-10-17", sig: SIG })]);
  const turn = (i: number) => ({ q: `Question ${i}`, a: `Answer ${i}`, sig: SIG });

  it("keeps a valid signature on the done frame and drops an invalid one", () => {
    expect(SIG).toHaveLength(43);
    expect(done(SIG)).toHaveProperty("sig", SIG);
    for (const sig of ["A".repeat(42), "A".repeat(44), `${"A".repeat(42)}=`, `${"A".repeat(42)}+`, 42, null]) {
      expect(done(sig), String(sig)).not.toHaveProperty("sig");
    }
  });

  it("returns the answer's signature", async () => {
    const result = await askQuestion({ q: "Where does he work?", locale: "en", onDelta: () => {} }, deps([signedAnswer()]));
    expect(result).toEqual({ outcome: "answer", source: "primary", asOf: "2026-10-17", sig: SIG });
    expect(await askQuestion({ q: "Where does he work?", locale: "en", onDelta: () => {} }, deps([answer()]))).not.toHaveProperty("sig");
  });

  it("posts history only when there is some, at most three turns", async () => {
    const d = deps([answer(), answer(), answer()]);
    await askQuestion({ q: "And before that?", locale: "en", history: [turn(1)], onDelta: () => {} }, d);
    expect(bodyOf(d.fetch.mock.calls[0])).toMatchObject({ q: "And before that?", history: [turn(1)] });
    await askQuestion({ q: "Fresh question", locale: "en", history: [], onDelta: () => {} }, d);
    expect(bodyOf(d.fetch.mock.calls[1])).not.toHaveProperty("history");
    await askQuestion({ q: "Long thread", locale: "en", history: [1, 2, 3, 4].map(turn), onDelta: () => {} }, d);
    expect(bodyOf(d.fetch.mock.calls[2]).history).toEqual([2, 3, 4].map(turn));
  });
});
