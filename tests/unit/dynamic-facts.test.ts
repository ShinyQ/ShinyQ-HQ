import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DynamicFactsSchema, type DynamicFacts } from "@/content/dynamic-facts";
import { buildExperienceData } from "@/content/experience";
import { DYNAMIC_STATS, getContent, getDynamicFacts, getStats, overlayStats } from "@/content/load";
import { calendarTotal, calendarWeeks, type ContributionCalendar } from "@/lib/contributions";
import { serializeFacts } from "../../scripts/refresh-facts";

const names = { L1: "Lobby", L2: "Career Archive", L3: "Labs", L4: "Library", RF: "Roof" };
const committed = readFileSync("content/generated/dynamic-facts.json", "utf8");

describe("dynamic facts", () => {
  it("the committed file parses and is in the writer's format", () => {
    expect(DynamicFactsSchema.safeParse(JSON.parse(committed)).success).toBe(true);
    expect(serializeFacts(getDynamicFacts())).toBe(committed);
  });

  it("holds numbers, dates, booleans and IDs only", () => {
    expect(DynamicFactsSchema.safeParse({ ...getDynamicFacts(), note: "free text" }).success).toBe(false);
    expect(DynamicFactsSchema.safeParse({ ...getDynamicFacts(), github: { login: "ShinyQ", contributionsLastYear: "7k", publicRepos: 1 } }).success).toBe(false);
  });

  it("maps only stats that exist in the content", () => {
    const ids = getContent().stats.map((s) => s.id);
    for (const id of Object.keys(DYNAMIC_STATS)) expect(ids).toContain(id);
  });

  it("carries a year of daily contributions that the calendar helpers read", () => {
    const github = getDynamicFacts().github!;
    const calendar: ContributionCalendar | undefined = github.calendar;
    expect(calendar).toBeDefined();
    expect([53, 54]).toContain(calendarWeeks(calendar!));
    expect(calendarTotal(calendar!)).toBe(github.contributionsLastYear);
  });
});

describe("contribution calendar", () => {
  // 366 days: a quiet start, then one contribution a day and a busy last day.
  const counts = Array.from({ length: 366 }, (_, i): number => (i < 100 ? 0 : i === 365 ? 40 : 1));
  const levels = counts.map((n) => (n === 0 ? "0" : n === 40 ? "4" : "1")).join("");
  const total = counts.reduce((s, n) => s + n, 0);
  const github = { login: "ShinyQ", contributionsLastYear: total, publicRepos: 171, calendar: { start: "2025-11-02", levels, counts } };
  const parse = (patch: object) => DynamicFactsSchema.safeParse({ asOf: "2026-11-02", github: { ...github, ...patch } }).success;

  it("accepts a year of levels and counts that add up to the total", () => {
    expect(parse({})).toBe(true);
    expect(parse({ calendar: undefined })).toBe(true);
  });

  it("rejects levels outside GitHub's five, or text", () => {
    expect(parse({ calendar: { ...github.calendar, levels: `${levels.slice(0, -1)}5` } })).toBe(false);
    expect(parse({ calendar: { ...github.calendar, levels: `${levels.slice(0, -1)}x` } })).toBe(false);
    expect(parse({ calendar: { ...github.calendar, note: "free text" } })).toBe(false);
  });

  it("rejects mismatched lengths, a short year and a level that disagrees with its count", () => {
    expect(parse({ calendar: { ...github.calendar, counts: counts.slice(1) } })).toBe(false);
    expect(parse({ contributionsLastYear: total - 40, calendar: { start: "2025-11-02", levels: levels.slice(0, 300), counts: counts.slice(0, 300) } })).toBe(false);
    expect(parse({ calendar: { ...github.calendar, levels: `1${levels.slice(1)}` } })).toBe(false);
    expect(parse({ calendar: { ...github.calendar, levels: `${levels.slice(0, -1)}0` } })).toBe(false);
  });

  it("rejects a calendar whose counts do not add up to the total", () => {
    expect(parse({ contributionsLastYear: total + 1 })).toBe(false);
  });

  it("rejects a start that is not a real date", () => {
    expect(parse({ calendar: { ...github.calendar, start: "2025-02-30" } })).toBe(false);
  });
});

describe("stats overlay", () => {
  it("formats live values with en-US grouping and leaves other stats alone", () => {
    const facts: DynamicFacts = { asOf: "2026-10-12", github: { login: "ShinyQ", contributionsLastYear: 12345, publicRepos: 1 } };
    const stats = overlayStats(getContent().stats, facts);
    expect(stats.find((s) => s.id === "github-contributions-365")?.value).toBe("12,345");
    stats
      .filter((s) => s.id !== "github-contributions-365")
      .forEach((s) => expect(s).toEqual(getContent().stats.find((c) => c.id === s.id)));
  });

  it("keeps the written value when the fact is missing", () => {
    expect(overlayStats(getContent().stats, { asOf: "2026-10-12" })).toEqual(getContent().stats);
  });

  it("feeds the stats ring and the page from the same numbers", () => {
    const live = getDynamicFacts().github!.contributionsLastYear.toLocaleString("en-US");
    expect(getStats().find((s) => s.id === "github-contributions-365")?.value).toBe(live);
    expect(buildExperienceData("en", names).stats.find((s) => s.id === "github-contributions-365")?.value).toBe(live);
  });
});
