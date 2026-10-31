/**
 * Weekly content-gap report (spec section 6.3): how many questions Ask the HQ could not answer in
 * the last 7 days and their topics, from the Workers Analytics Engine dataset `ask_events`.
 *
 *   CF_EVAL_TOKEN=... CF_ACCOUNT_ID=... bun scripts/content-gap.ts              # public report (CI)
 *   CF_EVAL_TOKEN=... CF_ACCOUNT_ID=... bun scripts/content-gap.ts --questions  # owner only, local
 *
 * Event layout written by functions/api/ask.ts: blobs [outcome, locale, source,
 * scrubbedQuestionOrEmpty, packVersion, reason, entry, topic, chip, model, failureTrail, packTier, auto, route, retrieval,
 * overRefused], doubles
 * [latencyMs, 1]. `entry` is the UI entry point (hero, dock, pill, followup, terminal, palette);
 * `model` (blob10) is the model that answered; the failure trail (blob11) lists the tiers that failed first; the pack tier
 * (blob12) is where the knowledge pack came from (memory, kv, pin, fallback; empty before the KV pack). The route (blob14) is
 * the deterministic route (approach, civic, policy, lifestyle, mentoring, team, adjacent, lead, default, "+partial" for a mixed
 * question), the retrieval (blob15) bm25 or hybrid, and blob16 is "match" for a declined question that retrieval would
 * have answered with a strong match (an over-refusal candidate). Only "unknown" and "decline" events carry the (already
 * PII-scrubbed) question (owner decision 2026-10-24); "rejected" events are requests stopped before the model
 * (Turnstile, Origin, limits) and do not count as questions.
 *
 * The public report (a GitHub issue and a run artifact in a public repo) holds counts and topics
 * only, never question text (security S8, owner decision 7): visitor text could carry personal data
 * the regex scrub misses, claims about third parties or instructions aimed at AI agents. The CI run
 * never even queries the question text. `--questions` prints the top unanswered questions (scrubbed
 * again) to the local terminal only and refuses to run in GitHub Actions.
 * Writes the public Markdown to CONTENT_GAP_REPORT (default content-gap-report.md) and sets the step
 * outputs `unknown_total` and `week_of`. Without CF_EVAL_TOKEN it prints a notice and exits 0.
 */
import { appendFileSync, writeFileSync } from "node:fs";
import { normalizeQuestion } from "../functions/_lib/text";
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

