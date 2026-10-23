import type { AeRows, Fetcher, PerfRow, WaRows } from "./types";

/**
 * The two data sources of the hq-stats Worker, read with one read-only Account Analytics token:
 * Web Analytics through the GraphQL API (`rumPageloadEventsAdaptiveGroups`, sampled estimates) and
 * Analytics Engine through the SQL API (`ask_events`, `visit_events`, `perf_events`, weighted by
 * `_sample_interval`).
 * Queries are fixed: only validated dates, ids and hosts are filled in, never visitor input.
 */

export interface SourceConfig {
  token: string;
  accountId: string;
  siteTag: string;
  hosts: string[];
}

const GRAPHQL = "https://api.cloudflare.com/client/v4/graphql";
const sqlUrl = (accountId: string) => `https://api.cloudflare.com/client/v4/accounts/${accountId}/analytics_engine/sql`;
/** maxPageSize of the dataset on this account; a group that reaches it may be cut, so the run fails instead. */
export const WA_LIMIT = 10_000;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

const FILTER = "{ AND: [{ datetime_geq: $start, datetime_lt: $end }, { siteTag: $siteTag }, { bot: 0 }, { requestHost_in: $hosts }] }";

/**
 * One request, three groups per UTC day: totals, countries, paths. `avg { sampleInterval }` tells whether
 * the adaptive API answered from a sample (above 1); the run never finalizes a day from a sampled answer.
 */
export const WA_QUERY = `query HqStats($accountTag: string!, $siteTag: string!, $start: Time!, $end: Time!, $hosts: [string!]) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      days: rumPageloadEventsAdaptiveGroups(limit: ${WA_LIMIT}, filter: ${FILTER}) { count sum { visits } avg { sampleInterval } dimensions { date } }
      countries: rumPageloadEventsAdaptiveGroups(limit: ${WA_LIMIT}, filter: ${FILTER}) { count sum { visits } avg { sampleInterval } dimensions { date countryName } }
      paths: rumPageloadEventsAdaptiveGroups(limit: ${WA_LIMIT}, filter: ${FILTER}) { count avg { sampleInterval } dimensions { date requestPath } }
    }
  }
}`;

const num = (v: unknown): number => (typeof v === "number" ? v : typeof v === "string" ? Number(v) : Number.NaN);
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function groups(account: Record<string, unknown>, name: string): Record<string, unknown>[] {
  const list = account[name];
  if (!Array.isArray(list)) throw new Error(`Web Analytics: no ${name} group in the response`);
  if (list.length >= WA_LIMIT) throw new Error(`Web Analytics: ${name} reached ${WA_LIMIT} rows; use a shorter window`);
  return list.filter(isRecord);
}

const dims = (row: Record<string, unknown>) => (isRecord(row.dimensions) ? row.dimensions : {});
const visitsOf = (row: Record<string, unknown>) => num(isRecord(row.sum) ? row.sum.visits : undefined);
/** NaN when the API left it out, which `waExact` treats as sampled. */
const intervalOf = (row: Record<string, unknown>) => num(isRecord(row.avg) ? row.avg.sampleInterval : undefined);

/** Web Analytics rows for the UTC days in [start, end) (YYYY-MM-DD, at most 93 days apart). */
export async function fetchWebAnalytics(cfg: SourceConfig, start: string, end: string, fetcher: Fetcher): Promise<WaRows> {
  if (!DAY.test(start) || !DAY.test(end)) throw new Error("Web Analytics: bad date");
  const response = await fetcher(GRAPHQL, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      query: WA_QUERY,
      variables: { accountTag: cfg.accountId, siteTag: cfg.siteTag, start: `${start}T00:00:00Z`, end: `${end}T00:00:00Z`, hosts: cfg.hosts },
    }),
  });
  if (!response.ok) throw new Error(`Web Analytics: HTTP ${response.status}`);
  const body: unknown = await response.json();
  // GraphQL errors come back with HTTP 200.
  if (!isRecord(body) || (Array.isArray(body.errors) && body.errors.length > 0)) throw new Error("Web Analytics: the API answered with errors");
  const account = isRecord(body.data) && isRecord(body.data.viewer) && Array.isArray(body.data.viewer.accounts) ? body.data.viewer.accounts[0] : undefined;
  if (!isRecord(account)) throw new Error("Web Analytics: no account in the response");
  const date = (row: Record<string, unknown>) => str(dims(row).date);
  return {
    days: groups(account, "days").map((r) => ({ date: date(r), count: num(r.count), visits: visitsOf(r), sampleInterval: intervalOf(r) })),
    countries: groups(account, "countries").map((r) => ({ date: date(r), country: str(dims(r).countryName), count: num(r.count), visits: visitsOf(r), sampleInterval: intervalOf(r) })),
    paths: groups(account, "paths").map((r) => ({ date: date(r), path: str(dims(r).requestPath), count: num(r.count), sampleInterval: intervalOf(r) })),
  };
}

