import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { parseStatsSnapshot, STATS_KEY } from "@/lib/stats/protocol";
import { BACKFILL_DAYS, finalizedThrough, LEDGER_KEY, liveTail, runStats, WA_EXTRA_KEY } from "../../workers/stats/src/run";
import { handleLive, LIVE_CACHE_SECONDS, LIVE_GATE_NAME, LIVE_QUERY_EVERY_MS, LiveGate } from "../../workers/stats/src/live";
import { parseStatsLive, STATS_LIVE_KEY } from "@/lib/stats/live";
import worker from "../../workers/stats/src/index";
import type { Fetcher, Ledger, StatsWorkerEnv } from "../../workers/stats/src/types";

const TOKEN = "test-token-never-logged-0123456789";
const ACCOUNT = "0123456789abcdef0123456789abcdef";
const SITE = "4134db56168b4eb58d19fc1ead78b131";
const AT = (day: string) => Date.parse(`${day}T01:00:00Z`);
const ATH = (day: string, hour: number) => Date.parse(`${day}T${String(hour).padStart(2, "0")}:00:00Z`);

class MemoryKv {
  store = new Map<string, string>();
  puts: string[] = [];
  async get(key: string) {
    return this.store.get(key) ?? null;
  }
  async put(key: string, value: string) {
    this.puts.push(key);
    this.store.set(key, value);
  }
}

interface Calls {
  graphql: { query: string; variables: Record<string, unknown> }[];
  sql: string[];
  auth: string[];
}

const avg = (interval: number | null | undefined) => (interval === null ? {} : { avg: { sampleInterval: interval ?? 1 } });

/** Fake Cloudflare APIs: Web Analytics rows per day, Analytics Engine rows per day. */
function fakeApi(
  data: {
    /** `interval`: average sample interval of the day's rows (default 1, `null` leaves `avg` out); `pathCount` overrides the paths group's count. */
    wa?: Record<string, { count: number; visits: number; country?: string; path?: string; interval?: number | null; pathCount?: number }>;
    asks?: Record<string, number>;
    visits?: Record<string, number>;
    /** perf_events rows per day; the fake honors the query's date range. */
    perf?: Record<string, { fps50: string; explore: string; n: number }[]>;
    errors?: boolean;
    perfFails?: boolean;
    /** Visit pings per day: count and the day's first ping time (AE DateTime, UTC). */
    pings?: Record<string, { n: number; first: string }>;
    /** Web Analytics visits on the cutover day before the cutover time (days-only query). */
    waBefore?: number;
    /** Answer of the live count query. */
    live?: number;
  } = {},
) {
  const calls: Calls = { graphql: [], sql: [], auth: [] };
  const fetcher: Fetcher = async (url, init) => {
    calls.auth.push(new Headers(init?.headers).get("Authorization") ?? "");
    if (url.endsWith("/graphql")) {
      const body = JSON.parse(String(init?.body));
      calls.graphql.push(body);
      if (data.errors) return new Response(JSON.stringify({ data: null, errors: [{ message: "quota exceeded" }] }));
      if (String(body.query).includes("HqVisitsBefore")) {
        const date = String(body.variables.start).slice(0, 10);
        return new Response(JSON.stringify({ data: { viewer: { accounts: [{ days: [{ count: 1, sum: { visits: data.waBefore ?? 0 }, dimensions: { date } }] }] } }, errors: null }));
      }
      const start = String(body.variables.start).slice(0, 10);
      const end = String(body.variables.end).slice(0, 10);
      const rows = Object.entries(data.wa ?? {}).filter(([d]) => d >= start && d < end);
      return new Response(
        JSON.stringify({
          data: {
            viewer: {
              accounts: [
                {
                  days: rows.map(([date, r]) => ({ count: r.count, sum: { visits: r.visits }, ...avg(r.interval), dimensions: { date } })),
                  countries: rows.map(([date, r]) => ({ count: r.count, sum: { visits: r.visits }, ...avg(r.interval), dimensions: { date, countryName: r.country ?? "ID" } })),
                  paths: rows.map(([date, r]) => ({ count: r.pathCount ?? r.count, ...avg(r.interval), dimensions: { date, requestPath: r.path ?? "/en/labs" } })),
                },
              ],
            },
          },
          errors: null,
        }),
      );
    }
    const sql = String(init?.body);
    calls.sql.push(sql);
    if (sql.includes("FROM perf_events")) {
      if (data.perfFails) return new Response("nope", { status: 500 });
      const [start, end] = [...sql.matchAll(/toDateTime\('(\d{4}-\d{2}-\d{2}) 00:00:00'\)/g)].map((m) => m[1]);
      const rows = Object.entries(data.perf ?? {})
        .filter(([day]) => day >= start && day < end)
        .flatMap(([day, list]) => list.map((r) => JSON.stringify({ day, fps50: r.fps50, explore: r.explore, n: String(r.n) })));
      return new Response(rows.join("\n"));
    }
    if (sql.includes("blob2 = 'visit'")) return new Response(JSON.stringify({ n: String(data.live ?? 0) }));
    const lines = sql.includes("FROM ask_events")
      ? Object.entries(data.asks ?? {}).map(([day, n]) => JSON.stringify({ day, topic: "work", chip: "work-best", n: String(n) }))
      : [
          ...Object.entries(data.visits ?? {}).map(([day, n]) => JSON.stringify({ day, mode: "3d", n: String(n), first_at: `${day} 00:00:00` })),
          ...Object.entries(data.pings ?? {}).map(([day, p]) => JSON.stringify({ day, mode: "visit", n: String(p.n), first_at: p.first })),
        ];
    return new Response(lines.join("\n"));
  };
  return { calls, fetcher };
}