/** Second scrub before anything reaches a public issue: PII patterns, length, backticks. */
export function sanitizeForIssue(text: string): string {
  let out = text.normalize("NFKC").replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/g, " ");
  for (const pattern of PII) out = out.replace(pattern, "[redacted]");
  out = out.replace(/`/g, "'").replace(/\s+/g, " ").trim();
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
  /** Knowledge pack tier that served (blob12): memory, kv, pin, fallback. `pin` or `fallback` means KV is degraded. */
  tiers?: CountRow[];
  /** Declined questions retrieval would have answered with a strong match (blob16 "match"), by reason (blob6): counts only. */
  overRefused?: CountRow[];
  /** Deterministic routes of model answers (blob14). */
  routes?: CountRow[];
  /** Retrieval of model answers (blob15): bm25 or hybrid. */
  retrieval?: CountRow[];
  /** Failure trails (blob11, `model:reason > model:reason`): only the first tier's reason is published. */
  trails?: CountRow[];
}

/** The model chain's attempt failures (`AttemptFailure` in functions/_lib/model.ts); anything else is published as "other". */
const FAILURE_REASONS: ReadonlySet<string> = new Set(["error", "first_token_timeout", "total_timeout", "empty", "quota", "rate_limited", "unavailable", "auth", "breaker_open", "deadline"]);

/** Questions whose first model tier failed, by that tier's reason (`quota`, `breaker_open`, `first_token_timeout`, ...). */
export function primaryFailures(trails: readonly CountRow[]): CountRow[] {
  const counts = new Map<string, number>();
  for (const row of trails) {
    if (row.n <= 0) continue;
    const first = row.key.split(">")[0]?.trim() ?? "";
    const colon = first.lastIndexOf(":");
    const reason = colon >= 0 && FAILURE_REASONS.has(first.slice(colon + 1)) ? first.slice(colon + 1) : "other";
    counts.set(reason, (counts.get(reason) ?? 0) + row.n);
  }
  return [...counts].map(([key, n]) => ({ key, n })).sort((a, b) => b.n - a.n || a.key.localeCompare(b.key));
}

const PACK_TIERS = ["memory", "kv", "pin", "fallback"];

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
  const failures = primaryFailures(report.trails ?? []);
  lines.push("", "## Primary failures", "");
  if (failures.length) {
    lines.push(
      "Questions whose first model tier failed, by its reason: `quota` or `breaker_open` means the daily Workers AI neurons ran out (until 00:00 UTC), `first_token_timeout` a slow first token, `rate_limited` or `error` an upstream error.",
      "",
      "| Reason | Count | Share |",
      "|---|---|---|",
    );
    for (const r of failures) lines.push(`| ${r.key} | ${r.n} | ${percent(r.n, total)} |`);
  } else {
    lines.push("None this week.");
  }
  if (report.entries?.length) {
    lines.push("", "## Entry points", "", "| Entry point | Count | Share |", "|---|---|---|");
    for (const r of [...report.entries].sort((a, b) => b.n - a.n)) lines.push(`| ${r.key.replace(/[^a-z]/g, "") || "(none)"} | ${r.n} | ${percent(r.n, total)} |`);
  }
  const tiers = (report.tiers ?? []).filter((r) => PACK_TIERS.includes(r.key) && r.n > 0);
  if (tiers.length) {
    const served = tiers.reduce((sum, r) => sum + r.n, 0);
    lines.push("", "## Pack tier", "", "| Tier | Count | Share |", "|---|---|---|");
    for (const r of [...tiers].sort((a, b) => b.n - a.n)) lines.push(`| ${r.key} | ${r.n} | ${percent(r.n, served)} |`);
  }
  const over = (report.overRefused ?? []).filter((r) => r.n > 0);
  lines.push("", "## Over-refused", "");
  if (over.length) {
    lines.push("Declined questions that retrieval would have answered with a strong match (owner review: a rule may be too broad).", "", "| Reason | Count |", "|---|---|");
    for (const r of [...over].sort((a, b) => b.n - a.n)) lines.push(`| ${r.key.replace(/[^a-z0-9_-]/gi, "") || "(none)"} | ${r.n} |`);
  } else {
    lines.push("None this week.");
  }
  const routes = (report.routes ?? []).map((r) => ({ ...r, key: r.key.replace(/[^a-z+]/g, "") })).filter((r) => r.key && r.n > 0);
  if (routes.length) {
    lines.push("", "## Routes", "", "| Route | Count | Share |", "|---|---|---|");
    const routed = routes.reduce((sum, r) => sum + r.n, 0);
    for (const r of routes.sort((a, b) => b.n - a.n)) lines.push(`| ${r.key} | ${r.n} | ${percent(r.n, routed)} |`);
  }
  const retrieval = (report.retrieval ?? []).filter((r) => (r.key === "bm25" || r.key === "hybrid") && r.n > 0);
  if (retrieval.length) {
    const used = retrieval.reduce((sum, r) => sum + r.n, 0);
    lines.push("", "## Retrieval", "", "| Retrieval | Count | Share |", "|---|---|---|");
    for (const r of [...retrieval].sort((a, b) => b.n - a.n)) lines.push(`| ${r.key} | ${r.n} | ${percent(r.n, used)} |`);
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
export function formatPrivateQuestions(questions: readonly QuestionGroup[], title = "Unanswered questions", empty = "No unanswered questions in the last 7 days."): string {
  if (!questions.length) return `## ${title}\n\n${empty}\n`;
  const lines = [`## ${title}`, "", "| # | Count | Question (scrubbed) |", "|---|---|---|"];
  questions.forEach((q, i) => lines.push(`| ${i + 1} | ${q.count} | \`${sanitizeForIssue(q.question).replace(/\|/g, "/")}\` |`));
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

/** Declined questions (owner decision 2026-10-24), and the declined ones retrieval would have answered (over-refusal candidates). */
export const DECLINED_QUERY =
  "SELECT blob4 AS key, SUM(_sample_interval) AS n FROM ask_events WHERE blob1 = 'decline' AND blob4 != '' AND timestamp > NOW() - INTERVAL '7' DAY GROUP BY key ORDER BY n DESC LIMIT 1000 FORMAT JSON";
export const OVER_REFUSED_QUERY =
  "SELECT blob4 AS key, SUM(_sample_interval) AS n FROM ask_events WHERE blob1 = 'decline' AND blob16 = 'match' AND blob4 != '' AND timestamp > NOW() - INTERVAL '7' DAY GROUP BY key ORDER BY n DESC LIMIT 1000 FORMAT JSON";

/** The public report's queries: counts by outcome, source, model, reason, entry point, unanswered topic, over-refusal, route, retrieval and failure trail. */
export const QUERIES = {
  topics: "SELECT blob8 AS key, SUM(_sample_interval) AS n FROM ask_events WHERE blob1 = 'unknown' AND timestamp > NOW() - INTERVAL '7' DAY GROUP BY key FORMAT JSON",
  outcomes: "SELECT blob1 AS key, SUM(_sample_interval) AS n FROM ask_events WHERE timestamp > NOW() - INTERVAL '7' DAY GROUP BY key FORMAT JSON",
  sources: "SELECT blob3 AS key, SUM(_sample_interval) AS n FROM ask_events WHERE timestamp > NOW() - INTERVAL '7' DAY GROUP BY key FORMAT JSON",
  reasons: "SELECT blob6 AS key, SUM(_sample_interval) AS n FROM ask_events WHERE blob6 != '' AND timestamp > NOW() - INTERVAL '7' DAY GROUP BY key FORMAT JSON",
  models: "SELECT blob10 AS key, SUM(_sample_interval) AS n FROM ask_events WHERE blob1 != 'rejected' AND timestamp > NOW() - INTERVAL '7' DAY GROUP BY key FORMAT JSON",
  entries: "SELECT blob7 AS key, SUM(_sample_interval) AS n FROM ask_events WHERE blob1 != 'rejected' AND timestamp > NOW() - INTERVAL '7' DAY GROUP BY key FORMAT JSON",
  tiers: "SELECT blob12 AS key, SUM(_sample_interval) AS n FROM ask_events WHERE blob12 != '' AND timestamp > NOW() - INTERVAL '7' DAY GROUP BY key FORMAT JSON",
  overRefused: "SELECT blob6 AS key, SUM(_sample_interval) AS n FROM ask_events WHERE blob16 = 'match' AND timestamp > NOW() - INTERVAL '7' DAY GROUP BY key FORMAT JSON",
  routes: "SELECT blob14 AS key, SUM(_sample_interval) AS n FROM ask_events WHERE blob14 != '' AND timestamp > NOW() - INTERVAL '7' DAY GROUP BY key FORMAT JSON",
  retrieval: "SELECT blob15 AS key, SUM(_sample_interval) AS n FROM ask_events WHERE blob15 != '' AND timestamp > NOW() - INTERVAL '7' DAY GROUP BY key FORMAT JSON",
  trails: "SELECT blob11 AS key, SUM(_sample_interval) AS n FROM ask_events WHERE blob11 != '' AND blob1 != 'rejected' AND timestamp > NOW() - INTERVAL '7' DAY GROUP BY key FORMAT JSON",
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
    const [unknown, declined, over] = await Promise.all([QUESTIONS_QUERY, DECLINED_QUERY, OVER_REFUSED_QUERY].map((query) => sql(account, token, query)));
    process.stdout.write(formatPrivateQuestions(groupQuestions(unknown)));
    process.stdout.write(`\n${formatPrivateQuestions(groupQuestions(over), "Over-refused candidates (declined, strong match)", "None in the last 7 days.")}`);
    process.stdout.write(`\n${formatPrivateQuestions(groupQuestions(declined), "Declined questions", "None in the last 7 days.")}`);
    return;
  }
  const [topics, outcomes, sources, reasons, entries, models, tiers, overRefused, routes, retrieval, trails] = await Promise.all(
    [QUERIES.topics, QUERIES.outcomes, QUERIES.sources, QUERIES.reasons, QUERIES.entries, QUERIES.models, QUERIES.tiers, QUERIES.overRefused, QUERIES.routes, QUERIES.retrieval, QUERIES.trails].map((query) => sql(account, token, query)),
  );
  const report = formatReport({ weekOf: week, topics, outcomes, sources, reasons, entries, models, tiers, overRefused, routes, retrieval, trails });
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
