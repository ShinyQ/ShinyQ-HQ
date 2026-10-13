import { describe, expect, it } from "vitest";
import { ASK_TOPICS, suggestionById } from "@/ask/suggestions";
import { STATS_FIXTURE, STATS_FIXTURE_EMPTY } from "@/lib/stats/fixtures";
import { isCountryCode, parseStatsSnapshot, STATS_TOPICS, type StatsSnapshotV1 } from "@/lib/stats/protocol";

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

  it("uses real curated chip ids with their own topics in the fixture", () => {
    for (const chip of [...STATS_FIXTURE.asks.d30.chips, ...STATS_FIXTURE.asks.all.chips]) expect(suggestionById(chip.id)?.topic).toBe(chip.topic);
  });

  it("uses the Ask topic pills as its topics", () => {
    expect([...STATS_TOPICS]).toEqual([...ASK_TOPICS]);
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
    ["an extra chip key", (s) => ((s.asks.all.chips[0] as Record<string, unknown>).text = "hello")],
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