function env(kv = new MemoryKv()): StatsWorkerEnv & { STATS_KV: MemoryKv } {
  return { STATS_KV: kv, WA_TOKEN: TOKEN, WA_ACCOUNT_ID: ACCOUNT, WA_SITE_TAG: SITE, WA_HOSTS: "kurniadi.pages.dev,kurniadi.dev" };
}

const ledgerOf = (e: { STATS_KV: MemoryKv }) => JSON.parse(e.STATS_KV.store.get(LEDGER_KEY) ?? "null") as Ledger;
const snapshotOf = (e: { STATS_KV: MemoryKv }) => parseStatsSnapshot(JSON.parse(e.STATS_KV.store.get(STATS_KEY) ?? "null"));

describe("hq-stats run", () => {
  it("backfills history on the first run and starts at the first day with data", async () => {
    const e = env();
    const { calls, fetcher } = fakeApi({ wa: { "2026-10-11": { count: 90, visits: 10 }, "2026-10-13": { count: 30, visits: 0, country: "SG", path: "/en" } }, asks: { "2026-10-10": 2, "2026-10-12": 1 }, visits: { "2026-10-13": 4 } });
    const log = vi.fn();
    const result = await runStats(e, AT("2026-10-14"), fetcher, log);
    expect(result.added).toEqual(["2026-10-10", "2026-10-11", "2026-10-12", "2026-10-13"]);
    expect(result.provisional).toEqual(["2026-10-14"]);
    expect(ledgerOf(e).days.map((d) => d.date)).toEqual(result.added);
    const snap = snapshotOf(e)!;
    expect(snap).not.toBeNull();
    expect(snap.since).toBe("2026-10-10");
    expect(snap.updatedAt).toBe("2026-10-14T01:00:00.000Z");
    expect(snap.visits).toEqual({ d30: 10, all: 10 });
    expect(snap.pageViews).toEqual({ d30: 120, all: 120 });
    expect(snap.countries.all).toEqual(["ID", "SG"]);
    expect(snap.topFloor.all).toBe("L3");
    expect(snap.mode.all).toEqual({ threeD: 4, classic: 0 });
    expect(snap.asks.all.total).toBe(3);
    expect(snap.asks.all.chips).toEqual([{ id: "work-best", topic: "work", n: 3 }]);
    // 184 days (183 of history plus today) in windows of at most 90 days: 3 GraphQL requests; 3 SQL queries (asks, visits, perf).
    expect(calls.graphql).toHaveLength(Math.ceil(BACKFILL_DAYS / 90));
    expect(calls.sql).toHaveLength(3);
    expect(e.STATS_KV.puts).toEqual([LEDGER_KEY, STATS_KEY]);
  });

  it("filters Web Analytics by siteTag, production hosts and bots, and SQL to real questions", async () => {
    const e = env();
    const { calls, fetcher } = fakeApi({ wa: { "2026-10-13": { count: 10, visits: 10 } } });
    await runStats(e, AT("2026-10-14"), fetcher, () => {});
    const { query, variables } = calls.graphql[0];
    expect(variables).toMatchObject({ accountTag: ACCOUNT, siteTag: SITE, hosts: ["kurniadi.pages.dev", "kurniadi.dev"] });
    expect(query).toContain("bot: 0");
    expect(query).toContain("requestHost_in: $hosts");
    expect(calls.sql[0]).toContain("blob1 != 'rejected'");
    expect(calls.sql[0]).toContain("blob13 != 'auto'");
    expect(calls.sql.join(" ")).toContain("SUM(_sample_interval)");
    expect(calls.auth.every((h) => h === `Bearer ${TOKEN}`)).toBe(true);
  });

  it("a second run the same day rebuilds the snapshot from fresh provisional rows and never rewrites a finalized day", async () => {
    const e = env();
    await runStats(e, AT("2026-10-14"), fakeApi({ wa: { "2026-10-13": { count: 10, visits: 10 }, "2026-10-14": { count: 4, visits: 2 } } }).fetcher, () => {});
    const before = e.STATS_KV.store.get(LEDGER_KEY);
    expect(snapshotOf(e)!.pageViews.all).toBe(14);
    e.STATS_KV.puts.length = 0;

    const again = fakeApi({ wa: { "2026-10-13": { count: 999, visits: 999 }, "2026-10-14": { count: 9, visits: 5 } } });
    const same = await runStats(e, ATH("2026-10-14", 5), again.fetcher, () => {});
    expect(same).toMatchObject({ added: [], provisional: ["2026-10-14"], snapshot: true });
    // Only the days after the ledger's last day are fetched.
    expect(again.calls.graphql).toHaveLength(1);
    expect(again.calls.graphql[0].variables).toMatchObject({ start: "2026-10-14T00:00:00Z", end: "2026-10-15T00:00:00Z" });
    expect(e.STATS_KV.store.get(LEDGER_KEY)).toBe(before);
    expect(e.STATS_KV.puts).toEqual([STATS_KEY]);
    const snap = snapshotOf(e)!;
    expect(snap.updatedAt).toBe("2026-10-14T05:00:00.000Z");
    expect(snap.pageViews.all).toBe(19);

    // Next day: 2026-10-14 is finalized with its latest numbers; 2026-10-13 keeps its first numbers.
    const next = fakeApi({ wa: { "2026-10-13": { count: 999, visits: 999 }, "2026-10-14": { count: 20, visits: 10 } } });
    const result = await runStats(e, AT("2026-10-15"), next.fetcher, () => {});
    expect(result.added).toEqual(["2026-10-14"]);
    expect(next.calls.graphql[0].variables).toMatchObject({ start: "2026-10-14T00:00:00Z", end: "2026-10-16T00:00:00Z" });
    expect(ledgerOf(e).days.map((d) => [d.date, d.pageViews])).toEqual([
      ["2026-10-13", 10],
      ["2026-10-14", 20],
    ]);
    expect(snapshotOf(e)!.pageViews.all).toBe(30);
  });

  it("finalizes a day only an hour after it ends", () => {
    expect(finalizedThrough(Date.parse("2026-11-16T00:00:00Z"))).toBe("2026-11-14");
    expect(finalizedThrough(Date.parse("2026-11-16T00:59:59Z"))).toBe("2026-11-14");
    expect(finalizedThrough(Date.parse("2026-11-16T01:00:00Z"))).toBe("2026-11-15");
    expect(finalizedThrough(Date.parse("2026-11-16T04:00:00Z"))).toBe("2026-11-15");
  });

  it("includes today so far in the snapshot on every run without storing it", async () => {
    const e = env();
    await runStats(e, AT("2026-11-16"), fakeApi({ wa: { "2026-11-15": { count: 10, visits: 4 } } }).fetcher, () => {});
    const before = e.STATS_KV.store.get(LEDGER_KEY);
    const api = fakeApi({ wa: { "2026-11-16": { count: 6, visits: 3, country: "SG" } } });
    const result = await runStats(e, ATH("2026-11-16", 8), api.fetcher, () => {});
    expect(result).toMatchObject({ added: [], provisional: ["2026-11-16"], days: 1, snapshot: true });
    expect(e.STATS_KV.store.get(LEDGER_KEY)).toBe(before);
    expect(ledgerOf(e).days.map((d) => d.date)).toEqual(["2026-11-15"]);
    const snap = snapshotOf(e)!;
    expect(snap.updatedAt).toBe("2026-11-16T08:00:00.000Z");
    expect(snap.visits).toEqual({ d30: 7, all: 7 });
    expect(snap.pageViews).toEqual({ d30: 16, all: 16 });
    expect(snap.countries.all).toEqual(["ID", "SG"]);
  });

  it("keeps yesterday provisional during the 00:00 UTC run and stores it at 04:00", async () => {
    const e = env();
    await runStats(e, AT("2026-11-15"), fakeApi({ wa: { "2026-11-14": { count: 10, visits: 4 } } }).fetcher, () => {});
    expect(ledgerOf(e).days.map((d) => d.date)).toEqual(["2026-11-14"]);
    e.STATS_KV.puts.length = 0;
    const wa = { "2026-11-15": { count: 8, visits: 5 }, "2026-11-16": { count: 2, visits: 1 } };

    const midnight = await runStats(e, ATH("2026-11-16", 0), fakeApi({ wa }).fetcher, () => {});
    expect(midnight).toMatchObject({ added: [], provisional: ["2026-11-15", "2026-11-16"] });
    expect(ledgerOf(e).days.map((d) => d.date)).toEqual(["2026-11-14"]);
    expect(e.STATS_KV.puts).toEqual([STATS_KEY]);
    expect(snapshotOf(e)!.visits.all).toBe(10);

    const settled = await runStats(e, ATH("2026-11-16", 4), fakeApi({ wa }).fetcher, () => {});
    expect(settled).toMatchObject({ added: ["2026-11-15"], provisional: ["2026-11-16"] });
    expect(ledgerOf(e).days.map((d) => d.date)).toEqual(["2026-11-14", "2026-11-15"]);
    expect(snapshotOf(e)!.visits.all).toBe(10);
  });

  it("queries the provisional days in the same requests: one Web Analytics call and three SQL queries", async () => {
    const e = env();
    await runStats(e, AT("2026-11-16"), fakeApi({ wa: { "2026-11-15": { count: 10, visits: 4 } } }).fetcher, () => {});
    const api = fakeApi({ wa: { "2026-11-16": { count: 6, visits: 3 } } });
    await runStats(e, ATH("2026-11-16", 8), api.fetcher, () => {});
    expect(api.calls.graphql).toHaveLength(1);
    expect(api.calls.graphql[0].variables).toMatchObject({ start: "2026-11-16T00:00:00Z", end: "2026-11-17T00:00:00Z" });
    expect(api.calls.sql).toHaveLength(3);
    for (const q of api.calls.sql) {
      expect(q).toContain("toDateTime('2026-11-16 00:00:00')");
      expect(q).toContain("toDateTime('2026-11-17 00:00:00')");
    }
  });

  it("never stores a day from a sampled Web Analytics answer and stores the exact numbers on a later run", async () => {
    // Incident 2026-10-16: the 04:00 run got 700 page views, 0 visits and 1000 per floor for a day with 333 and 36.
    const e = env();
    await runStats(e, AT("2026-10-15"), fakeApi({ wa: { "2026-10-14": { count: 9, visits: 3 } } }).fetcher, () => {});
    e.STATS_KV.puts.length = 0;
    const log = vi.fn();
    const sampled = fakeApi({ wa: { "2026-10-15": { count: 700, visits: 0, interval: 100, pathCount: 2000, path: "/en" }, "2026-10-16": { count: 4, visits: 2 } } });
    const held = await runStats(e, ATH("2026-10-16", 4), sampled.fetcher, log);
    expect(held).toMatchObject({ added: [], provisional: ["2026-10-15", "2026-10-16"], days: 1 });
    expect(ledgerOf(e).days.map((d) => d.date)).toEqual(["2026-10-14"]);
    expect(e.STATS_KV.puts).toEqual([STATS_KEY]);
    expect(log.mock.calls.at(-1)?.[0]).toContain("held back 2026-10-15 (page views 700, countries 700, paths 2000, sample interval up to 100)");

    const exact = fakeApi({ wa: { "2026-10-15": { count: 333, visits: 36 }, "2026-10-16": { count: 6, visits: 3 } } });
    const stored = await runStats(e, ATH("2026-10-16", 8), exact.fetcher, () => {});
    expect(exact.calls.graphql[0].variables).toMatchObject({ start: "2026-10-15T00:00:00Z" });
    expect(stored).toMatchObject({ added: ["2026-10-15"], provisional: ["2026-10-16"] });
    expect(ledgerOf(e).days.map((d) => [d.date, d.visits, d.pageViews])).toEqual([
      ["2026-10-14", 3, 9],
      ["2026-10-15", 36, 333],
    ]);
    expect(snapshotOf(e)!.visits.all).toBe(42);
  });

  it("holds back a day whose groups disagree or whose rows carry no sample interval", async () => {
    for (const day of [{ count: 333, visits: 36, pathCount: 2000 }, { count: 333, visits: 36, interval: null }]) {
      const e = env();
      const result = await runStats(e, AT("2026-10-16"), fakeApi({ wa: { "2026-10-14": { count: 9, visits: 3 }, "2026-10-15": day } }).fetcher, () => {});
      expect(result).toMatchObject({ added: ["2026-10-14"], provisional: ["2026-10-15", "2026-10-16"] });
      expect(snapshotOf(e)!.visits.all).toBe(39);
    }
  });

  it("stores a sampled day after the grace period so the ledger keeps moving", async () => {
    const e = env();
    await runStats(e, AT("2026-10-14"), fakeApi({ wa: { "2026-10-13": { count: 9, visits: 3 } } }).fetcher, () => {});
    const log = vi.fn();
    const wa = { "2026-10-14": { count: 500, visits: 100, interval: 10 }, "2026-10-15": { count: 4, visits: 2 } };
    const early = await runStats(e, AT("2026-10-17"), fakeApi({ wa }).fetcher, () => {});
    expect(early.added).toEqual([]);
    const late = await runStats(e, AT("2026-10-18"), fakeApi({ wa }).fetcher, log);
    expect(late.added).toEqual(["2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17"]);
    expect(log.mock.calls.at(-1)?.[0]).toContain("stored 2026-10-14 sampled after 3 days");
  });

  it("adds the extra rows of a retired Web Analytics site to the days it covers, only while they are rolled up", async () => {
    const e = env();
    await runStats(e, AT("2026-10-15"), fakeApi({ wa: { "2026-10-14": { count: 9, visits: 3 } } }).fetcher, () => {});
    e.STATS_KV.store.set(
      WA_EXTRA_KEY,
      JSON.stringify({
        v: 1,
        note: "retired site",
        rows: {
          days: [
            { date: "2026-10-14", count: 50, visits: 50 },
            { date: "2026-10-15", count: 5, visits: 3 },
            { date: "2026-10-16", count: 120, visits: 3, sampleInterval: 1.02 },
          ],
          countries: [
            { date: "2026-10-15", country: "ID", count: 5, visits: 3 },
            { date: "2026-10-16", country: "SG", count: 120, visits: 3 },
          ],
          paths: [
            { date: "2026-10-15", path: "/en/labs", count: 5 },
            { date: "2026-10-16", path: "/en/journey", count: 120 },
          ],
        },
      }),
    );
    const result = await runStats(e, ATH("2026-10-16", 12), fakeApi({ wa: { "2026-10-15": { count: 333, visits: 36 }, "2026-10-16": { count: 4, visits: 2, path: "/en/journey" } } }).fetcher, () => {});
    expect(result).toMatchObject({ added: ["2026-10-15"], provisional: ["2026-10-16"] });
    // 2026-10-14 is in the ledger already: its extra row is never read again.
    expect(ledgerOf(e).days.map((d) => [d.date, d.visits, d.pageViews])).toEqual([
      ["2026-10-14", 3, 9],
      ["2026-10-15", 39, 338],
    ]);
    const snap = snapshotOf(e)!;
    expect(snap.visits.all).toBe(3 + 39 + 5);
    expect(snap.pageViews.all).toBe(9 + 338 + 124);
    expect(snap.countries.all).toEqual(["ID", "SG"]);
    expect(snap.topFloor.all).toBe("L3");
  });

  it("refuses malformed extra rows and writes nothing", async () => {
    for (const bad of ["{nope", JSON.stringify({ v: 2, rows: { days: [], countries: [], paths: [] } }), JSON.stringify({ v: 1, note: "", rows: { days: [{ date: "x", count: 1, visits: 1 }], countries: [], paths: [] } })]) {
      const kv = new MemoryKv();
      kv.store.set(WA_EXTRA_KEY, bad);
      await expect(runStats(env(kv), AT("2026-10-14"), fakeApi({}).fetcher, () => {})).rejects.toThrow(/extra Web Analytics rows/);
      expect(kv.puts).toEqual([]);
    }
  });

  it("catches up every missed day after a failed run", async () => {
    const e = env();
    await runStats(e, AT("2026-10-14"), fakeApi({ wa: { "2026-10-13": { count: 10, visits: 10 } } }).fetcher, () => {});
    const result = await runStats(e, AT("2026-10-17"), fakeApi({}).fetcher, () => {});
    expect(result.added).toEqual(["2026-10-14", "2026-10-15", "2026-10-16"]);
  });

  it("writes nothing when an API answers with errors, and never logs the token", async () => {
    const e = env();
    const log = vi.fn();
    await expect(runStats(e, AT("2026-10-14"), fakeApi({ errors: true }).fetcher, log)).rejects.toThrow(/Web Analytics/);
    expect(e.STATS_KV.puts).toEqual([]);
    const failingSql: Fetcher = async (url) => (url.endsWith("/graphql") ? fakeApi({}).fetcher(url, { body: JSON.stringify({ variables: {} }) }) : new Response("nope", { status: 403 }));
    await expect(runStats(e, AT("2026-10-14"), failingSql, log)).rejects.toThrow(/Analytics Engine/);
    expect(e.STATS_KV.puts).toEqual([]);
    expect(JSON.stringify(log.mock.calls)).not.toContain(TOKEN);
  });

  it("refuses to run without its configuration or with a corrupt ledger", async () => {
    await expect(runStats({ ...env(), WA_TOKEN: undefined }, AT("2026-10-14"), fakeApi({}).fetcher, () => {})).rejects.toThrow(/configuration/);
    await expect(runStats({ ...env(), WA_ACCOUNT_ID: "../evil" }, AT("2026-10-14"), fakeApi({}).fetcher, () => {})).rejects.toThrow(/configuration/);
    const kv = new MemoryKv();
    kv.store.set(LEDGER_KEY, "{broken");
    await expect(runStats(env(kv), AT("2026-10-14"), fakeApi({}).fetcher, () => {})).rejects.toThrow(/ledger/);
    expect(kv.puts).toEqual([]);
  });

  it("stores no snapshot while there is no data at all", async () => {
    const e = env();
    const result = await runStats(e, AT("2026-10-14"), fakeApi({}).fetcher, () => {});
    expect(result).toEqual({ added: [], provisional: [], days: 0, snapshot: false });
    expect(e.STATS_KV.puts).toEqual([]);
  });

  it("rolls up perf_events into the snapshot perf block", async () => {
    const e = env();
    const { calls, fetcher } = fakeApi({
      wa: { "2026-10-13": { count: 10, visits: 10 } },
      perf: {
        "2026-10-12": [{ fps50: "55+", explore: "lt3s", n: 4 }],
        "2026-10-13": [
          { fps50: "45-54", explore: "5-8s", n: 2 },
          { fps50: "na", explore: "na", n: 1 },
          { fps50: "bogus", explore: "lt3s", n: 50 },
        ],
      },
    });
    await runStats(e, AT("2026-10-14"), fetcher, () => {});
    const perfSql = calls.sql.find((q) => q.includes("FROM perf_events"))!;
    expect(perfSql).toContain("blob1 = '1'");
    expect(perfSql).toContain("SUM(_sample_interval)");
    expect(perfSql).toContain("blob4 AS fps50");
    expect(perfSql).toContain("blob6 AS explore");
    const snap = snapshotOf(e)!;
    expect(snap.since).toBe("2026-10-12");
    expect(snap.perf).toEqual({ d30: { sessions: 7, measured: 6, fps55: 4, explore: "lt3s" }, all: { sessions: 7, measured: 6, fps55: 4, explore: "lt3s" } });
    expect(ledgerOf(e).days.find((d) => d.date === "2026-10-13")?.perf).toEqual({ sessions: 3, measured: 2, fps55: 0, explore: { "5-8s": 2 } });
  });

  const stripPerf = (d: object) => Object.fromEntries(Object.entries(d).filter(([k]) => k !== "perf"));
  /** A ledger written before perf existed: the same days, no perf field. */
  function legacyLedger(dates: string[]): Ledger {
    return { v: 1, days: dates.map((date, i) => ({ date, visits: 10 + i, pageViews: 20 + i, countries: ["ID"], floors: { L3: 20 + i }, mode: { threeD: 1, classic: 1 }, asks: { total: 1, topics: { work: 1 }, chips: {} } })) };
  }
  const PERF_ROWS = {
    "2026-07-10": [{ fps50: "55+", explore: "lt3s", n: 5 }],
    "2026-07-16": [{ fps50: "55+", explore: "3-5s", n: 2 }],
    "2026-10-13": [{ fps50: "30-44", explore: "8-12s", n: 3 }],
  };

  it("fills perf once for stored days inside the Analytics Engine retention", async () => {
    const e = env();
    const legacy = legacyLedger(["2026-07-10", "2026-07-16", "2026-10-12", "2026-10-13"]);
    e.STATS_KV.store.set(LEDGER_KEY, JSON.stringify(legacy));
    const api = fakeApi({ perf: PERF_ROWS });
    const result = await runStats(e, AT("2026-10-14"), api.fetcher, () => {});
    expect(result).toEqual({ added: [], provisional: ["2026-10-14"], days: 4, snapshot: true });
    // One Web Analytics call and the three provisional queries for today, plus one perf backfill query.
    expect(api.calls.graphql).toHaveLength(1);
    expect(api.calls.sql).toHaveLength(4);
    // AE keeps 90 days: 2026-07-16 is the first day inside the window on 2026-10-14.
    const backfill = api.calls.sql.filter((q) => q.includes("toDateTime('2026-07-16 00:00:00')"));
    expect(backfill).toHaveLength(1);
    expect(backfill[0]).toContain("FROM perf_events");
    expect(backfill[0]).toContain("toDateTime('2026-10-14 00:00:00')");
    const ledger = ledgerOf(e);
    expect(ledger.days.map((d) => d.perf?.sessions ?? null)).toEqual([null, 2, 0, 3]);
    expect(ledger.days.map(stripPerf)).toEqual(legacy.days);
    expect(e.STATS_KV.puts).toEqual([LEDGER_KEY, STATS_KEY]);
    const snap = snapshotOf(e)!;
    expect(snap.perf).toEqual({ d30: { sessions: 3, measured: 3, fps55: 0, explore: "8-12s" }, all: { sessions: 5, measured: 5, fps55: 2, explore: "8-12s" } });
    expect(snap.visits.all).toBe(10 + 11 + 12 + 13);

    // Filled days are never queried again.
    const again = fakeApi({ perf: PERF_ROWS });
    const same = await runStats(e, ATH("2026-10-14", 5), again.fetcher, () => {});
    expect(same).toEqual({ added: [], provisional: ["2026-10-14"], days: 4, snapshot: true });
    expect(again.calls.sql).toHaveLength(3);
    expect(again.calls.sql.some((q) => q.includes("toDateTime('2026-07-16 00:00:00')"))).toBe(false);
    expect(ledgerOf(e).days.map((d) => d.perf?.sessions ?? null)).toEqual([null, 2, 0, 3]);
  });

  it("fills perf for stored days with one extra query while appending new days", async () => {
    const e = env();
    const legacy = legacyLedger(["2026-07-16", "2026-10-12"]);
    e.STATS_KV.store.set(LEDGER_KEY, JSON.stringify(legacy));
    const api = fakeApi({ wa: { "2026-10-13": { count: 30, visits: 10 } }, perf: PERF_ROWS });
    const result = await runStats(e, AT("2026-10-14"), api.fetcher, () => {});
    expect(result.added).toEqual(["2026-10-13"]);
    expect(api.calls.sql).toHaveLength(4);
    expect(api.calls.sql.filter((q) => q.includes("FROM perf_events"))).toHaveLength(2);
    const ledger = ledgerOf(e);
    expect(ledger.days.map((d) => [d.date, d.perf?.sessions])).toEqual([
      ["2026-07-16", 2],
      ["2026-10-12", 0],
      ["2026-10-13", 3],
    ]);
    expect(ledger.days.slice(0, 2).map(stripPerf)).toEqual(legacy.days);
    expect(e.STATS_KV.puts).toEqual([LEDGER_KEY, STATS_KEY]);
    expect(snapshotOf(e)!.perf?.all.sessions).toBe(5);
  });

  it("never backfills perf for stored days beyond the retention and keeps them without perf", async () => {
    const e = env();
    e.STATS_KV.store.set(LEDGER_KEY, JSON.stringify(legacyLedger(["2026-07-10", "2026-07-15"])));
    const api = fakeApi({ wa: { "2026-10-13": { count: 30, visits: 10 } }, perf: PERF_ROWS });
    await runStats(e, AT("2026-10-14"), api.fetcher, () => {});
    expect(api.calls.sql.filter((q) => q.includes("FROM perf_events"))).toHaveLength(1);
    const days = ledgerOf(e).days;
    expect(days.slice(0, 2).map((d) => d.perf ?? null)).toEqual([null, null]);
    expect(days.slice(2).every((d) => d.perf)).toBe(true);
    expect(days.at(-1)?.perf?.sessions).toBe(3);
  });

  it("writes nothing when the perf backfill query fails", async () => {
    const e = env();
    const raw = JSON.stringify(legacyLedger(["2026-10-12", "2026-10-13"]));
    e.STATS_KV.store.set(LEDGER_KEY, raw);
    await expect(runStats(e, AT("2026-10-14"), fakeApi({ perfFails: true }).fetcher, () => {})).rejects.toThrow(/Analytics Engine/);
    expect(e.STATS_KV.puts).toEqual([]);
    expect(e.STATS_KV.store.get(LEDGER_KEY)).toBe(raw);
  });

  it("runs from the scheduled handler at the scheduled time", async () => {
    const e = env();
    const spy = vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => fakeApi({ wa: { "2026-10-13": { count: 10, visits: 10 } } }).fetcher(String(input), init));
    try {
      await worker.scheduled({ cron: "17 * * * *", scheduledTime: AT("2026-10-14") }, e);
    } finally {
      spy.mockRestore();
    }
    expect(snapshotOf(e)!.updatedAt).toBe("2026-10-14T01:00:00.000Z");
  });
});