/** Days-only Web Analytics visits: the cutover day's visits before the cutover time. */
export const WA_VISITS_QUERY = `query HqVisitsBefore($accountTag: string!, $siteTag: string!, $start: Time!, $end: Time!, $hosts: [string!]) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      days: rumPageloadEventsAdaptiveGroups(limit: 10, filter: ${FILTER}) { count sum { visits } dimensions { date } }
    }
  }
}`;

/** Web Analytics visits in [start, end) (ISO seconds, the same UTC day): the cutover day's part before the cutover. */
export async function fetchWaVisitsBetween(cfg: SourceConfig, start: string, end: string, fetcher: Fetcher): Promise<number> {
  if (!ISO_SECOND.test(start) || !ISO_SECOND.test(end)) throw new Error("Web Analytics: bad time");
  if (start >= end) return 0;
  const response = await fetcher(GRAPHQL, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: WA_VISITS_QUERY, variables: { accountTag: cfg.accountId, siteTag: cfg.siteTag, start, end, hosts: cfg.hosts } }),
  });
  if (!response.ok) throw new Error(`Web Analytics: HTTP ${response.status}`);
  const body: unknown = await response.json();
  if (!isRecord(body) || (Array.isArray(body.errors) && body.errors.length > 0)) throw new Error("Web Analytics: the API answered with errors");
  const account = isRecord(body.data) && isRecord(body.data.viewer) && Array.isArray(body.data.viewer.accounts) ? body.data.viewer.accounts[0] : undefined;
  if (!isRecord(account)) throw new Error("Web Analytics: no account in the response");
  const total = groups(account, "days").reduce((sum, r) => sum + visitsOf(r), 0);
  if (!Number.isFinite(total) || total < 0) throw new Error("Web Analytics: bad visits");
  return Math.round(total);
}

async function sql(cfg: Pick<SourceConfig, "token" | "accountId">, query: string, fetcher: Fetcher): Promise<Record<string, unknown>[]> {
  const response = await fetcher(sqlUrl(cfg.accountId), { method: "POST", headers: { Authorization: `Bearer ${cfg.token}` }, body: query });
  if (!response.ok) throw new Error(`Analytics Engine: HTTP ${response.status}`);
  const text = await response.text();
  const rows: Record<string, unknown>[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let row: unknown;
    try {
      row = JSON.parse(line);
    } catch {
      throw new Error("Analytics Engine: the API answered with something other than JSON rows");
    }
    if (isRecord(row)) rows.push(row);
  }
  return rows;
}

/** SQL time literal of a UTC day's midnight. */
const at = (day: string) => `toDateTime('${day} 00:00:00')`;

/**
 * Questions asked per day, topic (blob8) and chip (blob9); Turnstile rejects are not questions, nor are questions
 * from automated browsers (blob13 "auto", reported by the client for counting only).
 * Rows from before blob8 or blob13 existed come back with empty strings: they count (in the total only before blob8).
 */
export const asksSql = (start: string, end: string) =>
  `SELECT toDate(timestamp) AS day, blob8 AS topic, blob9 AS chip, SUM(_sample_interval) AS n FROM ask_events WHERE timestamp >= ${at(start)} AND timestamp < ${at(end)} AND blob1 != 'rejected' AND blob13 != 'auto' GROUP BY day, topic, chip FORMAT JSONEachRow`;

