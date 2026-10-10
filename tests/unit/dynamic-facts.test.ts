import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DynamicFactsSchema, type DynamicFacts } from "@/content/dynamic-facts";
import { buildExperienceData } from "@/content/experience";
import { DYNAMIC_STATS, getContent, getDynamicFacts, getStats, overlayStats } from "@/content/load";
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
