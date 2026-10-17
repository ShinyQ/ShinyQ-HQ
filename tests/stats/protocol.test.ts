import { describe, expect, it } from "vitest";
import { ASK_TOPICS, STATS_TOPIC_OF, suggestionById } from "@/ask/suggestions";
import { RUM_TIMES } from "@/lib/rum/protocol";
import { STATS_FIXTURE, STATS_FIXTURE_EMPTY, STATS_FIXTURE_PERF } from "@/lib/stats/fixtures";
import { isCountryCode, parseStatsSnapshot, STATS_EXPLORE, STATS_TOPICS, type StatsSnapshotV1 } from "@/lib/stats/protocol";

const clone = (): StatsSnapshotV1 => JSON.parse(JSON.stringify(STATS_FIXTURE));

describe("stats snapshot protocol", () => {
  it("accepts both fixtures and returns a fresh object", () => {
    const parsed = parseStatsSnapshot(STATS_FIXTURE);
    expect(parsed).toEqual(STATS_FIXTURE);
    expect(parsed).not.toBe(STATS_FIXTURE);
    expect(parseStatsSnapshot(STATS_FIXTURE_EMPTY)).toEqual(STATS_FIXTURE_EMPTY);
  });

  it("survives a JSON round trip", () => {
    expect(parseStatsSnapshot(JSON.parse(JSON.stringify(STATS_FIXTURE)))).toEqual(STATS_FIXTURE);
  });

  it("uses real curated chip ids with their stats topics in the fixture", () => {
    for (const chip of [...STATS_FIXTURE.asks.d30.chips, ...STATS_FIXTURE.asks.all.chips]) {
      const suggestion = suggestionById(chip.id);
      expect(suggestion, chip.id).toBeDefined();
      expect(STATS_TOPIC_OF[suggestion!.topic]).toBe(chip.topic);
    }
  });

  it("uses Ask topic pills as its topics and maps every pill topic onto one", () => {
    for (const topic of STATS_TOPICS) expect(ASK_TOPICS).toContain(topic);
    for (const topic of ASK_TOPICS) expect(STATS_TOPICS).toContain(STATS_TOPIC_OF[topic]);
  });

  it("accepts ISO alpha-2 country codes only", () => {
    expect(isCountryCode("ID")).toBe(true);
    expect(isCountryCode("XX")).toBe(false);
    expect(isCountryCode("T1")).toBe(false);
    expect(isCountryCode("id")).toBe(false);
    expect(isCountryCode("IDN")).toBe(false);
    expect(isCountryCode(7)).toBe(false);
  });

  const broken: [string, (s: Record<string, unknown> & StatsSnapshotV1) => void][] = [
    ["a wrong version", (s) => ((s as { v: number }).v = 2)],
    ["an extra top-level key", (s) => (s.extra = 1)],
    ["a missing key", (s) => delete (s as Partial<StatsSnapshotV1>).mode],
    ["sampled false", (s) => ((s as { sampled: boolean }).sampled = false)],
    ["a negative count", (s) => (s.visits.d30 = -10)],
    ["a fractional count", (s) => (s.pageViews.all = 1.5)],
    ["a string count", (s) => ((s.visits as Record<string, unknown>).all = "10")],
    ["an extra period", (s) => ((s.visits as Record<string, number>).d7 = 1)],
    ["XX in countries", (s) => s.countries.d30.push("XX")],
    ["T1 in countries", (s) => s.countries.all.push("T1")],
    ["a lowercase country", (s) => s.countries.all.push("sg")],
    ["a duplicate country", (s) => s.countries.all.push(s.countries.all[0])],
    ["an unknown floor", (s) => ((s.topFloor as Record<string, unknown>).d30 = "L9")],
    ["an unknown topic key", (s) => ((s.asks.d30.topics as Record<string, number>).food = 1)],
    ["a chip with an unknown topic", (s) => ((s.asks.all.chips[0] as { topic: string }).topic = "food")],
    ["a chip with markup in its id", (s) => (s.asks.all.chips[0].id = "<b>x</b>")],
    ["an extra chip key", (s) => ((s.asks.all.chips[0] as unknown as Record<string, unknown>).text = "hello")],
    ["a non-ISO updatedAt", (s) => (s.updatedAt = "yesterday")],
    ["a non-date since", (s) => (s.since = "2026-10-11T00:00:00Z")],
    ["an extra mode key", (s) => ((s.mode.d30 as Record<string, number>).vr = 1)],
  ];

  it.each(broken)("rejects %s", (_, mutate) => {
    const s = clone() as Record<string, unknown> & StatsSnapshotV1;
    mutate(s);
    expect(parseStatsSnapshot(s)).toBeNull();
  });

  it("rejects non-objects", () => {
    for (const value of [null, undefined, 1, "x", [], [STATS_FIXTURE]]) expect(parseStatsSnapshot(value)).toBeNull();
  });
});