describe("hq-stats schedule", () => {
  it("runs every hour, 17 minutes past the hour (owner decision 2026-10-24)", () => {
    const toml = readFileSync("workers/stats/wrangler.toml", "utf8");
    expect(toml).toMatch(/^crons = \["17 \* \* \* \*"\]$/m);
  });

  it("has no route and no public URL: the fetch handler answers only the service binding", () => {
    const toml = readFileSync("workers/stats/wrangler.toml", "utf8");
    expect(toml).toMatch(/^workers_dev = false$/m);
    expect(toml).toMatch(/^preview_urls = false$/m);
    expect(toml).not.toMatch(/^\s*routes?\s*=/m);
    expect(readFileSync("wrangler.toml", "utf8")).toMatch(/binding = "STATS"\nservice = "hq-stats"/);
  });
});

describe("hq-stats first-party visits (owner decision 2026-10-24)", () => {
  const liveOf = (e: { STATS_KV: MemoryKv }) => parseStatsLive(JSON.parse(e.STATS_KV.store.get(STATS_LIVE_KEY) ?? "null"));

  it("splits the cutover day by time: Web Analytics before the first ping, pings after, with no double counting", async () => {
    const e = env();
    const api = fakeApi({
      wa: { "2026-10-22": { count: 40, visits: 9 }, "2026-10-23": { count: 50, visits: 12 }, "2026-10-24": { count: 20, visits: 8 } },
      pings: { "2026-10-23": { n: 7, first: "2026-10-23 15:04:05" }, "2026-10-24": { n: 3, first: "2026-10-24 00:10:00" } },
      waBefore: 5,
    });
    const log = vi.fn();
    await runStats(e, ATH("2026-10-24", 3), api.fetcher, log);
    const ledger = ledgerOf(e);
    expect(ledger.cutover).toBe("2026-10-23T15:04:05Z");
    const byDate = Object.fromEntries(ledger.days.map((d) => [d.date, d]));
    expect(byDate["2026-10-22"].visits).toBe(9);
    expect(byDate["2026-10-22"].visitSource).toBeUndefined();
    expect(byDate["2026-10-23"]).toMatchObject({ visits: 5 + 7, visitSource: "mixed", firstParty: 7 });
    // Today: pings only (the Web Analytics 8 is not added).
    expect(snapshotOf(e)!.visits.all).toBe(9 + 12 + 3);
    const before = api.calls.graphql.find((g) => g.query.includes("HqVisitsBefore"))!;
    expect(before.variables).toMatchObject({ start: "2026-10-23T00:00:00Z", end: "2026-10-23T15:04:05Z" });
    expect(liveOf(e)).toEqual({ v: 1, updatedAt: snapshotOf(e)!.updatedAt, from: "2026-10-24T00:00:00Z", visits: 3 });
    expect(log.mock.calls.at(-1)?.[0]).toContain("first-party visits since 2026-10-23T15:04:05Z (new)");
  });

  it("keeps the stored cutover and stops asking Web Analytics for the cutover day once it is stored", async () => {
    const e = env();
    await runStats(e, ATH("2026-10-24", 3), fakeApi({ wa: { "2026-10-23": { count: 50, visits: 12 } }, pings: { "2026-10-23": { n: 7, first: "2026-10-23 15:04:05" } }, waBefore: 5 }).fetcher, () => {});
    const again = fakeApi({ wa: { "2026-10-24": { count: 10, visits: 4 } }, pings: { "2026-10-24": { n: 6, first: "2026-10-24 01:00:00" } } });
    await runStats(e, ATH("2026-10-24", 4), again.fetcher, () => {});
    expect(ledgerOf(e).cutover).toBe("2026-10-23T15:04:05Z");
    expect(again.calls.graphql.some((g) => g.query.includes("HqVisitsBefore"))).toBe(false);
    expect(snapshotOf(e)!.visits.all).toBe(12 + 6);
  });

  it("falls back to Web Analytics for a day whose pings outrun its page views, and adds nothing live", async () => {
    const e = env();
    const kv = e.STATS_KV;
    kv.store.set(LEDGER_KEY, JSON.stringify({ v: 1, days: [], cutover: "2026-10-23T15:04:05Z" }));
    await runStats(e, ATH("2026-10-24", 3), fakeApi({ wa: { "2026-10-24": { count: 10, visits: 4 } }, pings: { "2026-10-24": { n: 900, first: "2026-10-24 00:00:01" } } }).fetcher, () => {});
    expect(snapshotOf(e)!.visits.all).toBe(4);
    expect(liveOf(e)).toMatchObject({ from: null, visits: 0 });
  });

  it("writes no live tail and no cutover before the first ping", async () => {
    const e = env();
    await runStats(e, AT("2026-10-14"), fakeApi({ wa: { "2026-10-13": { count: 10, visits: 10 } }, visits: { "2026-10-13": 2 } }).fetcher, () => {});
    expect(e.STATS_KV.store.has(STATS_LIVE_KEY)).toBe(false);
    expect(ledgerOf(e).cutover).toBeUndefined();
  });

  it("refuses a ledger with a malformed cutover", async () => {
    const e = env();
    e.STATS_KV.store.set(LEDGER_KEY, JSON.stringify({ v: 1, days: [], cutover: "yesterday" }));
    await expect(runStats(e, AT("2026-10-14"), fakeApi().fetcher, () => {})).rejects.toThrow(/cutover/);
    expect(e.STATS_KV.puts).toEqual([]);
  });

  it("starts the live tail at the cutover when it is later than the oldest unstored day", () => {
    const day = (date: string, firstParty?: number) => ({ date, visits: 0, pageViews: 0, countries: [], floors: {}, mode: { threeD: 0, classic: 0 }, asks: { total: 0, topics: {}, chips: {} }, ...(firstParty === undefined ? {} : { firstParty }) });
    expect(liveTail([day("2026-10-23"), day("2026-10-24", 4)], "2026-10-24T08:00:00Z", "2026-10-24T09:17:00.000Z")).toEqual({ v: 1, updatedAt: "2026-10-24T09:17:00.000Z", from: "2026-10-24T08:00:00Z", visits: 4 });
    expect(liveTail([], "2026-10-24T08:00:00Z", "2026-10-24T09:17:00.000Z").from).toBeNull();
  });
});

