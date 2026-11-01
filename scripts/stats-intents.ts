/**
 * Private intent report (owner decision 2026-11-01): how many visitors opened the CV, wrote or copied the email, or
 * followed LinkedIn or GitHub, and how many visits each `?src=` channel tag brought. Counts only, from Analytics
 * Engine `visit_events` (blob2 "intent" with blob3 the intent; blob2 "visit" with blob3 the tag, empty when untagged).
 * Never part of the public stats and never run in CI.
 *
 *   CF_EVAL_TOKEN=... CF_ACCOUNT_ID=... bun scripts/stats-intents.ts [--days 30]
 */
import { parseSqlRows, type CountRow } from "./content-gap";
import { VISIT_INTENTS, VISIT_SOURCES } from "../src/lib/stats/visit";

const since = (days: number) => `timestamp > NOW() - INTERVAL '${days}' DAY AND blob1 = '1'`;
export const intentQuery = (days: number) => `SELECT blob3 AS key, SUM(_sample_interval) AS n FROM visit_events WHERE ${since(days)} AND blob2 = 'intent' GROUP BY key FORMAT JSON`;
export const sourceQuery = (days: number) => `SELECT blob3 AS key, SUM(_sample_interval) AS n FROM visit_events WHERE ${since(days)} AND blob2 = 'visit' GROUP BY key FORMAT JSON`;

const count = (rows: readonly CountRow[], key: string) => rows.find((r) => r.key === key)?.n ?? 0;

/** Markdown tables: every intent and every tag (zeros included, so a channel that brought nobody shows), then untagged visits. */
export function formatIntentReport(days: number, intents: readonly CountRow[], sources: readonly CountRow[]): string {
  const visits = sources.reduce((sum, r) => sum + r.n, 0);
  const rows = [
    `# Intent report, last ${days} days`,
    "",
    "| Intent | Tab sessions |",
    "|---|---|",
    ...VISIT_INTENTS.map((i) => `| ${i} | ${count(intents, i)} |`),
    "",
    `| Channel (\`?src=\`) | Visits |`,
    "|---|---|",
    ...VISIT_SOURCES.map((s) => `| ${s} | ${count(sources, s)} |`),
    `| untagged | ${count(sources, "")} |`,
    `| all | ${visits} |`,
    "",
  ];
  return rows.join("\n");
}

async function sql(account: string, token: string, query: string): Promise<CountRow[]> {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/analytics_engine/sql`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: query,
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Analytics Engine SQL: HTTP ${response.status}`);
  return parseSqlRows(JSON.parse(text));
}

async function main() {
  if (process.env.GITHUB_ACTIONS === "true") {
    console.log("::error::The intent report is private and runs only on the owner's machine, never in CI.");
    process.exit(1);
  }
  const token = process.env.CF_EVAL_TOKEN;
  const account = process.env.CF_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!token || !account) {
    console.log("CF_EVAL_TOKEN and CF_ACCOUNT_ID are needed (the same read-only token as the content-gap report).");
    process.exit(1);
  }
  const at = process.argv.indexOf("--days");
  const days = at >= 0 ? Math.max(1, Math.min(90, Number(process.argv[at + 1]) || 30)) : 30;
  const [intents, sources] = await Promise.all([sql(account, token, intentQuery(days)), sql(account, token, sourceQuery(days))]);
  process.stdout.write(formatIntentReport(days, intents, sources));
}

if (import.meta.main) {
  main().catch((error) => {
    console.log(`Intent report failed: ${(error as Error).message}`);
    process.exit(1);
  });
}
