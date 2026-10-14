import { describe, expect, it, vi } from "vitest";
import { parseStatsSnapshot, STATS_KEY } from "@/lib/stats/protocol";
import { BACKFILL_DAYS, LEDGER_KEY, runStats } from "../../workers/stats/src/run";
import worker from "../../workers/stats/src/index";
import type { Fetcher, Ledger, StatsWorkerEnv } from "../../workers/stats/src/types";

const TOKEN = "test-token-never-logged-0123456789";
const ACCOUNT = "0123456789abcdef0123456789abcdef";
const SITE = "4134db56168b4eb58d19fc1ead78b131";
const AT = (day: string) => Date.parse(`${day}T01:00:00Z`);

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

/** Fake Cloudflare APIs: Web Analytics rows per day, Analytics Engine rows per day. */
function fakeApi(
  data: {
    wa?: Record<string, { count: number; visits: number; country?: string; path?: string }>;
    asks?: Record<string, number>;
    visits?: Record<string, number>;
    /** perf_events rows per day; the fake honors the query's date range. */
    perf?: Record<string, { fps50: string; explore: string; n: number }[]>;
    errors?: boolean;
    perfFails?: boolean;
  } = {},
) {
  const calls: Calls = { graphql: [], sql: [], auth: [] };
  const fetcher: Fetcher = async (url, init) => {
    calls.auth.push(new Headers(init?.headers).get("Authorization") ?? "");
    if (url.endsWith("/graphql")) {
      const body = JSON.parse(String(init?.body));
      calls.graphql.push(body);
      if (data.errors) return new Response(JSON.stringify({ data: null, errors: [{ message: "quota exceeded" }] }));
      const start = String(body.variables.start).slice(0, 10);
      const end = String(body.variables.end).slice(0, 10);
      const rows = Object.entries(data.wa ?? {}).filter(([d]) => d >= start && d < end);
      return new Response(
        JSON.stringify({
          data: {
            viewer: {
              accounts: [
                {
                  days: rows.map(([date, r]) => ({ count: r.count, sum: { visits: r.visits }, dimensions: { date } })),
                  countries: rows.map(([date, r]) => ({ count: r.count, sum: { visits: r.visits }, dimensions: { date, countryName: r.country ?? "ID" } })),
                  paths: rows.map(([date, r]) => ({ count: r.count, dimensions: { date, requestPath: r.path ?? "/en/labs" } })),
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
    const lines = sql.includes("FROM ask_events")
      ? Object.entries(data.asks ?? {}).map(([day, n]) => JSON.stringify({ day, topic: "work", chip: "work-best", n: String(n) }))
      : Object.entries(data.visits ?? {}).map(([day, n]) => JSON.stringify({ day, mode: "3d", n: String(n) }));
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
    expect(ledgerOf(e).days.map((d) => d.date)).toEqual(result.added);
    const snap = snapshotOf(e)!;
    expect(snap).not.toBeNull();
    expect(snap.since).toBe("2026-10-10");
    expect(snap.updatedAt).toBe("2026-10-14T00:00:00.000Z");
    expect(snap.visits).toEqual({ d30: 10, all: 10 });
    expect(snap.pageViews).toEqual({ d30: 120, all: 120 });
    expect(snap.countries.all).toEqual(["ID", "SG"]);
    expect(snap.topFloor.all).toBe("L3");
    expect(snap.mode.all).toEqual({ threeD: 4, classic: 0 });
    expect(snap.asks.all.total).toBe(3);
    expect(snap.asks.all.chips).toEqual([{ id: "work-best", topic: "work", n: 3 }]);
    // 183 days in windows of at most 90 days: 3 GraphQL requests; 3 SQL queries (asks, visits, perf).
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
    expect(calls.sql.join(" ")).toContain("SUM(_sample_interval)");
    expect(calls.auth.every((h) => h === `Bearer ${TOKEN}`)).toBe(true);
  });

  it("does nothing more the same day and never rewrites a finalized day", async () => {
    const e = env();
    await runStats(e, AT("2026-10-14"), fakeApi({ wa: { "2026-10-13": { count: 10, visits: 10 } } }).fetcher, () => {});
    const before = e.STATS_KV.store.get(LEDGER_KEY);
    const again = fakeApi({ wa: { "2026-10-13": { count: 999, visits: 999 } } });
    const same = await runStats(e, AT("2026-10-14") + 3_600_000, again.fetcher, () => {});
    expect(same.added).toEqual([]);
    expect(again.calls.graphql).toHaveLength(0);
    expect(e.STATS_KV.store.get(LEDGER_KEY)).toBe(before);

    // Next day: only 2026-10-14 is fetched and appended; 2026-10-13 keeps its first numbers.
    const next = fakeApi({ wa: { "2026-10-13": { count: 999, visits: 999 }, "2026-10-14": { count: 20, visits: 10 } } });
    const result = await runStats(e, AT("2026-10-15"), next.fetcher, () => {});
    expect(result.added).toEqual(["2026-10-14"]);
    expect(next.calls.graphql[0].variables).toMatchObject({ start: "2026-10-14T00:00:00Z", end: "2026-10-15T00:00:00Z" });
    const ledger = ledgerOf(e);
    expect(ledger.days.map((d) => [d.date, d.pageViews])).toEqual([
      ["2026-10-13", 10],
      ["2026-10-14", 20],
    ]);
    expect(snapshotOf(e)!.pageViews.all).toBe(30);
  });

  it("catches up every missed day after a failed run", async () => {
    const e = env();
    await runStats(e, AT("2026-10-14"), fakeApi({ wa: { "2026-10-13": { count: 10, visits: 10 } } }).fetcher, () => {});
    const result = await runStats(e, AT("2026-10-17"), fakeApi({}).fetcher, () => {});
    expect(result.added).toEqual(["2026-10-14", "2026-10-15", "2026-10-16"]);
  });

  it("rewrites a missing or stale snapshot from the ledger without fetching", async () => {
    const e = env();
    await runStats(e, AT("2026-10-14"), fakeApi({ wa: { "2026-10-13": { count: 10, visits: 10 } } }).fetcher, () => {});
    e.STATS_KV.store.delete(STATS_KEY);
    const api = fakeApi({});
    const result = await runStats(e, AT("2026-10-14"), api.fetcher, () => {});
    expect(result).toMatchObject({ added: [], snapshot: true });
    expect(api.calls.graphql).toHaveLength(0);
    expect(snapshotOf(e)!.pageViews.all).toBe(10);
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
    expect(result).toEqual({ added: [], days: 0, snapshot: false });
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

  it("fills perf once for stored days inside the Analytics Engine retention when the ledger is up to date", async () => {
    const e = env();
    const legacy = legacyLedger(["2026-07-10", "2026-07-16", "2026-10-12", "2026-10-13"]);
    e.STATS_KV.store.set(LEDGER_KEY, JSON.stringify(legacy));
    const api = fakeApi({ perf: PERF_ROWS });
    const result = await runStats(e, AT("2026-10-14"), api.fetcher, () => {});
    expect(result).toEqual({ added: [], days: 4, snapshot: true });
    expect(api.calls.graphql).toHaveLength(0);
    expect(api.calls.sql).toHaveLength(1);
    // AE keeps 90 days: 2026-07-16 is the first day inside the window on 2026-10-14.
    expect(api.calls.sql[0]).toContain("toDateTime('2026-07-16 00:00:00')");
    expect(api.calls.sql[0]).toContain("toDateTime('2026-10-14 00:00:00')");
    const ledger = ledgerOf(e);
    expect(ledger.days.map((d) => d.perf?.sessions ?? null)).toEqual([null, 2, 0, 3]);
    expect(ledger.days.map(stripPerf)).toEqual(legacy.days);
    expect(e.STATS_KV.puts).toEqual([LEDGER_KEY, STATS_KEY]);
    const snap = snapshotOf(e)!;
    expect(snap.perf).toEqual({ d30: { sessions: 3, measured: 3, fps55: 0, explore: "8-12s" }, all: { sessions: 5, measured: 5, fps55: 2, explore: "8-12s" } });
    expect(snap.visits.all).toBe(10 + 11 + 12 + 13);

    // Filled days are never queried again.
    const again = fakeApi({ perf: PERF_ROWS });
    const same = await runStats(e, AT("2026-10-14") + 3_600_000, again.fetcher, () => {});
    expect(same).toEqual({ added: [], days: 4, snapshot: false });
    expect(again.calls.sql).toHaveLength(0);
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
      await worker.scheduled({ cron: "0 1 * * *", scheduledTime: AT("2026-10-14") }, e);
    } finally {
      spy.mockRestore();
    }
    expect(snapshotOf(e)!.updatedAt).toBe("2026-10-14T00:00:00.000Z");
  });
});
