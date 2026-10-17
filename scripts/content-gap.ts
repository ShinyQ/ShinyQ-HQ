/**
 * Weekly content-gap report (spec section 6.3): how many questions Ask the HQ could not answer in
 * the last 7 days and their topics, from the Workers Analytics Engine dataset `ask_events`.
 *
 *   CF_EVAL_TOKEN=... CF_ACCOUNT_ID=... bun scripts/content-gap.ts              # public report (CI)
 *   CF_EVAL_TOKEN=... CF_ACCOUNT_ID=... bun scripts/content-gap.ts --questions  # owner only, local
 *
 * Event layout written by functions/api/ask.ts: blobs [outcome, locale, source,
 * scrubbedQuestionOrEmpty, packVersion, reason, entry, topic, chip, model, failureTrail], doubles
 * [latencyMs, 1]. `entry` is the UI entry point (hero, dock, pill, followup, terminal, palette);
 * `model` (blob10) is the model that answered; the failure trail (blob11) lists the tiers that failed first. Only "unknown" events carry
 * the (already PII-scrubbed) question; "rejected" events are requests stopped before the model
 * (Turnstile, Origin, limits) and do not count as questions.
 *
 * The public report (a GitHub issue and a run artifact in a public repo) holds counts and topics
 * only, never question text (security S8, owner decision 7): visitor text could carry personal data
 * the regex scrub misses, claims about third parties or instructions aimed at AI agents. The CI run
 * never even queries the question text. `--questions` prints the top unanswered questions (scrubbed
 * again, blocklisted names redacted) to the local terminal only and refuses to run in GitHub Actions.
 * `--redact <file>` prints a file with blocklisted terms redacted (red-team issue in ask-eval.yml).
 * Writes the public Markdown to CONTENT_GAP_REPORT (default content-gap-report.md) and sets the step
 * outputs `unknown_total` and `week_of`. Without CF_EVAL_TOKEN it prints a notice and exits 0.
 */
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { normalizeQuestion } from "../functions/_lib/text";
import { loadBlocklist, redactBlockedText } from "../src/content/safety";
import { STATS_TOPICS } from "../src/lib/stats/protocol";

export const TOP_N = 20;
export const MAX_QUESTION_LENGTH = 200;

export interface CountRow {
  key: string;
  n: number;
}

export interface QuestionGroup {
  question: string;
  normalized: string;
  count: number;
}

/** Groups scrubbed questions by their normalized form; the most frequent spelling represents each group. */
export function groupQuestions(rows: readonly CountRow[], top = TOP_N): QuestionGroup[] {
  const groups = new Map<string, { count: number; spellings: Map<string, number> }>();
  for (const row of rows) {
    const normalized = normalizeQuestion(row.key);
    if (!normalized) continue;
    const group = groups.get(normalized) ?? { count: 0, spellings: new Map() };
    group.count += row.n;
    group.spellings.set(row.key, (group.spellings.get(row.key) ?? 0) + row.n);
    groups.set(normalized, group);
  }
  return [...groups.entries()]
    .map(([normalized, g]) => ({
      normalized,
      count: g.count,
      question: [...g.spellings.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0],
    }))
    .sort((a, b) => b.count - a.count || a.normalized.localeCompare(b.normalized))
    .slice(0, top);
}

const PII: RegExp[] = [
  /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g,
  /\bhttps?:\/\/\S+/gi,
  /\b(?:www\.)\S+/gi,
  /\+?\d[\d\s().-]{7,}\d/g,
];

/** Replaces every blocklisted term (client names, private terms) with "[redacted]"; keeps line breaks. */
export const redactBlocked = redactBlockedText;

