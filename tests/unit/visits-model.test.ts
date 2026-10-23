import { describe, expect, it } from "vitest";
import { parseStatsSnapshot, STATS_FIXTURE, STATS_FIXTURE_EMPTY } from "@/lib/visits/contract";
import { STATS_FIXTURE_PERF } from "@/lib/stats/fixtures";
import { DELAYED_AFTER_MS, formatCount, formatCountLong, freshness, largestRemainder, lastUpdatedDay, perfView, TOP_CHIPS, visitsView } from "@/lib/visits/model";

const HOUR = 3_600_000;
const at = (iso: string, hours: number) => Date.parse(iso) + hours * HOUR;

describe("parseStatsSnapshot (S1 contract, as the display uses it)", () => {
  it("accepts the fixtures", () => {
    expect(parseStatsSnapshot(STATS_FIXTURE)).toEqual(STATS_FIXTURE);
    expect(parseStatsSnapshot(STATS_FIXTURE_EMPTY)).toEqual(STATS_FIXTURE_EMPTY);
  });

  it("rejects other versions, missing keys, unknown countries and topics", () => {
    expect(parseStatsSnapshot({ ...STATS_FIXTURE, v: 2 })).toBeNull();
    expect(parseStatsSnapshot({ ...STATS_FIXTURE, visits: { d30: 1 } })).toBeNull();
    expect(parseStatsSnapshot({ ...STATS_FIXTURE, countries: { d30: ["XX"], all: [] } })).toBeNull();
    expect(parseStatsSnapshot({ ...STATS_FIXTURE, visits: { d30: -1, all: 2 } })).toBeNull();
    const asks = { ...STATS_FIXTURE.asks, d30: { ...STATS_FIXTURE.asks.d30, chips: [{ id: "x", topic: "money", n: 1 }] } };
    expect(parseStatsSnapshot({ ...STATS_FIXTURE, asks })).toBeNull();
    expect(parseStatsSnapshot(null)).toBeNull();
    expect(parseStatsSnapshot("{}")).toBeNull();
  });
});

describe("freshness", () => {
  const u = STATS_FIXTURE.updatedAt;
  it("is fresh within 6 hours of the last update (3 missed 2-hour runs)", () => {
    expect(DELAYED_AFTER_MS).toBe(6 * HOUR);
    expect(freshness(STATS_FIXTURE, at(u, 1))).toBe("fresh");
    expect(freshness(STATS_FIXTURE, at(u, 5))).toBe("fresh");
    expect(freshness(STATS_FIXTURE, at(u, 6))).toBe("fresh");
  });
  it("is delayed after 6 hours and hidden after 7 days", () => {
    expect(freshness(STATS_FIXTURE, at(u, 6.1))).toBe("delayed");
    expect(freshness(STATS_FIXTURE, at(u, 13))).toBe("delayed");
    expect(freshness(STATS_FIXTURE, at(u, 24 * 7 - 1))).toBe("delayed");
    expect(freshness(STATS_FIXTURE, at(u, 24 * 7 + 1))).toBe("hidden");
  });
  it("hides a missing snapshot and tolerates a clock a little behind", () => {
    expect(freshness(null, Date.now())).toBe("hidden");
    expect(freshness(STATS_FIXTURE, at(u, -3))).toBe("fresh");
  });
  it("names the UTC day of the last data (a midnight run reports the previous day)", () => {
    expect(lastUpdatedDay(STATS_FIXTURE)).toBe("2026-11-14");
  });
});

describe("formatCount", () => {
  it("keeps exact grouped numbers below 10,000", () => {
    expect(formatCount(950, "en")).toBe("950");
    expect(formatCount(1234, "en")).toBe("1,234");
    expect(formatCount(1234, "id")).toBe("1.234");
  });
  it("uses CLDR compact numbers from 10,000", () => {
    expect(formatCount(12_345, "en")).toBe("12.3K");
    expect(formatCount(12_345, "id")).toBe("12,3\u00a0rb");
    expect(formatCount(1_234_567, "en")).toBe("1.2M");
    expect(formatCount(1_234_567, "id")).toBe("1,2\u00a0jt");
  });
  it("spells compact numbers out for screen readers", () => {
    expect(formatCountLong(12_345, "en")).toBe("12.3 thousand");
    expect(formatCountLong(950, "id")).toBe("950");
  });
});

describe("largestRemainder", () => {
  it("returns whole percents that add up to 100", () => {
    expect(largestRemainder([1, 1, 1])).toEqual([34, 33, 33]);
    expect(largestRemainder([610, 420]).reduce((a, b) => a + b)).toBe(100);
    expect(largestRemainder([120, 86, 52, 21, 14]).reduce((a, b) => a + b)).toBe(100);
  });
  it("keeps all zeros at zero", () => {
    expect(largestRemainder([0, 0])).toEqual([0, 0]);
    expect(largestRemainder([])).toEqual([]);
  });
});