describe("stats snapshot perf block", () => {
  const withPerf = (): StatsSnapshotV1 => JSON.parse(JSON.stringify(STATS_FIXTURE_PERF));
  const withoutPerf = withPerf();
  delete withoutPerf.perf;

  it("uses the RUM explore buckets without na", () => {
    expect([...STATS_EXPLORE]).toEqual(RUM_TIMES.filter((t) => t !== "na"));
  });

  it("parses a snapshot without perf exactly as before", () => {
    const parsed = parseStatsSnapshot(STATS_FIXTURE);
    expect(parsed).toEqual(STATS_FIXTURE);
    expect(parsed && "perf" in parsed).toBe(false);
  });

  it("keeps a valid perf block and copies it", () => {
    const parsed = parseStatsSnapshot(withPerf());
    expect(parsed).toEqual(STATS_FIXTURE_PERF);
    expect(parsed?.perf).not.toBe(STATS_FIXTURE_PERF.perf);
    expect(parsed?.perf?.d30).not.toBe(STATS_FIXTURE_PERF.perf?.d30);
    expect(STATS_FIXTURE_PERF.perf?.d30.fps55).toBeLessThanOrEqual(STATS_FIXTURE_PERF.perf?.d30.measured ?? 0);
  });

  it("accepts a null explore bucket and zero sessions", () => {
    const s = withPerf();
    s.perf!.d30 = { sessions: 0, measured: 0, fps55: 0, explore: null };
    expect(parseStatsSnapshot(s)?.perf?.d30).toEqual({ sessions: 0, measured: 0, fps55: 0, explore: null });
  });

  const brokenPerf: [string, (p: Record<string, unknown>) => void][] = [
    ["fps55 above measured", (p) => ((p.d30 as Record<string, number>).fps55 = 81)],
    ["measured above sessions", (p) => ((p.all as Record<string, number>).measured = 1000)],
    ["a negative count", (p) => ((p.d30 as Record<string, number>).sessions = -1)],
    ["a fractional count", (p) => ((p.d30 as Record<string, number>).fps55 = 1.5)],
    ["an unknown explore bucket", (p) => ((p.d30 as Record<string, unknown>).explore = "na")],
    ["an extra perf key", (p) => ((p.d30 as Record<string, unknown>).fps10 = 1)],
    ["a missing perf key", (p) => delete (p.all as Record<string, unknown>).explore],
    ["an extra period", (p) => (p.d7 = p.d30)],
    ["a missing period", (p) => delete p.all],
  ];

  it.each(brokenPerf)("drops a perf block with %s and keeps the rest", (_, mutate) => {
    const s = withPerf();
    mutate(s.perf as unknown as Record<string, unknown>);
    const parsed = parseStatsSnapshot(s);
    expect(parsed).toEqual(withoutPerf);
    expect(parsed && "perf" in parsed).toBe(false);
  });

  it("drops a perf block that is not an object", () => {
    for (const perf of [null, 1, "x", []]) expect(parseStatsSnapshot({ ...withPerf(), perf })).toEqual(withoutPerf);
  });

  it("still rejects other extra keys next to perf", () => {
    expect(parseStatsSnapshot({ ...withPerf(), extra: 1 })).toBeNull();
  });
});