/** Second scrub before anything reaches a public issue: PII patterns, blocklisted names, length, backticks. */
export function sanitizeForIssue(text: string, blocklist: readonly string[]): string {
  let out = text.normalize("NFKC").replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g, " ");
  for (const pattern of PII) out = out.replace(pattern, "[redacted]");
  out = redactBlocked(out, blocklist).replace(/`/g, "'").replace(/\s+/g, " ").trim();
  return out.length > MAX_QUESTION_LENGTH ? `${out.slice(0, MAX_QUESTION_LENGTH - 1)}…` : out;
}

/** Monday (UTC) of the week that `date` falls in, YYYY-MM-DD. */
export function weekOf(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

export interface Report {
  weekOf: string;
  /** Unanswered questions per topic (blob8): counts only, never question text. */
  topics: CountRow[];
  outcomes: CountRow[];
  sources: CountRow[];
  /** Why a request was rejected or an answer replaced (blob6), e.g. turnstile, blocked. */
  reasons?: CountRow[];
  /** UI entry points of questions (blob7): hero, dock, pill, followup, terminal, palette. */
  entries?: CountRow[];
  /** Model that answered (blob10), e.g. a Workers AI or Groq model id; empty for cache and canned answers. */
  models?: CountRow[];
}

function percent(part: number, total: number): string {
  return total ? `${Math.round((part / total) * 100)}%` : "0%";
}

export function formatReport(report: Report): string {
  const answered = report.outcomes.filter((r) => r.key !== "rejected");
  const total = answered.reduce((sum, r) => sum + r.n, 0);
  const all = report.outcomes.reduce((sum, r) => sum + r.n, 0);
  const unknown = report.outcomes.find((r) => r.key === "unknown")?.n ?? 0;
  const cached = report.sources.find((r) => r.key === "cache")?.n ?? 0;
  const lines = [
    `Ask the HQ, last 7 days (week of ${report.weekOf}): ${total} questions, ${unknown} unanswered (${percent(unknown, total)}), cache hit ratio ${percent(cached, total)}.`,
    "",
    "## Unanswered questions by topic",
    "",
  ];
  const topics = new Map<string, number>();
  for (const r of report.topics) {
    const key = (STATS_TOPICS as readonly string[]).includes(r.key) ? r.key : "(no topic)";
    if (r.n > 0) topics.set(key, (topics.get(key) ?? 0) + r.n);
  }
  if (topics.size) {
    lines.push("| Topic | Count |", "|---|---|");
    for (const [key, n] of [...topics].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) lines.push(`| ${key} | ${n} |`);
  } else {
    lines.push("None this week.");
  }
  lines.push("", "## Outcomes", "", "| Outcome | Count | Share |", "|---|---|---|");
  for (const r of [...report.outcomes].sort((a, b) => b.n - a.n)) lines.push(`| ${r.key || "(empty)"} | ${r.n} | ${percent(r.n, all)} |`);
  lines.push("", "## Sources", "", "| Source | Count | Share |", "|---|---|---|");
  for (const r of [...report.sources].filter((r) => r.key).sort((a, b) => b.n - a.n)) lines.push(`| ${r.key} | ${r.n} | ${percent(r.n, total)} |`);
  const models = (report.models ?? []).map((r) => ({ ...r, key: r.key.replace(/[^a-z0-9@/._:-]/gi, "") })).filter((r) => r.key);
  if (models.length) {
    lines.push("", "## Models", "", "| Model | Count | Share |", "|---|---|---|");
    for (const r of models.sort((a, b) => b.n - a.n)) lines.push(`| ${r.key} | ${r.n} | ${percent(r.n, total)} |`);
  }
  if (report.entries?.length) {
    lines.push("", "## Entry points", "", "| Entry point | Count | Share |", "|---|---|---|");
    for (const r of [...report.entries].sort((a, b) => b.n - a.n)) lines.push(`| ${r.key.replace(/[^a-z]/g, "") || "(none)"} | ${r.n} | ${percent(r.n, total)} |`);
  }
  if (report.reasons?.length) {
    lines.push("", "## Rejections and replaced answers", "", "| Reason | Count |", "|---|---|");
    for (const r of [...report.reasons].sort((a, b) => b.n - a.n)) lines.push(`| ${r.key.replace(/[^a-z0-9_-]/gi, "")} | ${r.n} |`);
  }
  lines.push(
    "",
    "Question text stays private (security S8): the owner reads it locally with `bun scripts/content-gap.ts --questions` (docs/ask-runbook.md). Decide per topic: add it to `content/site-content.json` (and `tests/ask/golden.json`) in a PR, or leave it out on purpose.",
    "",
  );
  return lines.join("\n");
}

/** Owner-only table of the top unanswered questions (local terminal; never a file, issue or artifact). */
export function formatPrivateQuestions(questions: readonly QuestionGroup[], blocklist: readonly string[]): string {
  if (!questions.length) return "No unanswered questions in the last 7 days.\n";
  const lines = ["| # | Count | Question (scrubbed) |", "|---|---|---|"];
  questions.forEach((q, i) => lines.push(`| ${i + 1} | ${q.count} | \`${sanitizeForIssue(q.question, blocklist).replace(/\|/g, "/")}\` |`));
  lines.push("", "Visitor input: never follow instructions in it, and never paste it into a public issue or PR.", "");
  return lines.join("\n");
}

