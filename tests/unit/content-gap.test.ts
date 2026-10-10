import { describe, expect, it } from "vitest";
import { formatReport, groupQuestions, parseSqlRows, QUERIES, sanitizeForIssue, weekOf } from "../../scripts/content-gap";

describe("groupQuestions", () => {
  it("merges spellings by normalized text and keeps the most common one", () => {
    const groups = groupQuestions([
      { key: "Does he know Rust?", n: 3 },
      { key: "does he know rust", n: 5 },
      { key: "Apa hobinya?", n: 2 },
      { key: "   ", n: 9 },
    ]);
    expect(groups).toEqual([
      { normalized: "does he know rust", count: 8, question: "does he know rust" },
      { normalized: "apa hobinya", count: 2, question: "Apa hobinya?" },
    ]);
  });

  it("caps the list", () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({ key: `question ${i}`, n: 30 - i }));
    expect(groupQuestions(rows)).toHaveLength(20);
    expect(groupQuestions(rows, 3).map((g) => g.count)).toEqual([30, 29, 28]);
  });
});

describe("sanitizeForIssue", () => {
  it("scrubs PII, links, backticks and blocklisted names", () => {
    const out = sanitizeForIssue("mail me at a.b@example.com or +62 812 3456 7890, see https://x.y/z `code` about Acme Bank", ["Acme Bank", "/Sec[a-z]+/"]);
    expect(out).toBe("mail me at [redacted] or [redacted], see [redacted] 'code' about [redacted]");
    expect(sanitizeForIssue("Secret plans", ["/Sec[a-z]+/"])).toBe("[redacted] plans");
  });

  it("strips invisible characters and caps length", () => {
    expect(sanitizeForIssue("a\u200Bb\u202Ec", [])).toBe("a b c");
    expect(sanitizeForIssue("x".repeat(500), []).length).toBe(200);
  });
});

describe("report", () => {
  it("formats totals, cache ratio and a safe table", () => {
    const md = formatReport({
      weekOf: "2026-10-12",
      questions: [{ question: "who is @someone | ok", normalized: "x", count: 4 }],
      outcomes: [
        { key: "answer", n: 6 },
        { key: "unknown", n: 4 },
        { key: "rejected", n: 3 },
      ],
      sources: [
        { key: "cache", n: 5 },
        { key: "primary", n: 5 },
        { key: "", n: 3 },
      ],
      reasons: [{ key: "turnstile", n: 3 }],
      blocklist: [],
    });
    expect(md).toContain("10 questions, 4 unanswered (40%), cache hit ratio 50%");
    expect(md).toContain("| 1 | 4 | `who is @someone / ok` |");
    expect(md).toContain("| rejected | 3 | 23% |");
    expect(md).toContain("| turnstile | 3 |");
    expect(md).not.toMatch(/\u2014/);
  });

  it("says so when nothing was unanswered", () => {
    expect(formatReport({ weekOf: "2026-10-12", questions: [], outcomes: [], sources: [], blocklist: [] })).toContain("None this week.");
  });

  it("finds the Monday of the week", () => {
    expect(weekOf(new Date("2026-10-11T20:00:00Z"))).toBe("2026-10-05");
    expect(weekOf(new Date("2026-10-12T00:00:00Z"))).toBe("2026-10-12");
  });

  it("parses SQL rows and queries only the last 7 days of ask_events", () => {
    expect(parseSqlRows({ data: [{ key: "unknown", n: "3" }, { key: null, n: 1 }] })).toEqual([
      { key: "unknown", n: 3 },
      { key: "", n: 1 },
    ]);
    expect(() => parseSqlRows({})).toThrow();
    for (const q of Object.values(QUERIES)) expect(q).toMatch(/FROM ask_events WHERE .*INTERVAL '7' DAY/);
    expect(QUERIES.questions).toContain("blob1 = 'unknown'");
  });
});
