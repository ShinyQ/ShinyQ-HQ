import type { AeRows, Fetcher, WaRows } from "./types";

/**
 * The two data sources of the hq-stats Worker, read with one read-only Account Analytics token:
 * Web Analytics through the GraphQL API (`rumPageloadEventsAdaptiveGroups`, sampled estimates) and
 * Analytics Engine through the SQL API (`ask_events`, `visit_events`, weighted by `_sample_interval`).
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

/** One request, three groups per UTC day: totals, countries, paths. */
export const WA_QUERY = `query HqStats($accountTag: string!, $siteTag: string!, $start: Time!, $end: Time!, $hosts: [string!]) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      days: rumPageloadEventsAdaptiveGroups(limit: ${WA_LIMIT}, filter: ${FILTER}) { count sum { visits } dimensions { date } }
      countries: rumPageloadEventsAdaptiveGroups(limit: ${WA_LIMIT}, filter: ${FILTER}) { count sum { visits } dimensions { date countryName } }
      paths: rumPageloadEventsAdaptiveGroups(limit: ${WA_LIMIT}, filter: ${FILTER}) { count dimensions { date requestPath } }
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
    days: groups(account, "days").map((r) => ({ date: date(r), count: num(r.count), visits: visitsOf(r) })),
    countries: groups(account, "countries").map((r) => ({ date: date(r), country: str(dims(r).countryName), count: num(r.count), visits: visitsOf(r) })),
    paths: groups(account, "paths").map((r) => ({ date: date(r), path: str(dims(r).requestPath), count: num(r.count) })),
  };
}

async function sql(cfg: SourceConfig, query: string, fetcher: Fetcher): Promise<Record<string, unknown>[]> {
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
 * Questions asked per day, topic (blob8) and chip (blob9); Turnstile rejects are not questions.
 * Rows from before blob8 existed come back with empty strings and count only in the total.
 */
export const asksSql = (start: string, end: string) =>
  `SELECT toDate(timestamp) AS day, blob8 AS topic, blob9 AS chip, SUM(_sample_interval) AS n FROM ask_events WHERE timestamp >= ${at(start)} AND timestamp < ${at(end)} AND blob1 != 'rejected' GROUP BY day, topic, chip FORMAT JSONEachRow`;

/** Visit beacon points per day and mode. A dataset that was never written answers with no rows. */
export const visitsSql = (start: string, end: string) =>
  `SELECT toDate(timestamp) AS day, blob2 AS mode, SUM(_sample_interval) AS n FROM visit_events WHERE timestamp >= ${at(start)} AND timestamp < ${at(end)} AND blob1 = '1' GROUP BY day, mode FORMAT JSONEachRow`;

/** Analytics Engine rows for the UTC days in [start, end) (YYYY-MM-DD). Data older than 3 months is gone. */
export async function fetchAnalyticsEngine(cfg: SourceConfig, start: string, end: string, fetcher: Fetcher): Promise<AeRows> {
  if (!DAY.test(start) || !DAY.test(end)) throw new Error("Analytics Engine: bad date");
  const [asks, visits] = await Promise.all([sql(cfg, asksSql(start, end), fetcher), sql(cfg, visitsSql(start, end), fetcher)]);
  return {
    asks: asks.map((r) => ({ day: str(r.day), topic: str(r.topic), chip: str(r.chip), n: num(r.n) })),
    visits: visits.map((r) => ({ day: str(r.day), mode: str(r.mode), n: num(r.n) })),
  };
}
