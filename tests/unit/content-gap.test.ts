import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { formatPrivateQuestions, formatReport, groupQuestions, parseSqlRows, QUERIES, QUESTIONS_QUERY, sanitizeForIssue, weekOf } from "../../scripts/content-gap";

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
  it("formats totals, cache ratio and unanswered counts by topic, never question text (S8)", () => {
    const md = formatReport({
      weekOf: "2026-10-12",
      topics: [
        { key: "work", n: 3 },
        { key: "", n: 1 },
        { key: "<script>", n: 1 },
      ],
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
    });
    expect(md).toContain("10 questions, 4 unanswered (40%), cache hit ratio 50%");
    expect(md).toContain("## Unanswered questions by topic");
    expect(md).toContain("| work | 3 |");
    expect(md).toContain("| (no topic) | 2 |");
    expect(md).not.toContain("<script>");
    expect(md).not.toMatch(/Question \(scrubbed\)/);
    expect(md).toContain("| rejected | 3 | 23% |");
    expect(md).toContain("| turnstile | 3 |");
    expect(md).not.toMatch(/\u2014/);
  });

  it("lists the UI entry points, keeping only plain keys", () => {
    const md = formatReport({
      weekOf: "2026-10-12",
      topics: [],
      outcomes: [{ key: "answer", n: 10 }],
      sources: [],
      entries: [{ key: "pill", n: 6 }, { key: "hero", n: 3 }, { key: "", n: 1 }, { key: "<x>", n: 0 }],
    });
    expect(md).toContain("## Entry points");
    expect(md).toContain("| pill | 6 | 60% |");
    expect(md).toContain("| (none) | 1 | 10% |");
    expect(md).not.toContain("<x>");
  });

  it("says so when nothing was unanswered", () => {
    expect(formatReport({ weekOf: "2026-10-12", topics: [], outcomes: [], sources: [] })).toContain("None this week.");
  });

  it("refuses to print question text in GitHub Actions, before any query", () => {
    const run = spawnSync("bun", ["scripts/content-gap.ts", "--questions"], {
      encoding: "utf8",
      env: { ...process.env, GITHUB_ACTIONS: "true", GITHUB_OUTPUT: "", CF_EVAL_TOKEN: "not-a-token", CF_ACCOUNT_ID: "0".repeat(32) },
    });
    expect(run.status).toBe(1);
    expect(run.stdout).toContain("never in CI");
  });

  it("formats the owner-only question table with the second scrub", () => {
    const md = formatPrivateQuestions([{ question: "who is @someone | ok", normalized: "x", count: 4 }], []);
    expect(md).toContain("| 1 | 4 | `who is @someone / ok` |");
    expect(formatPrivateQuestions([], [])).toContain("No unanswered questions");
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
    for (const q of [...Object.values(QUERIES), QUESTIONS_QUERY]) expect(q).toMatch(/FROM ask_events WHERE .*INTERVAL '7' DAY/);
    expect(QUESTIONS_QUERY).toContain("blob1 = 'unknown'");
    // The public report never selects the question text (blob4).
    for (const q of Object.values(QUERIES)) expect(q).not.toMatch(/blob4/);
    expect(QUERIES.topics).toContain("blob8 AS key");
  });
});
