import { STATS_TOPIC_OF, SUGGESTIONS } from "../../../src/ask/suggestions";
import { parseStatsSnapshot, STATS_KEY, type StatsSnapshotV1, type StatsTopic } from "../../../src/lib/stats/protocol";
import { STATS_LIVE_KEY, type StatsLive } from "../../../src/lib/stats/live";
import { VISIT_KIND } from "../../../src/lib/stats/visit";
import { addDays, buildPerf, buildRollups, buildSnapshot, dayRange, trimLeadingEmpty, waExact } from "./rollup";
import { fetchAnalyticsEngine, fetchPerf, fetchWaVisitsBetween, fetchWebAnalytics, ISO_SECOND, type SourceConfig } from "./sources";
import type { DayRollup, Fetcher, Ledger, StatsWorkerEnv, WaExtra, WaRows } from "./types";

/** A UTC day is finalized (written to the ledger once, never recomputed) an hour after it ends, so late events land first. */
export const SETTLE_MS = 3_600_000;

/** The last UTC day that ended at least `SETTLE_MS` before `now`. */
export function finalizedThrough(now: number): string {
  return addDays(new Date(now - SETTLE_MS).toISOString().slice(0, 10), -1);
}

/**
 * A finalized day whose Web Analytics answer is sampled or inconsistent (`waExact`) stays provisional and
 * is fetched again on the next runs; once it ended this many days before the last finalized day it is
 * stored anyway (logged), so a site that is always sampled still moves on.
 */
export const EXACT_GRACE_DAYS = 3;

/** KV key of the ledger: every finalized day (written once, never recomputed). */
export const LEDGER_KEY = "stats:days:v1";
/** First run: history to backfill, inside Web Analytics' 184-day `notOlderThan` (Analytics Engine keeps 3 months). */
export const BACKFILL_DAYS = 183;
/** Web Analytics days per query (the dataset allows 93). */
export const WA_WINDOW_DAYS = 90;
/** Analytics Engine keeps points for 3 months: stored days without `perf` this recent get it filled once. */
export const AE_RETENTION_DAYS = 90;

/** Curated chip ids and their stats topics (content/ask/suggestions.json, bundled at deploy; `STATS_TOPIC_OF` folds the newer pill topics in). */
export const CHIP_TOPICS: ReadonlyMap<string, StatsTopic> = new Map(SUGGESTIONS.map((s) => [s.id, STATS_TOPIC_OF[s.topic]]));

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

export function config(env: StatsWorkerEnv): SourceConfig {
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
  if (ledger.cutover !== undefined && (typeof ledger.cutover !== "string" || !ISO_SECOND.test(ledger.cutover))) throw new Error("hq-stats: the ledger's cutover is not an ISO time; refusing to overwrite history");
  return ledger as Ledger;
}

/**
 * KV key of Web Analytics rows kept from a retired site (`WaExtra`), added to the fetched rows of the days
 * being rolled up. Written by hand once (README, "Repair"); days already in the ledger never read it again.
 */
export const WA_EXTRA_KEY = "stats:wa-extra:v1";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const COUNT = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0;

/** Validated extra rows, empty when the key is missing. A malformed value throws: nothing is written. */
export function readWaExtra(raw: string | null): WaRows {
  const empty: WaRows = { days: [], countries: [], paths: [] };
  if (raw === null) return empty;
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("hq-stats: the extra Web Analytics rows in KV are not JSON");
  }
  const extra = value as Partial<WaExtra> | null;
  const rows = extra?.rows;
  const ok =
    extra?.v === 1 &&
    !!rows &&
    Array.isArray(rows.days) &&
    Array.isArray(rows.countries) &&
    Array.isArray(rows.paths) &&
    rows.days.every((r) => DAY.test(r?.date) && COUNT(r.count) && COUNT(r.visits)) &&
    rows.countries.every((r) => DAY.test(r?.date) && typeof r.country === "string" && COUNT(r.count) && COUNT(r.visits)) &&
    rows.paths.every((r) => DAY.test(r?.date) && typeof r.path === "string" && COUNT(r.count));
  if (!ok || !rows) throw new Error("hq-stats: the extra Web Analytics rows in KV have an unknown shape");
  const strip = <T extends { sampleInterval?: number }>(r: T): T => ({ ...r, sampleInterval: undefined });
  return { days: rows.days.map(strip), countries: rows.countries.map(strip), paths: rows.paths.map(strip) };
}

/** Counts only: why a day's Web Analytics answer was not exact (page views per group, largest sample interval). */
function waShape(date: string, wa: WaRows): string {
  const rows = [...wa.days, ...wa.countries, ...wa.paths].filter((r) => r.date === date);
  const total = (list: readonly { date: string; count: number }[]) => list.reduce((sum, r) => (r.date === date ? sum + r.count : sum), 0);
  const interval = Math.max(1, ...rows.map((r) => r.sampleInterval ?? 1).map((v) => (Number.isFinite(v) ? v : Number.POSITIVE_INFINITY)));
  return `page views ${total(wa.days)}, countries ${total(wa.countries)}, paths ${total(wa.paths)}, sample interval up to ${Number.isFinite(interval) ? Math.round(interval * 100) / 100 : "unknown"}`;
}