describe("visitsView", () => {
  it("answers the period from the snapshot", () => {
    const v = visitsView(STATS_FIXTURE, "d30", "all");
    expect(v.visits).toBe(340);
    expect(v.countries).toHaveLength(9);
    expect(v.topFloor).toBe("L3");
    expect(v.mode.threeDShare + v.mode.classicShare).toBe(100);
    expect(visitsView(STATS_FIXTURE, "all", "all").visits).toBe(520);
  });

  it("lists every topic share under All, chips sorted by count", () => {
    const v = visitsView(STATS_FIXTURE, "d30", "all");
    expect(v.asks.total).toBe(64);
    expect(v.asks.topics.map((t) => t.topic)).toEqual(["work", "ai", "career", "contact", "perspectives"]);
    expect(v.asks.topics.reduce((a, t) => a + t.share, 0)).toBe(100);
    expect(v.asks.chips.map((c) => c.id)).toEqual(["work-best", "ai-agents", "career-now", "contact-reach"]);
  });

  it("lists only the top 5 suggested questions, most picked first, ties by id (owner decision 2026-10-23)", () => {
    expect(TOP_CHIPS).toBe(5);
    const chips = [
      { id: "g", topic: "work" as const, n: 1 },
      { id: "c", topic: "ai" as const, n: 7 },
      { id: "b", topic: "work" as const, n: 7 },
      { id: "a", topic: "career" as const, n: 3 },
      { id: "f", topic: "work" as const, n: 9 },
      { id: "e", topic: "work" as const, n: 2 },
      { id: "d", topic: "work" as const, n: 3 },
    ];
    const s = { ...STATS_FIXTURE, asks: { ...STATS_FIXTURE.asks, d30: { ...STATS_FIXTURE.asks.d30, chips } } };
    expect(visitsView(s, "d30", "all").asks.chips.map((c) => c.id)).toEqual(["f", "b", "c", "a", "d"]);
    expect(visitsView(s, "d30", "work").asks.chips.map((c) => c.id)).toEqual(["f", "b", "d", "e", "g"]);
    expect(visitsView(s, "d30", "ai").asks.chips.map((c) => c.id)).toEqual(["c"]);
  });

  it("narrows questions to one topic; visits ignore the topic", () => {
    const v = visitsView(STATS_FIXTURE, "d30", "work");
    expect(v.asks.total).toBe(21);
    expect(v.asks.chips.map((c) => c.id)).toEqual(["work-best"]);
    // The share stays the topic's share of all topical questions, so it reads the same under All and Work.
    const all = visitsView(STATS_FIXTURE, "d30", "all").asks.topics[0];
    expect(v.asks.topics).toEqual([{ topic: "work", n: 21, share: all.share }]);
    expect(all.share).toBe(37);
    expect(v.visits).toBe(340);
  });

  it("handles an empty snapshot without dividing by zero", () => {
    const v = visitsView(STATS_FIXTURE_EMPTY, "d30", "ai");
    expect(v.asks.total).toBe(0);
    expect(v.asks.topics).toEqual([{ topic: "ai", n: 0, share: 0 }]);
    expect(v.mode).toEqual({ threeD: 0, classic: 0, threeDShare: 0, classicShare: 0 });
  });
});

describe("perfView", () => {
  it("is null without a perf block", () => {
    expect(perfView(STATS_FIXTURE, "d30")).toBeNull();
    expect(perfView(STATS_FIXTURE_EMPTY, "all")).toBeNull();
  });

  it("reports sessions, the share at 55+ FPS among measured sessions and the median explore bucket", () => {
    const p = STATS_FIXTURE_PERF.perf!;
    expect(perfView(STATS_FIXTURE_PERF, "d30")).toEqual({ sessions: p.d30.sessions, fpsShare: p.d30.fps55 / p.d30.measured, explore: p.d30.explore });
    expect(perfView(STATS_FIXTURE_PERF, "all")).toEqual({ sessions: p.all.sessions, fpsShare: p.all.fps55 / p.all.measured, explore: p.all.explore });
  });

  it("is null for a period without sessions and has no share without measured sessions", () => {
    const s = { ...STATS_FIXTURE_PERF, perf: { d30: { sessions: 0, measured: 0, fps55: 0, explore: null }, all: { sessions: 4, measured: 0, fps55: 0, explore: "lt3s" as const } } };
    expect(perfView(s, "d30")).toBeNull();
    expect(perfView(s, "all")).toEqual({ sessions: 4, fpsShare: null, explore: "lt3s" });
  });
});
