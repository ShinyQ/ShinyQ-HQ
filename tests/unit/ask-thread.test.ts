import { describe, expect, it } from "vitest";
import { capThread, loadThread, parseThread, saveThread, THREAD_KEY, THREAD_MAX, type ThreadMessage } from "@/ask/thread";

const user = (i: number): ThreadMessage => ({ id: `u${i}`, role: "user", text: `Question ${i}` });
const answer = (i: number): ThreadMessage => ({ id: `a${i}`, role: "assistant", text: `Answer ${i}`, outcome: "answer", asOf: "2026-10-11" });

function memory() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

describe("ask thread storage", () => {
  it("keeps the last 20 messages and never starts with an orphan answer", () => {
    const list = Array.from({ length: 15 }, (_, i) => [user(i), answer(i)]).flat();
    const capped = capThread(list);
    expect(capped.length).toBeLessThanOrEqual(THREAD_MAX);
    expect(capped[0].role).toBe("user");
    expect(capped.at(-1)).toEqual(answer(14));
  });

  it("round-trips through storage and clears on an empty thread", () => {
    const store = memory();
    saveThread([user(1), answer(1)], store);
    expect(loadThread(store)).toEqual([user(1), answer(1)]);
    saveThread([], store);
    expect(store.data.has(THREAD_KEY)).toBe(false);
  });

  it("drops malformed entries, unknown fields, bad tags and bad dates from a tampered store", () => {
    const parsed = parseThread([
      { id: "u1", role: "user", text: "Hi", qid: "career-now", html: "<b>x</b>" },
      { id: "a1", role: "assistant", text: "Hello", outcome: "answer", asOf: "Oct 1", tags: ["ai", "<script>"], error: "boom" },
      { id: "x", role: "admin", text: "nope" },
      { role: "user", text: "no id" },
      "junk",
      { id: "s1", role: "system", text: "", error: "rate_limited", retryAfter: 60 },
    ]);
    expect(parsed).toEqual([
      { id: "u1", role: "user", text: "Hi", qid: "career-now" },
      { id: "a1", role: "assistant", text: "Hello", outcome: "answer", tags: ["ai"] },
      { id: "s1", role: "system", text: "", error: "rate_limited", retryAfter: 60 },
    ]);
    expect(parseThread({ not: "a list" })).toEqual([]);
  });

  it("survives broken JSON and unavailable storage", () => {
    const store = memory();
    store.data.set(THREAD_KEY, "{oops");
    expect(loadThread(store)).toEqual([]);
    expect(loadThread(undefined)).toEqual([]);
    const full = { setItem: () => { throw new Error("quota"); }, removeItem: () => {} };
    expect(() => saveThread([user(1)], full)).not.toThrow();
  });
});

describe("thread citations", () => {
  it("keeps a valid citation path and drops a forged one", () => {
    const [ok, bad] = parseThread([
      { id: "a", role: "assistant", text: "x", cite: "/blog/spec-driven-development-with-ai-coding-agents" },
      { id: "b", role: "assistant", text: "y", cite: "//evil.example" },
    ]);
    expect(ok.cite).toBe("/blog/spec-driven-development-with-ai-coding-agents");
    expect(bad).not.toHaveProperty("cite");
  });
});
