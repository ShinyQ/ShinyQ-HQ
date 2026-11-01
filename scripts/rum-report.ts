/**
 * Read-only field performance report: the RUM beacon (Analytics Engine `perf_events`, appendix 06
 * section 4), the 3D vs Classic split (`visit_events` mode pings) and Web Vitals per device type
 * (Web Analytics GraphQL, hard navigations only). Prints aggregated Markdown tables (or JSON with
 * --json); writes nothing to Cloudflare or to disk.
 *
 *   WA_TOKEN="$(bunx wrangler auth token)" WA_ACCOUNT_ID=<account id> bun scripts/rum-report.ts [--days 30] [--json]
 *
 * WA_TOKEN needs Account Analytics Read (a Wrangler OAuth token works); it is read from the environment
 * and never printed. WA_SITE_TAG and WA_HOSTS default to workers/stats/wrangler.toml (as in
 * scripts/stats-dry-run.ts). Every grouping column is a fixed enum (tier, path, FPS and time buckets,
 * visit mode, deviceType): never a path, selector, browser, country, IP or user agent.
 */
import { readFileSync } from "node:fs";
import { RUM_FPS, RUM_PATHS, RUM_TIERS, RUM_TIMES } from "../src/lib/rum/protocol";

/** Analytics Engine keeps points for 3 months. */
export const MAX_DAYS = 90;
export const DEVICE_TYPES = ["mobile", "tablet", "desktop"] as const;
export const VISIT_MODES = ["3d", "classic", "both"] as const;
const HEX32 = /^[0-9a-f]{32}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The first UTC day of the window, `days` (1 to MAX_DAYS) back from `now`. */
export function startDay(now: number, days: number): string {
  if (!Number.isInteger(days) || days < 1 || days > MAX_DAYS) throw new Error(`--days must be a whole number from 1 to ${MAX_DAYS}`);
  return new Date(now - days * 86_400_000).toISOString().slice(0, 10);
}

const at = (day: string) => {
  if (!DAY.test(day)) throw new Error("rum-report: the start day must be YYYY-MM-DD");
  return `toDateTime('${day} 00:00:00')`;
};

/** Every RUM bucket combination, weighted by the sample interval (version 1 points only). */
export const perfSql = (start: string) =>
  `SELECT blob2 AS tier, blob3 AS path, blob4 AS fps50, blob5 AS fps10, blob6 AS explore, SUM(double1 * _sample_interval) AS lost, SUM(double2 * _sample_interval) AS timeout, SUM(_sample_interval) AS n FROM perf_events WHERE timestamp >= ${at(start)} AND blob1 = '1' GROUP BY tier, path, fps50, fps10, explore FORMAT JSONEachRow`;

/** Mode pings only (`both` counts on both sides, like the public snapshot). */
export const modeSql = (start: string) =>
  `SELECT blob2 AS mode, SUM(_sample_interval) AS n FROM visit_events WHERE timestamp >= ${at(start)} AND blob1 = '1' AND blob2 IN ('3d', 'classic', 'both') GROUP BY mode FORMAT JSONEachRow`;

/** Hard navigations only: SPA route changes (`routing-apis`) rarely carry an LCP. */
export const VITALS_QUERY = `query RumReport($accountTag: string!, $siteTag: string!, $start: Time!, $end: Time!, $hosts: [string!]) {
  viewer { accounts(filter: { accountTag: $accountTag }) {
    vitals: rumWebVitalsEventsAdaptiveGroups(limit: 10, filter: { AND: [{ datetime_geq: $start, datetime_lt: $end }, { siteTag: $siteTag }, { bot: 0 }, { navigationType: "navigate" }, { requestHost_in: $hosts }] }) {
      count avg { sampleInterval } dimensions { deviceType }
      quantiles { largestContentfulPaintP50 largestContentfulPaintP75 largestContentfulPaintP90 firstContentfulPaintP75 timeToFirstByteP75 interactionToNextPaintP75 cumulativeLayoutShiftP75 }
    }
  } }
}`;

type Counts = Record<string, number>;
export interface PerfSummary {
  total: number;
  /** Points whose values are outside the RUM contract (forged or a future version): counted, never shown. */
  dropped: number;
  tier: Counts;
  path: Record<string, Counts>;
  fps50: Record<string, Counts>;
  fps10: Record<string, Counts>;
  explore: Record<string, Counts>;
  lost: Counts;
  timeout: Counts;
}