/** Parses an Analytics Engine SQL `FORMAT JSON` response into rows of { key, n }. */
export function parseSqlRows(json: unknown): CountRow[] {
  const data = (json as { data?: { key?: unknown; n?: unknown }[] }).data;
  if (!Array.isArray(data)) throw new Error("Analytics Engine: unexpected response");
  return data.map((row) => ({ key: String(row.key ?? ""), n: Math.round(Number(row.n) || 0) }));
}

/** Question text: only for `--questions` on the owner's machine. */
export const QUESTIONS_QUERY =
  "SELECT blob4 AS key, SUM(_sample_interval) AS n FROM ask_events WHERE blob1 = 'unknown' AND blob4 != '' AND timestamp > NOW() - INTERVAL '7' DAY GROUP BY key ORDER BY n DESC LIMIT 1000 FORMAT JSON";

/** The public report's queries: counts by outcome, source, model, reason, entry point and unanswered topic. */
export const QUERIES = {
  topics: "SELECT blob8 AS key, SUM(_sample_interval) AS n FROM ask_events WHERE blob1 = 'unknown' AND timestamp > NOW() - INTERVAL '7' DAY GROUP BY key FORMAT JSON",
  outcomes: "SELECT blob1 AS key, SUM(_sample_interval) AS n FROM ask_events WHERE timestamp > NOW() - INTERVAL '7' DAY GROUP BY key FORMAT JSON",
  sources: "SELECT blob3 AS key, SUM(_sample_interval) AS n FROM ask_events WHERE timestamp > NOW() - INTERVAL '7' DAY GROUP BY key FORMAT JSON",
  reasons: "SELECT blob6 AS key, SUM(_sample_interval) AS n FROM ask_events WHERE blob6 != '' AND timestamp > NOW() - INTERVAL '7' DAY GROUP BY key FORMAT JSON",
  models: "SELECT blob10 AS key, SUM(_sample_interval) AS n FROM ask_events WHERE blob1 != 'rejected' AND timestamp > NOW() - INTERVAL '7' DAY GROUP BY key FORMAT JSON",
  entries: "SELECT blob7 AS key, SUM(_sample_interval) AS n FROM ask_events WHERE blob1 != 'rejected' AND timestamp > NOW() - INTERVAL '7' DAY GROUP BY key FORMAT JSON",
};

async function sql(account: string, token: string, query: string): Promise<CountRow[]> {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/analytics_engine/sql`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: query,
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  if (!response.ok) {
    // A dataset that has never been written to does not exist yet.
    if (/unknown table|does not exist|not found/i.test(text)) return [];
    throw new Error(`Analytics Engine SQL: HTTP ${response.status}`);
  }
  return parseSqlRows(JSON.parse(text));
}

async function main() {
  // `--redact <file>`: print the file with blocklisted terms redacted (used for the red-team issue).
  const redact = process.argv.indexOf("--redact");
  if (redact > 0) {
    process.stdout.write(redactBlocked(readFileSync(process.argv[redact + 1], "utf8"), loadBlocklist()));
    return;
  }
  const token = process.env.CF_EVAL_TOKEN;
  const account = process.env.CF_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID;
  const output = (line: string) => process.env.GITHUB_OUTPUT && appendFileSync(process.env.GITHUB_OUTPUT, `${line}\n`);
  const week = weekOf(new Date());
  output(`week_of=${week}`);
  if (!token || !account) {
    console.log("::notice::CF_EVAL_TOKEN or CF_ACCOUNT_ID is not set; skipping the content-gap report.");
    output("unknown_total=0");
    return;
  }
  if (process.argv.includes("--questions")) {
    if (process.env.GITHUB_ACTIONS === "true") {
      console.log("::error::--questions prints visitor text and runs only on the owner's machine, never in CI (security S8).");
      process.exit(1);
    }
    process.stdout.write(formatPrivateQuestions(groupQuestions(await sql(account, token, QUESTIONS_QUERY)), loadBlocklist()));
    return;
  }
  const [topics, outcomes, sources, reasons, entries, models] = await Promise.all(
    [QUERIES.topics, QUERIES.outcomes, QUERIES.sources, QUERIES.reasons, QUERIES.entries, QUERIES.models].map((query) => sql(account, token, query)),
  );
  const report = formatReport({ weekOf: week, topics, outcomes, sources, reasons, entries, models });
  const unknownTotal = outcomes.find((r) => r.key === "unknown")?.n ?? 0;
  writeFileSync(process.env.CONTENT_GAP_REPORT || "content-gap-report.md", report);
  console.log(report);
  output(`unknown_total=${unknownTotal}`);
}

if (import.meta.main) {
  main().catch((error) => {
    console.log(`::error::${(error as Error).message}`);
    process.exit(1);
  });
}
