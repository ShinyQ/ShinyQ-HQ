import { describe, expect, it } from "vitest";
import { adjacent, groupEntriesByYear, sortPods, sortTimeline } from "@/content/selectors";
import { makeEntry, makePod } from "../fixtures/minimal-content";

describe("sortPods", () => {
  it("orders hero before featured before listed, then by order", () => {
    const pods = [
      makePod({ id: "l", tier: "listed", order: 0 }),
      makePod({ id: "f2", tier: "featured", order: 5 }),
      makePod({ id: "h", tier: "hero", order: 9 }),
      makePod({ id: "f1", tier: "featured", order: 1 }),
    ];
    expect(sortPods(pods).map((p) => p.id)).toEqual(["h", "f1", "f2", "l"]);
  });
});

describe("timeline selectors", () => {
  const entries = [
    makeEntry({ id: "c", start: "2026-02", end: "present" }),
    makeEntry({ id: "a", start: "2016-07", end: "2019-06" }),
    makeEntry({ id: "b", start: "2019-08", end: "2023-06" }),
  ];

  it("sorts oldest first", () => {
    expect(sortTimeline(entries).map((e) => e.id)).toEqual(["a", "b", "c"]);
  });

  it("folds pre-2019 entries into the 2019 year room", () => {
    expect(groupEntriesByYear(entries).map((g) => [g.year, g.entries.map((e) => e.id)])).toEqual([
      [2019, ["a", "b"]],
      [2026, ["c"]],
    ]);
  });
});

describe("adjacent", () => {
  it("returns neighbours", () => {
    expect(adjacent([1, 2, 3], 0)).toEqual({ prev: undefined, next: 2 });
    expect(adjacent([1, 2, 3], 2)).toEqual({ prev: 2, next: undefined });
  });
});