describe("hq-stats GET /live (service binding only, one query a minute)", () => {
  const NOW = Date.parse("2026-10-24T09:30:00Z");
  const FROM = "2026-10-24T00:00:00Z";
  const req = (path: string, method = "GET") => new Request(`https://hq-stats.internal${path}`, { method });

  class MemoryStorage {
    data = new Map<string, unknown>();
    async get<T>(key: string) {
      return this.data.get(key) as T | undefined;
    }
    async put<T>(key: string, value: T) {
      this.data.set(key, structuredClone(value));
    }
  }

  class MemoryCache {
    store = new Map<string, Response>();
    matches = 0;
    async match(key: string) {
      this.matches += 1;
      return this.store.get(key)?.clone();
    }
    async put(key: string, response: Response) {
      this.store.set(key, response.clone());
    }
  }

  /** One gate shared by every "data center" (each with its own cache), like the single Durable Object. */
  function setup(live = 14) {
    const api = fakeApi({ live });
    const clock = { t: NOW };
    const gate = new LiveGate({ storage: new MemoryStorage() }, env(), api.fetcher, () => clock.t);
    let gateCalls = 0;
    const e: StatsWorkerEnv = {
      ...env(),
      LIVE_GATE: {
        idFromName: (name) => name,
        get: (id) => ({
          fetch: async (input) => {
            expect(id).toBe(LIVE_GATE_NAME);
            gateCalls += 1;
            return gate.fetch(new Request(input));
          },
        }),
      },
    };
    return { api, clock, gate, e, gateCalls: () => gateCalls };
  }

  it("counts visit pings since a valid time with one fixed query", async () => {
    const { api, e } = setup();
    const res = await handleLive(req(`/live?from=${FROM}`), e, NOW, new MemoryCache());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ n: 14 });
    expect(api.calls.sql).toEqual(["SELECT SUM(_sample_interval) AS n FROM visit_events WHERE timestamp >= toDateTime('2026-10-24 00:00:00') AND blob1 = '1' AND blob2 = 'visit' FORMAT JSONEachRow"]);
  });

  it("serves a cache hit without asking the gate or Analytics Engine", async () => {
    const { api, e, gateCalls } = setup();
    const cache = new MemoryCache();
    await handleLive(req(`/live?from=${FROM}`), e, NOW, cache);
    const hit = await handleLive(req(`/live?from=${FROM}`), e, NOW + 5000, cache);
    expect(hit.status).toBe(200);
    expect(await hit.json()).toEqual({ n: 14 });
    expect(hit.headers.get("Cache-Control")).toBe(`public, max-age=${LIVE_CACHE_SECONDS}`);
    expect(cache.matches).toBe(2);
    expect(gateCalls()).toBe(1);
    expect(api.calls.sql).toHaveLength(1);
  });

  it("caps Analytics Engine at one query a minute across every data center and concurrent caller", async () => {
    const { api, clock, e } = setup();
    // Ten data centers (ten empty caches) asking at once, then again within the minute.
    const first = await Promise.all(Array.from({ length: 10 }, () => handleLive(req(`/live?from=${FROM}`), e, clock.t, new MemoryCache())));
    expect(first.map((r) => r.status)).toEqual(Array(10).fill(200));
    expect(await Promise.all(first.map((r) => r.json()))).toEqual(Array(10).fill({ n: 14 }));
    clock.t += LIVE_QUERY_EVERY_MS - 1;
    await handleLive(req(`/live?from=${FROM}`), e, clock.t, new MemoryCache());
    expect(api.calls.sql).toHaveLength(1);
    // Another from inside the window is busy (the snapshot is served), never a second query.
    expect((await handleLive(req("/live?from=2026-10-24T01:00:00Z"), e, clock.t, new MemoryCache())).status).toBe(503);
    expect(api.calls.sql).toHaveLength(1);
    clock.t += 1;
    await handleLive(req(`/live?from=${FROM}`), e, clock.t, new MemoryCache());
    expect(api.calls.sql).toHaveLength(2);
    // A day of steady traffic, a request every 10 s from fresh caches: at most one query a minute.
    for (let i = 0; i < 8640; i++) {
      clock.t += 10_000;
      await handleLive(req(`/live?from=${FROM}`), e, clock.t, undefined);
    }
    expect(api.calls.sql.length).toBeLessThanOrEqual(2 + 1440);
  });

  it("never hands a concurrent caller with another from the in-flight answer", async () => {
    const { api, e } = setup();
    const [a, b] = await Promise.all([handleLive(req(`/live?from=${FROM}`), e, NOW, new MemoryCache()), handleLive(req("/live?from=2026-10-24T01:00:00Z"), e, NOW, new MemoryCache())]);
    expect([a.status, b.status]).toEqual([200, 503]);
    expect(api.calls.sql).toHaveLength(1);
  });

  it("keeps the slot across a restart (storage) and after a failure, without retry queries", async () => {
    const storage = new MemoryStorage();
    let fail = true;
    const calls: string[] = [];
    const fetcher: Fetcher = async (_url, init) => {
      calls.push(String(init?.body));
      return fail ? new Response("down", { status: 500 }) : new Response(JSON.stringify({ n: "3" }));
    };
    const gate = () => new LiveGate({ storage }, env(), fetcher, () => NOW);
    expect((await gate().fetch(new Request(`https://live-gate/live?from=${FROM}`))).status).toBe(502);
    fail = false;
    expect((await gate().fetch(new Request(`https://live-gate/live?from=${FROM}`))).status).toBe(502);
    expect(calls).toHaveLength(1);
    const later = new LiveGate({ storage }, env(), fetcher, () => NOW + LIVE_QUERY_EVERY_MS);
    expect(await (await later.fetch(new Request(`https://live-gate/live?from=${FROM}`))).json()).toEqual({ n: 3 });
    expect(calls).toHaveLength(2);
  });

  it("rejects bad, future and too old times, other paths and methods, and answers 503 without the gate", async () => {
    const { api, e } = setup(1);
    for (const from of ["", "2026-10-24", "2026-10-24T00:00:00.000Z", "2026-10-24T00:00:00Z' OR 1=1", "2026-10-25T00:00:00Z", "2026-10-01T00:00:00Z"]) {
      expect((await handleLive(req(`/live?from=${encodeURIComponent(from)}`), e, NOW, new MemoryCache())).status).toBe(400);
    }
    expect((await handleLive(req("/"), e, NOW)).status).toBe(404);
    expect((await handleLive(req(`/live?from=${FROM}`, "POST"), e, NOW)).status).toBe(405);
    expect((await handleLive(req(`/live?from=${FROM}`), env(), NOW, new MemoryCache())).status).toBe(503);
    expect(api.calls.sql).toEqual([]);
  });

  it("answers 502 without detail when Analytics Engine fails, caches nothing and never echoes the token", async () => {
    const storage = new MemoryStorage();
    const gate = new LiveGate({ storage }, env(), async () => new Response("boom", { status: 500 }), () => NOW);
    const e: StatsWorkerEnv = { ...env(), LIVE_GATE: { idFromName: (n) => n, get: () => ({ fetch: (input) => gate.fetch(new Request(input)) }) } };
    const cache = new MemoryCache();
    const res = await handleLive(req(`/live?from=${FROM}`), e, NOW, cache);
    expect(res.status).toBe(502);
    expect(await res.text()).not.toContain(TOKEN);
    expect(cache.store.size).toBe(0);
  });
});
