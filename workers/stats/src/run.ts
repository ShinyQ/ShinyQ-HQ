import { SUGGESTIONS } from "../../../src/ask/suggestions";
import { parseStatsSnapshot, STATS_KEY, type StatsTopic } from "../../../src/lib/stats/protocol";
import { addDays, buildRollups, buildSnapshot, dayRange, trimLeadingEmpty } from "./rollup";
import { fetchAnalyticsEngine, fetchWebAnalytics, type SourceConfig } from "./sources";
import type { DayRollup, Fetcher, Ledger, StatsWorkerEnv } from "./types";

/** KV key of the ledger: every finalized day (written once, never recomputed). */
export const LEDGER_KEY = "stats:days:v1";
/** First run: history to backfill, inside Web Analytics' 184-day `notOlderThan` (Analytics Engine keeps 3 months). */
export const BACKFILL_DAYS = 183;
/** Web Analytics days per query (the dataset allows 93). */
export const WA_WINDOW_DAYS = 90;

/** Curated chip ids and their topics (content/ask/suggestions.json, bundled at deploy). */
export const CHIP_TOPICS: ReadonlyMap<string, StatsTopic> = new Map(SUGGESTIONS.map((s) => [s.id, s.topic]));

export interface RunResult {
  /** Days appended to the ledger by this run. */
  added: string[];
  /** Days in the ledger after the run. */
  days: number;
  /** Whether a snapshot was written. */
  snapshot: boolean;
}

const HEX32 = /^[0-9a-f]{32}$/;
const HOST = /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/;

function config(env: StatsWorkerEnv): SourceConfig {
  const hosts = (env.WA_HOSTS ?? "")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  const ok = Boolean(env.WA_TOKEN) && HEX32.test(env.WA_ACCOUNT_ID ?? "") && HEX32.test(env.WA_SITE_TAG ?? "") && hosts.length > 0 && hosts.every((h) => HOST.test(h));
  if (!ok) throw new Error("hq-stats: missing or invalid configuration (WA_TOKEN, WA_ACCOUNT_ID, WA_SITE_TAG, WA_HOSTS)");
  return { token: env.WA_TOKEN as string, accountId: env.WA_ACCOUNT_ID as string, siteTag: env.WA_SITE_TAG as string, hosts };
}

function readLedger(raw: string | null): Ledger {
  if (raw === null) return { v: 1, days: [] };
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("hq-stats: the ledger in KV is not JSON; refusing to overwrite history");
  }
  const ledger = value as Partial<Ledger>;
  if (!ledger || ledger.v !== 1 || !Array.isArray(ledger.days)) throw new Error("hq-stats: the ledger in KV has an unknown shape; refusing to overwrite history");
  return ledger as Ledger;
}

/**
 * One daily run (cron `0 1 * * *`): appends a rollup for every complete UTC day after the ledger's last
 * day (the whole backfill window on the first run), then rebuilds the public snapshot. A finalized day is
 * never fetched again. Any API error throws before anything is written, so the last good snapshot stays;
 * the next run catches up every missed day. Logs dates and counts only, never a token.
 */
export async function runStats(env: StatsWorkerEnv, now: number, fetcher: Fetcher = (input, init) => fetch(input, init), log: (line: string) => void = console.log): Promise<RunResult> {
  const cfg = config(env);
  const today = new Date(now).toISOString().slice(0, 10);
  const lastDay = addDays(today, -1);
  const ledger = readLedger(await env.STATS_KV.get(LEDGER_KEY));
  const last = ledger.days.at(-1)?.date;
  const from = last ? addDays(last, 1) : addDays(today, -BACKFILL_DAYS);

  if (from > lastDay) {
    const stored = await env.STATS_KV.get(STATS_KEY);
    const expected = `${today}T00:00:00.000Z`;
    let current = false;
    try {
      current = stored !== null && parseStatsSnapshot(JSON.parse(stored))?.updatedAt === expected;
    } catch {
      current = false;
    }
    if (current) return { added: [], days: ledger.days.length, snapshot: false };
    const snapshot = buildSnapshot(ledger.days, lastDay, CHIP_TOPICS);
    if (!snapshot || !parseStatsSnapshot(snapshot)) return { added: [], days: ledger.days.length, snapshot: false };
    await env.STATS_KV.put(STATS_KEY, JSON.stringify(snapshot));
    log(`hq-stats: rewrote the snapshot from ${ledger.days.length} ledger days`);
    return { added: [], days: ledger.days.length, snapshot: true };
  }

  const end = addDays(lastDay, 1);
  const wa = { days: [], countries: [], paths: [] } as Awaited<ReturnType<typeof fetchWebAnalytics>>;
  for (let start = from; start < end; start = addDays(start, WA_WINDOW_DAYS)) {
    const windowEnd = addDays(start, WA_WINDOW_DAYS) < end ? addDays(start, WA_WINDOW_DAYS) : end;
    const part = await fetchWebAnalytics(cfg, start, windowEnd, fetcher);
    wa.days.push(...part.days);
    wa.countries.push(...part.countries);
    wa.paths.push(...part.paths);
  }
  const ae = await fetchAnalyticsEngine(cfg, from, end, fetcher);

  const fresh = buildRollups(dayRange(from, lastDay), wa, ae, CHIP_TOPICS);
  const added: DayRollup[] = ledger.days.length ? fresh : trimLeadingEmpty(fresh);
  if (!added.length) {
    log(`hq-stats: no data from ${from} to ${lastDay} yet`);
    return { added: [], days: 0, snapshot: false };
  }
  const days = [...ledger.days, ...added];
  const snapshot = buildSnapshot(days, lastDay, CHIP_TOPICS);
  if (!snapshot || !parseStatsSnapshot(snapshot)) throw new Error("hq-stats: the snapshot failed validation; nothing written");

  await env.STATS_KV.put(LEDGER_KEY, JSON.stringify({ v: 1, days } satisfies Ledger));
  await env.STATS_KV.put(STATS_KEY, JSON.stringify(snapshot));
  log(`hq-stats: added ${added.length} days (${added[0].date} to ${added.at(-1)?.date}), ledger ${days.length} days`);
  return { added: added.map((d) => d.date), days: days.length, snapshot: true };
}