/**
 * Visit beacon points per day and blob2 (a mode, or "visit" for the visit ping), with each group's earliest
 * point: the first "visit" point is the first-party cutover (owner decision 2026-10-24). A dataset that was
 * never written answers with no rows.
 */
export const visitsSql = (start: string, end: string) =>
  `SELECT toDate(timestamp) AS day, blob2 AS mode, SUM(_sample_interval) AS n, min(timestamp) AS first FROM visit_events WHERE timestamp >= ${at(start)} AND timestamp < ${at(end)} AND blob1 = '1' GROUP BY day, mode FORMAT JSONEachRow`;

/** ISO time to the seconds, UTC (`2026-10-24T01:02:03Z`): the cutover and the live tail start. */
export const ISO_SECOND = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})Z$/;
const AE_TIME = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.\d+)?Z?$/;

/** An Analytics Engine DateTime (`2026-10-24 01:02:03`, UTC) as ISO seconds, or undefined. */
export function aeTimeToIso(value: unknown): string | undefined {
  const m = typeof value === "string" ? AE_TIME.exec(value) : null;
  return m ? `${m[1]}T${m[2]}Z` : undefined;
}

/** Visit pings (the public visit count) since `from` (ISO seconds), for the live today count of `/api/stats`. */
export const liveSql = (from: string) => {
  const m = ISO_SECOND.exec(from);
  if (!m) throw new Error("Analytics Engine: bad time");
  return `SELECT SUM(_sample_interval) AS n FROM visit_events WHERE timestamp >= toDateTime('${m[1]} ${m[2]}') AND blob1 = '1' AND blob2 = 'visit' FORMAT JSONEachRow`;
};

/** Visit pings since `from` (ISO seconds, validated): one cheap SQL count. */
export async function fetchLiveVisits(cfg: Pick<SourceConfig, "token" | "accountId">, from: string, fetcher: Fetcher): Promise<number> {
  const rows = await sql(cfg, liveSql(from), fetcher);
  const n = num(rows[0]?.n ?? 0);
  if (!Number.isFinite(n) || n < 0) throw new Error("Analytics Engine: bad count");
  return Math.round(n);
}

/** RUM beacon points (one per sampled 3D session) per day, median FPS bucket (blob4) and explore bucket (blob6). */
export const perfSql = (start: string, end: string) =>
  `SELECT toDate(timestamp) AS day, blob4 AS fps50, blob6 AS explore, SUM(_sample_interval) AS n FROM perf_events WHERE timestamp >= ${at(start)} AND timestamp < ${at(end)} AND blob1 = '1' GROUP BY day, fps50, explore FORMAT JSONEachRow`;

const perfRows = (rows: Record<string, unknown>[]): PerfRow[] => rows.map((r) => ({ day: str(r.day), fps50: str(r.fps50), explore: str(r.explore), n: num(r.n) }));

/** Analytics Engine `perf_events` rows only, for the UTC days in [start, end) (the perf backfill of stored days). */
export async function fetchPerf(cfg: SourceConfig, start: string, end: string, fetcher: Fetcher): Promise<PerfRow[]> {
  if (!DAY.test(start) || !DAY.test(end)) throw new Error("Analytics Engine: bad date");
  return perfRows(await sql(cfg, perfSql(start, end), fetcher));
}

/** Analytics Engine rows for the UTC days in [start, end) (YYYY-MM-DD). Data older than 3 months is gone. */
export async function fetchAnalyticsEngine(cfg: SourceConfig, start: string, end: string, fetcher: Fetcher): Promise<AeRows> {
  if (!DAY.test(start) || !DAY.test(end)) throw new Error("Analytics Engine: bad date");
  const [asks, visits, perf] = await Promise.all([sql(cfg, asksSql(start, end), fetcher), sql(cfg, visitsSql(start, end), fetcher), sql(cfg, perfSql(start, end), fetcher)]);
  return {
    asks: asks.map((r) => ({ day: str(r.day), topic: str(r.topic), chip: str(r.chip), n: num(r.n) })),
    visits: visits.map((r) => ({ day: str(r.day), mode: str(r.mode), n: num(r.n), ...(aeTimeToIso(r.first) ? { first: aeTimeToIso(r.first) } : {}) })),
    perf: perfRows(perf),
  };
}