const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" ? Number(v) : Number.NaN);
const has = (list: readonly string[], v: unknown): v is string => typeof v === "string" && list.includes(v);
const add = (c: Counts, k: string, n: number) => void (c[k] = (c[k] ?? 0) + n);
const perTier = () => Object.fromEntries(RUM_TIERS.map((t) => [t, {} as Counts]));

/** Folds the `perfSql` rows into per-tier bucket counts; rows outside the contract only add to `dropped`. */
export function foldPerf(rows: Record<string, unknown>[]): PerfSummary {
  const s: PerfSummary = { total: 0, dropped: 0, tier: {}, path: perTier(), fps50: perTier(), fps10: perTier(), explore: perTier(), lost: {}, timeout: {} };
  for (const r of rows) {
    const n = num(r.n);
    const ok = has(RUM_TIERS, r.tier) && has(RUM_PATHS, r.path) && has(RUM_FPS, r.fps50) && has(RUM_FPS, r.fps10) && has(RUM_TIMES, r.explore);
    if (!ok || !Number.isFinite(n) || n <= 0) {
      s.dropped += Number.isFinite(n) && n > 0 ? n : 0;
      continue;
    }
    const t = r.tier as string;
    s.total += n;
    add(s.tier, t, n);
    add(s.path[t], r.path as string, n);
    add(s.fps50[t], r.fps50 as string, n);
    add(s.fps10[t], r.fps10 as string, n);
    add(s.explore[t], r.explore as string, n);
    add(s.lost, t, Math.max(0, num(r.lost) || 0));
    add(s.timeout, t, Math.max(0, num(r.timeout) || 0));
  }
  return s;
}

/** Folds the `modeSql` rows; unknown modes are ignored. */
export function foldModes(rows: Record<string, unknown>[]): Counts {
  const modes: Counts = {};
  for (const r of rows) if (has(VISIT_MODES, r.mode)) add(modes, r.mode, Math.max(0, num(r.n) || 0));
  return modes;
}

const pct = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : "-");
const cell = (n: number, whole: number) => (n ? `${n} (${pct(n, whole)})` : "0");

export function mdTable(head: string[], rows: (string | number)[][]): string {
  return [`| ${head.join(" | ")} |`, `|${head.map(() => "---").join("|")}|`, ...rows.map((r) => `| ${r.join(" | ")} |`)].join("\n");
}

function bucketTable(title: string, buckets: readonly string[], by: Record<string, Counts>, totals: Counts): string {
  const rows = RUM_TIERS.map((t) => [t, totals[t] ?? 0, ...buckets.map((b) => cell(by[t]?.[b] ?? 0, totals[t] ?? 0))]);
  return `### ${title}\n\n${mdTable(["tier", "n", ...buckets], rows)}`;
}

export interface VitalsRow { device: string; n: number; sampled: boolean; lcp50: number; lcp75: number; lcp90: number; fcp75: number; ttfb75: number; inp75: number; cls75: number }

/** Web Analytics reports times in microseconds; its "no value" is the 32-bit maximum. */
const ms = (us: number) => (us > 0 && us < 4_294_967_295 ? `${Math.round(us / 1000)} ms` : "n/a");

export function formatReport(p: PerfSummary, modes: Counts, vitals: VitalsRow[], meta: { start: string; days: number }): string {
  if (p.total === 0 && vitals.length === 0) return `No RUM points or Web Vitals since ${meta.start}.`;
  const out = [`## Field performance, last ${meta.days} days (since ${meta.start} UTC)`, ""];
  out.push(`RUM sessions (25% of 3D sessions): ${p.total}${p.dropped ? `, ${p.dropped} off-contract points ignored` : ""}.`, "");
  out.push(mdTable(["tier", "n", "context lost", "boot timeout", "no explore (na)"], RUM_TIERS.map((t) => [t, p.tier[t] ?? 0, cell(p.lost[t] ?? 0, p.tier[t] ?? 0), cell(p.timeout[t] ?? 0, p.tier[t] ?? 0), cell(p.explore[t]?.na ?? 0, p.tier[t] ?? 0)])), "");
  out.push(bucketTable("Load path", RUM_PATHS, p.path, p.tier), "");
  out.push(bucketTable("Median FPS (fps50)", RUM_FPS, p.fps50, p.tier), "");
  out.push(bucketTable("10th percentile FPS (fps10)", RUM_FPS, p.fps10, p.tier), "");
  out.push(bucketTable("Explore time (includes the Boot rover press and the intro)", RUM_TIMES, p.explore, p.tier), "");
  const threeD = (modes["3d"] ?? 0) + (modes.both ?? 0);
  const classic = (modes.classic ?? 0) + (modes.both ?? 0);
  out.push(`3D vs Classic page lifetimes: 3D ${threeD}, Classic ${classic} (both counts on both sides).`, "");
  out.push("### Web Vitals, hard navigations (Web Analytics)", "");
  out.push(mdTable(["device", "n", "LCP p50", "LCP p75", "LCP p90", "FCP p75", "TTFB p75", "INP p75", "CLS p75", "sampled"], vitals.map((v) => [v.device, v.n, ms(v.lcp50), ms(v.lcp75), ms(v.lcp90), ms(v.fcp75), ms(v.ttfb75), ms(v.inp75), v.cls75 >= 0 ? v.cls75.toFixed(3) : "n/a", v.sampled ? "yes" : "no"])));
  return out.join("\n");
}

