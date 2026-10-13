import { describe, expect, it } from "vitest";
import { parseStatsSnapshot, type StatsTopic } from "@/lib/stats/protocol";
import { addDays, buildRollups, buildSnapshot, dayRange, MODE_FREEZE, trimLeadingEmpty } from "../../workers/stats/src/rollup";
import type { AeRows, DayRollup, WaRows } from "../../workers/stats/src/types";

const CHIPS = new Map<string, StatsTopic>([
  ["work-best", "work"],
  ["ai-voice", "ai"],
]);
const noWa: WaRows = { days: [], countries: [], paths: [] };

function day(date: string, patch: Partial<DayRollup> = {}): DayRollup {
  return { date, visits: 0, pageViews: 0, countries: [], floors: {}, mode: { threeD: 0, classic: 0 }, asks: { total: 0, topics: {}, chips: {} }, ...patch };
}

describe("dates", () => {
  it("lists every UTC day of a range, both ends included", () => {
    expect(dayRange("2026-10-30", "2026-11-02")).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
    expect(dayRange("2026-11-02", "2026-11-01")).toEqual([]);
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("buildRollups", () => {
  const wa: WaRows = {
    days: [
      { date: "2026-10-11", count: 90, visits: 10 },
      { date: "2026-10-12", count: 20, visits: 0 },
    ],
    countries: [
      { date: "2026-10-11", country: "ID", count: 80, visits: 10 },
      { date: "2026-10-11", country: "SG", count: 10, visits: 0 },
      { date: "2026-10-11", country: "XX", count: 10, visits: 0 },
      { date: "2026-10-11", country: "T1", count: 10, visits: 0 },
      { date: "2026-10-12", country: "US", count: 0, visits: 0 },
      { date: "2026-10-12", country: "DE", count: 20, visits: 0 },
    ],
    paths: [
      { date: "2026-10-11", path: "/en", count: 30 },
      { date: "2026-10-11", path: "/en/labs/voice-ai-contact-center", count: 30 },
      { date: "2026-10-11", path: "/en/labs", count: 10 },
      { date: "2026-10-11", path: "/en/quick", count: 20 },
      { date: "2026-10-12", path: "/id/journey/metrodata-2026", count: 20 },
    ],
  };
  const ae: AeRows = {
    asks: [
      { day: "2026-10-11", topic: "work", chip: "work-best", n: 3 },
      { day: "2026-10-11", topic: "ai", chip: "", n: 2 },
      { day: "2026-10-11", topic: "", chip: "", n: 4 },
      { day: "2026-10-11", topic: "<b>", chip: "made-up", n: 1 },
      { day: "2026-10-12", topic: "ai", chip: "ai-voice", n: 1 },
    ],
    visits: [
      { day: "2026-10-11", mode: "3d", n: 5 },
      { day: "2026-10-11", mode: "classic", n: 2 },
      { day: "2026-10-11", mode: "both", n: 1 },
      { day: "2026-10-11", mode: "vr", n: 9 },
    ],
  };

  it("folds the sources into one rollup per day", () => {
    const [d11, d12] = buildRollups(["2026-10-11", "2026-10-12"], wa, ae, CHIPS);
    expect(d11).toEqual({
      date: "2026-10-11",
      visits: 10,
      pageViews: 90,
      countries: ["ID", "SG"],
      floors: { L1: 30, L3: 40 },
      mode: { threeD: 6, classic: 3 },
      asks: { total: 10, topics: { work: 3, ai: 2 }, chips: { "work-best": 3 } },
    });
    expect(d12).toEqual({
      date: "2026-10-12",
      visits: 0,
      pageViews: 20,
      countries: ["DE"],
      floors: { L2: 20 },
      mode: { threeD: 0, classic: 0 },
      asks: { total: 1, topics: { ai: 1 }, chips: { "ai-voice": 1 } },
    });
  });

  it("creates empty days for dates without rows", () => {
    expect(buildRollups(["2026-10-13"], wa, ae, CHIPS)).toEqual([day("2026-10-13")]);
  });

  it("rounds counts and drops negative or broken numbers", () => {
    const [d] = buildRollups(["2026-10-11"], { days: [{ date: "2026-10-11", count: 12.6, visits: -4 }], countries: [], paths: [] }, { asks: [{ day: "2026-10-11", topic: "work", chip: "", n: Number.NaN }], visits: [] }, CHIPS);
    expect(d.pageViews).toBe(13);
    expect(d.visits).toBe(0);
    expect(d.asks.total).toBe(0);
  });

  it("freezes the 3D vs Classic split of a day whose beacon points outrun Web Analytics", () => {
    const pageViews = 20;
    const limit = Math.max(MODE_FREEZE.floor, MODE_FREEZE.factor * pageViews);
    const spam: AeRows = { asks: [], visits: [{ day: "2026-10-11", mode: "3d", n: limit + 1 }] };
    const [frozen] = buildRollups(["2026-10-11"], { ...noWa, days: [{ date: "2026-10-11", count: pageViews, visits: 10 }] }, spam, CHIPS);
    expect(frozen.mode).toEqual({ threeD: 0, classic: 0, frozen: true });
    const fine: AeRows = { asks: [], visits: [{ day: "2026-10-11", mode: "3d", n: limit }] };
    expect(buildRollups(["2026-10-11"], { ...noWa, days: [{ date: "2026-10-11", count: pageViews, visits: 10 }] }, fine, CHIPS)[0].mode).toEqual({ threeD: limit, classic: 0 });
  });

  it("trims empty days before the first day with data", () => {
    const days = [day("2026-10-09"), day("2026-10-10", { asks: { total: 1, topics: {}, chips: {} } }), day("2026-10-11")];
    expect(trimLeadingEmpty(days).map((d) => d.date)).toEqual(["2026-10-10", "2026-10-11"]);
    expect(trimLeadingEmpty([day("2026-10-09")])).toEqual([]);
  });
});

describe("buildSnapshot", () => {
  it("returns null for an empty ledger", () => {
    expect(buildSnapshot([], "2026-10-13", CHIPS)).toBeNull();
  });

  it("sums the last 30 complete days and every day since launch", () => {
    const days = [
      day("2026-09-01", { visits: 100, pageViews: 300, countries: ["GB", "ID"], floors: { L2: 300 }, mode: { threeD: 1, classic: 9 }, asks: { total: 5, topics: { career: 5 }, chips: { "work-best": 1 } } }),
      day("2026-10-01", { visits: 20, pageViews: 50, countries: ["SG", "ID"], floors: { L3: 30, L1: 20 }, mode: { threeD: 4, classic: 1 }, asks: { total: 3, topics: { ai: 2 }, chips: { "ai-voice": 2 } } }),
      day("2026-10-13", { visits: 10, pageViews: 40, countries: ["DE"], floors: { L3: 10, L4: 30 }, mode: { threeD: 2, classic: 2, frozen: true }, asks: { total: 1, topics: { work: 1 }, chips: { "work-best": 1 } } }),
    ];
    const snap = buildSnapshot(days, "2026-10-13", CHIPS)!;
    expect(parseStatsSnapshot(snap)).toEqual(snap);
    expect(snap.updatedAt).toBe("2026-10-14T00:00:00.000Z");
    expect(snap.since).toBe("2026-09-01");
    expect(snap.visits).toEqual({ d30: 30, all: 130 });
    expect(snap.pageViews).toEqual({ d30: 90, all: 390 });
    expect(snap.countries).toEqual({ d30: ["DE", "ID", "SG"], all: ["DE", "GB", "ID", "SG"] });
    expect(snap.topFloor).toEqual({ d30: "L3", all: "L2" });
    expect(snap.mode).toEqual({ d30: { threeD: 6, classic: 3 }, all: { threeD: 7, classic: 12 } });
    expect(snap.asks.d30).toEqual({
      total: 4,
      topics: { work: 1, ai: 2, career: 0, contact: 0, perspectives: 0 },
      chips: [
        { id: "ai-voice", topic: "ai", n: 2 },
        { id: "work-best", topic: "work", n: 1 },
      ],
    });
    expect(snap.asks.all.chips).toEqual([
      { id: "work-best", topic: "work", n: 2 },
      { id: "ai-voice", topic: "ai", n: 2 },
    ].sort((a, b) => b.n - a.n || a.id.localeCompare(b.id)));
  });

  it("starts the 30-day window 29 days before the last day", () => {
    const days = [day("2026-09-13", { visits: 10 }), day("2026-09-14", { visits: 20 }), day("2026-10-13", { visits: 30 })];
    expect(buildSnapshot(days, "2026-10-13", CHIPS)!.visits).toEqual({ d30: 50, all: 60 });
  });

  it("breaks top floor ties in floor order and has none without page views", () => {
    expect(buildSnapshot([day("2026-10-13", { floors: { RF: 10, L2: 10 } })], "2026-10-13", CHIPS)!.topFloor.d30).toBe("L2");
    expect(buildSnapshot([day("2026-10-13")], "2026-10-13", CHIPS)!.topFloor).toEqual({ d30: null, all: null });
  });

  it("drops chips that left the curated bank", () => {
    const snap = buildSnapshot([day("2026-10-13", { asks: { total: 2, topics: {}, chips: { "gone-chip": 2 } } })], "2026-10-13", CHIPS)!;
    expect(snap.asks.all.chips).toEqual([]);
    expect(snap.asks.all.total).toBe(2);
  });
});
