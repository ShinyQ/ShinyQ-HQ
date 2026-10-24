import { describe, expect, it } from "vitest";
import { capThread, historyFor, loadThread, parseThread, saveThread, THREAD_KEY, THREAD_MAX, type ThreadMessage } from "@/ask/thread";

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

  it("keeps two allowlisted cites and drops forged ones", () => {
    const [two, forged] = parseThread([
      { id: "a", role: "assistant", text: "x", cite: "/contact#how", cites: ["/contact#how", "/labs/clearbox", "/library"] },
      { id: "b", role: "assistant", text: "y", cites: ["//evil.example", "/contact#how"] },
    ]);
    expect(two.cites).toEqual(["/contact#how", "/labs/clearbox"]);
    expect(forged).not.toHaveProperty("cites");
  });
});

describe("thread contact cards", () => {
  it("keeps a valid card and drops a forged one", () => {
    const card = { email: "kurniadiahmadwijaya@gmail.com", linkedin: "https://www.linkedin.com/in/kurniadiwijaya" };
    const [ok, bad] = parseThread([
      { id: "a", role: "assistant", text: "x", contact: card },
      { id: "b", role: "assistant", text: "y", contact: { ...card, linkedin: "https://evil.example/in/x" } },
    ]);
    expect(ok.contact).toEqual(card);
    expect(bad).not.toHaveProperty("contact");
  });
});

describe("thread signatures and history", () => {
  const SIG = "A".repeat(43);
  const sig = (i: number) => `${String(i).padStart(2, "0")}${"B".repeat(41)}`;
  const signed = (i: number, locale: "en" | "id" = "en"): ThreadMessage => ({ ...answer(i), sig: sig(i), sigLocale: locale });

  it("keeps a valid signature and locale and drops malformed ones", () => {
    const [ok, short, badLocale, noLocale] = parseThread([
      { id: "a", role: "assistant", text: "x", sig: SIG, sigLocale: "id" },
      { id: "b", role: "assistant", text: "y", sig: "A".repeat(42), sigLocale: "en" },
      { id: "c", role: "assistant", text: "z", sig: SIG, sigLocale: "fr" },
      { id: "d", role: "assistant", text: "w", sig: "A".repeat(42) + "=" },
    ]);
    expect(ok).toMatchObject({ sig: SIG, sigLocale: "id" });
    expect(short).not.toHaveProperty("sig");
    expect(badLocale).toMatchObject({ sig: SIG });
    expect(badLocale).not.toHaveProperty("sigLocale");
    expect(noLocale).not.toHaveProperty("sig");
  });

  it("returns the last three signed turns, oldest first", () => {
    const list = [1, 2, 3, 4].flatMap((i) => [user(i), signed(i)]);
    expect(historyFor(list, "en")).toEqual([2, 3, 4].map((i) => ({ q: `Question ${i}`, a: `Answer ${i}`, sig: sig(i) })));
    expect(historyFor([], "en")).toEqual([]);
  });

  it("skips unsigned, other-locale and over-long answers", () => {
    const long: ThreadMessage = { ...signed(4), text: "x".repeat(1001) };
    const edge: ThreadMessage = { ...signed(5), text: "y".repeat(1000) };
    const list = [user(1), answer(1), user(2), signed(2, "id"), user(3), signed(3), user(4), long, user(5), edge];
    expect(historyFor(list, "en")).toEqual([
      { q: "Question 3", a: "Answer 3", sig: sig(3) },
      { q: "Question 5", a: "y".repeat(1000), sig: sig(5) },
    ]);
    expect(historyFor(list, "id")).toEqual([{ q: "Question 2", a: "Answer 2", sig: sig(2) }]);
  });

  it("skips an answer not directly preceded by its question", () => {
    const system: ThreadMessage = { id: "s", role: "system", text: "", error: "network" };
    expect(historyFor([user(1), system, signed(1), signed(2), user(3), signed(3)], "en")).toEqual([{ q: "Question 3", a: "Answer 3", sig: sig(3) }]);
  });

  it("sends the question cleaned and capped like askQuestion does", () => {
    const raw: ThreadMessage = { id: "u", role: "user", text: `  Hi\u200B   there ${"q".repeat(400)}` };
    const blank: ThreadMessage = { id: "v", role: "user", text: "\u200B  " };
    const [turn, ...rest] = historyFor([raw, signed(1), blank, signed(2)], "en");
    expect(rest).toEqual([]);
    expect(turn.q).toBe(`Hi there ${"q".repeat(400)}`.slice(0, 300));
    expect(turn.q).toHaveLength(300);
  });
});