/** The Web Analytics groups per device type; unknown device types are dropped. */
export function parseVitals(body: unknown): VitalsRow[] {
  const groups = (body as { data?: { viewer?: { accounts?: { vitals?: unknown[] }[] } } })?.data?.viewer?.accounts?.[0]?.vitals;
  if (!Array.isArray(groups)) throw new Error("Web Analytics: unexpected response");
  return groups
    .map((g) => g as { count: number; avg?: { sampleInterval?: number }; dimensions?: { deviceType?: string }; quantiles?: Record<string, number> })
    .filter((g) => has(DEVICE_TYPES, g.dimensions?.deviceType))
    .map((g) => {
      const q = g.quantiles ?? {};
      return { device: g.dimensions!.deviceType!, n: num(g.count), sampled: (g.avg?.sampleInterval ?? 1) > 1, lcp50: num(q.largestContentfulPaintP50), lcp75: num(q.largestContentfulPaintP75), lcp90: num(q.largestContentfulPaintP90), fcp75: num(q.firstContentfulPaintP75), ttfb75: num(q.timeToFirstByteP75), inp75: num(q.interactionToNextPaintP75), cls75: num(q.cumulativeLayoutShiftP75) };
    });
}

function tomlVar(name: string): string | undefined {
  const toml = readFileSync(new URL("../workers/stats/wrangler.toml", import.meta.url), "utf8");
  return new RegExp(`^${name}\\s*=\\s*"([^"]*)"`, "m").exec(toml)?.[1];
}

/** Analytics Engine SQL; refuses anything but a SELECT. */
export async function readSql(token: string, accountId: string, query: string, fetcher: typeof fetch = fetch): Promise<Record<string, unknown>[]> {
  if (!query.startsWith("SELECT ")) throw new Error("rum-report is read-only: SELECT queries only");
  const res = await fetcher(`https://api.cloudflare.com/client/v4/accounts/${accountId}/analytics_engine/sql`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: query });
  if (!res.ok) throw new Error(`Analytics Engine: HTTP ${res.status}`);
  return (await res.text()).split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l) as Record<string, unknown>);
}

async function main() {
  const args = process.argv.slice(2);
  const daysAt = args.indexOf("--days");
  const days = daysAt > -1 ? Number(args[daysAt + 1]) : 30;
  const now = Date.now();
  const start = startDay(now, days);
  const token = process.env.WA_TOKEN?.trim() ?? "";
  const accountId = process.env.WA_ACCOUNT_ID?.trim() ?? "";
  const siteTag = process.env.WA_SITE_TAG ?? tomlVar("WA_SITE_TAG") ?? "";
  const hosts = (process.env.WA_HOSTS ?? tomlVar("WA_HOSTS") ?? "").split(",").map((h) => h.trim()).filter(Boolean);
  if (!token || !HEX32.test(accountId) || !HEX32.test(siteTag) || hosts.length === 0) throw new Error("Set WA_TOKEN and WA_ACCOUNT_ID (see the header of scripts/rum-report.ts)");
  const [perfRows, modeRows, gql] = await Promise.all([
    readSql(token, accountId, perfSql(start)),
    readSql(token, accountId, modeSql(start)),
    fetch("https://api.cloudflare.com/client/v4/graphql", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: VITALS_QUERY, variables: { accountTag: accountId, siteTag, start: `${start}T00:00:00Z`, end: new Date(now).toISOString(), hosts } }),
    }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Web Analytics: HTTP ${r.status}`)))),
  ]);
  const perf = foldPerf(perfRows);
  const modes = foldModes(modeRows);
  const vitals = parseVitals(gql);
  console.log(args.includes("--json") ? JSON.stringify({ start, days, perf, modes, vitals }, null, 2) : formatReport(perf, modes, vitals, { start, days }));
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "rum-report failed");
    process.exit(1);
  });
}
