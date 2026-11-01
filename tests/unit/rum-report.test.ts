import { describe, expect, it } from "vitest";
import { foldModes, foldPerf, formatReport, MAX_DAYS, modeSql, parseVitals, perfSql, readSql, startDay, VITALS_QUERY } from "../../scripts/rum-report";

const row = (over: Record<string, unknown> = {}) => ({ tier: "lite", path: "cover", fps50: "55+", fps10: "30-44", explore: "8-12s", lost: 0, timeout: 0, n: 1, ...over });

describe("startDay", () => {
  const now = Date.UTC(2026, 10, 1, 12);
  it("returns the UTC day `days` back", () => {
    expect(startDay(now, 30)).toBe("2026-10-02");
    expect(startDay(now, 1)).toBe("2026-10-31");
  });
  it.each([0, MAX_DAYS + 1, 1.5, Number.NaN])("rejects --days %s", (days) => {
    expect(() => startDay(now, days)).toThrow(/--days/);
  });
});

describe("queries", () => {
  it("are read-only and take only a validated day", () => {
    for (const sql of [perfSql("2026-10-02"), modeSql("2026-10-02")]) {
      expect(sql.startsWith("SELECT ")).toBe(true);
      expect(sql).not.toMatch(/\b(INSERT|ALTER|DROP|DELETE|CREATE)\b/i);
      expect(sql).toContain("toDateTime('2026-10-02 00:00:00')");
    }
    expect(() => perfSql("2026-10-02'; DROP")).toThrow(/YYYY-MM-DD/);
    expect(VITALS_QUERY.startsWith("query ")).toBe(true);
    expect(VITALS_QUERY).not.toMatch(/mutation/);
  });

  it("never sends anything but a SELECT", async () => {
    let calls = 0;
    const fetcher = (async () => {
      calls += 1;
      return new Response('{"mode":"3d","n":2}\n');
    }) as unknown as typeof fetch;
    await expect(readSql("t", "a", "DROP TABLE perf_events", fetcher)).rejects.toThrow(/read-only/);
    expect(calls).toBe(0);
    await expect(readSql("t", "a", "SELECT 1", fetcher)).resolves.toEqual([{ mode: "3d", n: 2 }]);
    expect(calls).toBe(1);
  });
});

describe("foldPerf", () => {
  it("weights by n and keeps every tier's buckets summing to its total", () => {
    const s = foldPerf([row({ n: 3 }), row({ tier: "full", fps50: "na", explore: "na", n: "2" }), row({ n: 1, lost: 1, timeout: 1 })]);
    expect(s.total).toBe(6);
    expect(s.tier).toEqual({ lite: 4, full: 2 });
    for (const t of ["lite", "full"]) {
      for (const by of [s.path, s.fps50, s.fps10, s.explore]) expect(Object.values(by[t]).reduce((a, b) => a + b, 0)).toBe(s.tier[t]);
    }
    expect(s.lost.lite).toBe(1);
    expect(s.timeout.lite).toBe(1);
    expect(s.explore.full.na).toBe(2);
  });

  it("drops points outside the RUM contract into `dropped`", () => {
    const s = foldPerf([row({ tier: "static" }), row({ fps50: "60+" }), row({ path: "/en/labs" }), row({ n: 0 }), row({ n: "x" }), row()]);
    expect(s.total).toBe(1);
    expect(s.dropped).toBe(3);
  });
});

describe("foldModes", () => {
  it("keeps the three visit modes only", () => {
    expect(foldModes([{ mode: "3d", n: 2 }, { mode: "classic", n: "5" }, { mode: "both", n: 1 }, { mode: "/en", n: 9 }])).toEqual({ "3d": 2, classic: 5, both: 1 });
  });
});

describe("parseVitals", () => {
  const body = (vitals: unknown[]) => ({ data: { viewer: { accounts: [{ vitals }] } } });
  it("keeps known device types and marks sampled groups", () => {
    const rows = parseVitals(body([
      { count: 9, avg: { sampleInterval: 1 }, dimensions: { deviceType: "mobile" }, quantiles: { largestContentfulPaintP75: 912_000, cumulativeLayoutShiftP75: 0.02 } },
      { count: 4, avg: { sampleInterval: 10 }, dimensions: { deviceType: "desktop" }, quantiles: {} },
      { count: 3, dimensions: { deviceType: "smart-tv" }, quantiles: {} },
    ]));
    expect(rows.map((r) => [r.device, r.n, r.sampled])).toEqual([["mobile", 9, false], ["desktop", 4, true]]);
    expect(rows[0].lcp75).toBe(912_000);
  });
  it("throws on an unexpected response", () => {
    expect(() => parseVitals({ errors: [{ message: "denied" }] })).toThrow(/unexpected/);
  });
});

describe("formatReport", () => {
  const meta = { start: "2026-10-02", days: 30 };
  it("says so when there is no data", () => {
    expect(formatReport(foldPerf([]), {}, [], meta)).toBe("No RUM points or Web Vitals since 2026-10-02.");
  });
  it("prints contract-ordered bucket columns with counts and shares", () => {
    const out = formatReport(foldPerf([row({ n: 3 }), row({ fps50: "lt15" })]), { "3d": 2, classic: 5, both: 1 }, [], meta);
    expect(out).toContain("| tier | n | na | lt15 | 15-24 | 25-29 | 30-44 | 45-54 | 55+ |");
    expect(out).toContain("| lite | 4 | 0 | 1 (25%) | 0 | 0 | 0 | 0 | 3 (75%) |");
    expect(out).toContain("3D vs Classic page lifetimes: 3D 3, Classic 6");
  });
  it("prints vitals in milliseconds and n/a for missing values", () => {
    const out = formatReport(foldPerf([]), {}, [{ device: "mobile", n: 9, sampled: false, lcp50: 700_000, lcp75: 912_000, lcp90: 0, fcp75: 600_000, ttfb75: 425_000, inp75: 4_294_967_295, cls75: 0.011 }], meta);
    expect(out).toContain("| mobile | 9 | 700 ms | 912 ms | n/a | 600 ms | 425 ms | n/a | 0.011 | no |");
  });
});
