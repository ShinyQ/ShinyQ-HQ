import { describe, expect, it } from "vitest";
import {
  busiestDay,
  calendarDays,
  calendarTotal,
  calendarWeeks,
  levelCounts,
  longestStreak,
  type ContributionCalendar,
} from "@/lib/contributions";

// 2026-01-03 is a Saturday: the first column holds one day, as on GitHub's graph.
const cal: ContributionCalendar = { start: "2026-01-03", levels: "01200341", counts: [0, 2, 5, 0, 0, 12, 40, 1] };

describe("calendarDays", () => {
  it("lays the days out as GitHub's graph: one column per week, Sunday on row 0", () => {
    const days = calendarDays(cal);
    expect(days).toHaveLength(8);
    expect(days[0]).toEqual({ date: "2026-01-03", count: 0, level: 0, week: 0, weekday: 6 });
    expect(days[1]).toEqual({ date: "2026-01-04", count: 2, level: 1, week: 1, weekday: 0 });
    expect(days[7]).toEqual({ date: "2026-01-10", count: 1, level: 1, week: 1, weekday: 6 });
  });

  it("walks month ends and leap days in UTC", () => {
    const leap = calendarDays({ start: "2028-02-28", levels: "000", counts: [0, 0, 0] }).map((d) => d.date);
    expect(leap).toEqual(["2028-02-28", "2028-02-29", "2028-03-01"]);
    const year = calendarDays({ start: "2026-12-31", levels: "00", counts: [0, 0] }).map((d) => d.date);
    expect(year).toEqual(["2026-12-31", "2027-01-01"]);
  });
});

describe("calendar summaries", () => {
  it("counts the week columns", () => {
    expect(calendarWeeks(cal)).toBe(2);
    expect(calendarWeeks({ start: "2026-01-04", levels: "0000000", counts: [0, 0, 0, 0, 0, 0, 0] })).toBe(1);
    expect(calendarWeeks({ start: "2026-01-03", levels: "", counts: [] })).toBe(0);
  });

  it("sums the day counts", () => {
    expect(calendarTotal(cal)).toBe(60);
  });

  it("counts the days at each of GitHub's five levels", () => {
    expect(levelCounts(cal)).toEqual([3, 2, 1, 1, 1]);
  });

  it("finds the busiest day, the latest one on a tie", () => {
    expect(busiestDay(cal)).toMatchObject({ date: "2026-01-09", count: 40, level: 4 });
    expect(busiestDay({ start: "2026-01-03", levels: "33", counts: [7, 7] })?.date).toBe("2026-01-04");
    expect(busiestDay({ start: "2026-01-03", levels: "00", counts: [0, 0] })).toBeUndefined();
  });

  it("finds the longest run of days with a contribution, the latest one on a tie", () => {
    expect(longestStreak(cal)).toEqual({ days: 3, start: "2026-01-08", end: "2026-01-10" });
    expect(longestStreak({ start: "2026-01-03", levels: "1101", counts: [1, 1, 0, 1] })).toEqual({ days: 2, start: "2026-01-03", end: "2026-01-04" });
    expect(longestStreak({ start: "2026-01-03", levels: "1011", counts: [1, 0, 1, 1] })).toEqual({ days: 2, start: "2026-01-05", end: "2026-01-06" });
    expect(longestStreak({ start: "2026-01-03", levels: "101", counts: [1, 0, 1] })).toEqual({ days: 1, start: "2026-01-05", end: "2026-01-05" });
    expect(longestStreak({ start: "2026-01-03", levels: "00", counts: [0, 0] })).toBeUndefined();
  });
});
