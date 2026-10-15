import { SUGGESTIONS } from "../../../src/ask/suggestions";
import { parseStatsSnapshot, STATS_KEY, type StatsSnapshotV1, type StatsTopic } from "../../../src/lib/stats/protocol";
import { addDays, buildPerf, buildRollups, buildSnapshot, dayRange, trimLeadingEmpty } from "./rollup";
import { fetchAnalyticsEngine, fetchPerf, fetchWebAnalytics, type SourceConfig } from "./sources";
import type { DayRollup, Fetcher, Ledger, StatsWorkerEnv } from "./types";

/** A UTC day is finalized (written to the ledger once, never recomputed) an hour after it ends, so late events land first. */
export const SETTLE_MS = 3_600_000;

/** The last UTC day that ended at least `SETTLE_MS` before `now`. */
export function finalizedThrough(now: number): string {
  return addDays(new Date(now - SETTLE_MS).toISOString().slice(0, 10), -1);
}

/** KV key of the ledger: every finalized day (written once, never recomputed). */
export const LEDGER_KEY = "stats:days:v1";
/** First run: history to backfill, inside Web Analytics' 184-day `notOlderThan` (Analytics Engine keeps 3 months). */
export const BACKFILL_DAYS = 183;
/** Web Analytics days per query (the dataset allows 93). */
export const WA_WINDOW_DAYS = 90;
/** Analytics Engine keeps points for 3 months: stored days without `perf` this recent get it filled once. */
export const AE_RETENTION_DAYS = 90;

/** Curated chip ids and their topics (content/ask/suggestions.json, bundled at deploy). */
export const CHIP_TOPICS: ReadonlyMap<string, StatsTopic> = new Map(SUGGESTIONS.map((s) => [s.id, s.topic]));

export interface RunResult {
  /** Days appended to the ledger by this run. */
  added: string[];
  /** Days rolled up into the snapshot but not stored (not finalized yet, up to today). */
  provisional: string[];
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

/** Valid, and the perf block (when built) survived validation instead of being dropped. */
function validSnapshot(snapshot: StatsSnapshotV1 | null): snapshot is StatsSnapshotV1 {
  if (!snapshot) return false;
  const parsed = parseStatsSnapshot(snapshot);
  return parsed !== null && (!snapshot.perf || parsed.perf !== undefined);
}

/**
 * Stored days rolled up before perf existed get `perf` from one `perf_events` query (zeros when the day
 * has no points), so they are never queried again. Only `perf` is added; every other field stays.
 */
async function backfillPerf(cfg: SourceConfig, days: readonly DayRollup[], missing: readonly DayRollup[], fetcher: Fetcher): Promise<DayRollup[]> {
  if (!missing.length) return [...days];
  const rows = await fetchPerf(cfg, missing[0].date, addDays(missing[missing.length - 1].date, 1), fetcher);
  const dates = new Set(missing.map((d) => d.date));
  return days.map((d) => (dates.has(d.date) ? { ...d, perf: buildPerf(d.date, rows) } : d));
}

/**
 * One run (every 4 hours, see wrangler.toml): rolls up every UTC day after the ledger's last day up to today (the whole
 * backfill window on the first run) from one Web Analytics pass and the same Analytics Engine queries.
 * Days that ended at least `SETTLE_MS` ago are finalized: appended to the ledger once and never fetched
 * again. The later days (at most yesterday, within the hour after midnight, and today so far) are
 * provisional: they enter the public snapshot but are never stored, and the next run recomputes them.
 * The snapshot is rewritten on every run with `updatedAt` set to the run time. Any API error throws before
 * anything is written, so the last good snapshot stays; the next run catches up every missed day. Stored
 * days inside the Analytics Engine retention that have no `perf` yet get it filled once (at most one extra
 * query per run). Logs dates and counts only, never a token.
 */
export async function runStats(env: StatsWorkerEnv, now: number, fetcher: Fetcher = (input, init) => fetch(input, init), log: (line: string) => void = console.log): Promise<RunResult> {
  const cfg = config(env);
  const today = new Date(now).toISOString().slice(0, 10);
  const lastFinal = finalizedThrough(now);
  const ledger = readLedger(await env.STATS_KV.get(LEDGER_KEY));
  const last = ledger.days.at(-1)?.date;
  const from = last ? addDays(last, 1) : addDays(today, -BACKFILL_DAYS);
  const end = addDays(today, 1);
  const perfFrom = addDays(today, -AE_RETENTION_DAYS);
  const missingPerf = ledger.days.filter((d) => !d.perf && d.date >= perfFrom);

  const wa = { days: [], countries: [], paths: [] } as Awaited<ReturnType<typeof fetchWebAnalytics>>;
  for (let start = from; start < end; start = addDays(start, WA_WINDOW_DAYS)) {
    const windowEnd = addDays(start, WA_WINDOW_DAYS) < end ? addDays(start, WA_WINDOW_DAYS) : end;
    const part = await fetchWebAnalytics(cfg, start, windowEnd, fetcher);
    wa.days.push(...part.days);
    wa.countries.push(...part.countries);
    wa.paths.push(...part.paths);
  }
  const ae = await fetchAnalyticsEngine(cfg, from, end, fetcher);
  const stored = await backfillPerf(cfg, ledger.days, missingPerf, fetcher);

  const rolled = buildRollups(dayRange(from, today), wa, ae, CHIP_TOPICS);
  const days = stored.length ? rolled : trimLeadingEmpty(rolled);
  const added = days.filter((d) => d.date <= lastFinal);
  const provisional = days.filter((d) => d.date > lastFinal);
  if (!stored.length && !days.length) {
    log(`hq-stats: no data from ${from} to ${today} yet`);
    return { added: [], provisional: [], days: 0, snapshot: false };
  }

  const snapshot = buildSnapshot([...stored, ...added, ...provisional], today, CHIP_TOPICS, new Date(now).toISOString());
  if (!validSnapshot(snapshot)) throw new Error("hq-stats: the snapshot failed validation; nothing written");

  const ledgerDays = [...stored, ...added];
  if (added.length || missingPerf.length) await env.STATS_KV.put(LEDGER_KEY, JSON.stringify({ v: 1, days: ledgerDays } satisfies Ledger));
  await env.STATS_KV.put(STATS_KEY, JSON.stringify(snapshot));
  const range = (list: readonly DayRollup[]) => (list.length ? `${list[0].date} to ${list.at(-1)?.date}` : "none");
  const filled = missingPerf.length ? `, filled perf for ${missingPerf.length} stored days` : "";
  log(`hq-stats: added ${added.length} days (${range(added)})${filled}, provisional ${range(provisional)}, ledger ${ledgerDays.length} days`);
  return { added: added.map((d) => d.date), provisional: provisional.map((d) => d.date), days: ledgerDays.length, snapshot: true };
}