/**
 * The live tail written next to the snapshot (`STATS_LIVE_KEY`): where the first-party count of the unstored
 * days starts and how many pings the snapshot counted since then. `from` is null when a tail day is frozen
 * (its visits fell back to Web Analytics, so live pings must not be added).
 */
export function liveTail(tail: readonly DayRollup[], cutover: string, updatedAt: string): StatsLive {
  const cutDay = cutover.slice(0, 10);
  const counted = tail.filter((d) => d.date >= cutDay);
  if (!tail.length || counted.some((d) => d.visitsFrozen)) return { v: 1, updatedAt, from: null, visits: 0 };
  const start = `${tail[0].date}T00:00:00Z`;
  return { v: 1, updatedAt, from: start > cutover ? start : cutover, visits: counted.reduce((sum, d) => sum + (d.firstParty ?? 0), 0) };
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
 * One run (every hour, see wrangler.toml): rolls up every UTC day after the ledger's last day up to today (the whole
 * backfill window on the first run) from one Web Analytics pass and the same Analytics Engine queries.
 * Days that ended at least `SETTLE_MS` ago are finalized: appended to the ledger once and never fetched
 * again, but only from an unsampled, consistent Web Analytics answer (`waExact`; else they stay provisional
 * for up to `EXACT_GRACE_DAYS`). The later days (at most yesterday, within the hour after midnight, and today so far) are
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
  const extra = readWaExtra(await env.STATS_KV.get(WA_EXTRA_KEY));
  const inRange = (r: { date: string }) => r.date >= from && r.date < end;
  wa.days.push(...extra.days.filter(inRange));
  wa.countries.push(...extra.countries.filter(inRange));
  wa.paths.push(...extra.paths.filter(inRange));
  const ae = await fetchAnalyticsEngine(cfg, from, end, fetcher);
  const stored = await backfillPerf(cfg, ledger.days, missingPerf, fetcher);

  // First-party cutover (owner decision 2026-10-24): the first visit ping, kept in the ledger once seen.
  const seen = ae.visits
    .filter((r) => r.mode === VISIT_KIND && r.first && r.n > 0)
    .map((r) => r.first as string)
    .sort()[0];
  const cutover = ledger.cutover ?? seen ?? null;
  const newCutover = !ledger.cutover && cutover !== null;
  const cutDay = cutover?.slice(0, 10);
  const waBefore = cutover && cutDay && cutDay >= from && cutDay <= today ? await fetchWaVisitsBetween(cfg, `${cutDay}T00:00:00Z`, cutover, fetcher) : 0;

  const rolled = buildRollups(dayRange(from, today), wa, ae, CHIP_TOPICS, { cutover, waBefore });
  const days = stored.length ? rolled : trimLeadingEmpty(rolled);
  // The ledger stays contiguous: the first day that may not be stored keeps every later day provisional too.
  const graceEnd = addDays(lastFinal, -EXACT_GRACE_DAYS);
  const storable = (d: DayRollup) => d.date <= lastFinal && (waExact(d.date, wa) || d.date <= graceEnd);
  const cut = days.findIndex((d) => !storable(d));
  const added = cut === -1 ? days : days.slice(0, cut);
  const provisional = cut === -1 ? [] : days.slice(cut);
  const deferred = provisional.filter((d) => d.date <= lastFinal && !waExact(d.date, wa)).map((d) => d.date);
  const forced = added.filter((d) => !waExact(d.date, wa)).map((d) => d.date);
  if (!stored.length && !days.length) {
    log(`hq-stats: no data from ${from} to ${today} yet`);
    return { added: [], provisional: [], days: 0, snapshot: false };
  }

  const snapshot = buildSnapshot([...stored, ...added, ...provisional], today, CHIP_TOPICS, new Date(now).toISOString());
  if (!validSnapshot(snapshot)) throw new Error("hq-stats: the snapshot failed validation; nothing written");

  const ledgerDays = [...stored, ...added];
  if (added.length || missingPerf.length || newCutover) await env.STATS_KV.put(LEDGER_KEY, JSON.stringify({ v: 1, days: ledgerDays, ...(cutover ? { cutover } : {}) } satisfies Ledger));
  await env.STATS_KV.put(STATS_KEY, JSON.stringify(snapshot));
  if (cutover) await env.STATS_KV.put(STATS_LIVE_KEY, JSON.stringify(liveTail(provisional, cutover, snapshot.updatedAt)));
  const range = (list: readonly DayRollup[]) => (list.length ? `${list[0].date} to ${list.at(-1)?.date}` : "none");
  const filled = missingPerf.length ? `, filled perf for ${missingPerf.length} stored days` : "";
  const held = deferred.length ? `, held back ${deferred.map((date) => `${date} (${waShape(date, wa)})`).join(", ")}` : "";
  const late = forced.length ? `, stored ${forced.join(", ")} sampled after ${EXACT_GRACE_DAYS} days` : "";
  const since = cutover ? `, first-party visits since ${cutover}${newCutover ? " (new)" : ""}` : "";
  log(`hq-stats: added ${added.length} days (${range(added)})${filled}${held}${late}, provisional ${range(provisional)}, ledger ${ledgerDays.length} days${since}`);
  return { added: added.map((d) => d.date), provisional: provisional.map((d) => d.date), days: ledgerDays.length, snapshot: true };
}
