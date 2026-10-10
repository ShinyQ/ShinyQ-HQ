import { describe, expect, it } from "vitest";
import { matchesPod, navMatch, parsePodFilter, parseTypeFilter, podFilterQuery, stackOptions, typeCounts, wingCounts } from "@/content/pageview";

const pods = [
  { wing: "ai" as const, stack: ["FastAPI", "Azure OpenAI"] },
  { wing: "software" as const, stack: ["Node.js", "FastAPI"] },
  { wing: "ai" as const, stack: ["Next.js"] },
];

describe("pod filters", () => {
  it("parses and serializes the query", () => {
    expect(parsePodFilter("?wing=ai&stack=FastAPI")).toEqual({ wing: "ai", stack: "FastAPI" });
    expect(parsePodFilter("?wing=nope")).toEqual({ wing: "all", stack: null });
    expect(podFilterQuery({ wing: "all", stack: null })).toBe("");
    expect(podFilterQuery({ wing: "software", stack: "Next.js" })).toBe("?wing=software&stack=Next.js");
  });

  it("matches wing and stack together", () => {
    expect(pods.filter((p) => matchesPod(p, { wing: "ai", stack: "FastAPI" }))).toHaveLength(1);
    expect(pods.filter((p) => matchesPod(p, { wing: "all", stack: "FastAPI" }))).toHaveLength(2);
    expect(pods.filter((p) => matchesPod(p, { wing: "all", stack: null }))).toHaveLength(3);
  });

  it("lists stacks used by at least `min` pods, most used first, then by name", () => {
    expect(stackOptions(pods, 2)).toEqual([{ name: "FastAPI", count: 2 }]);
    expect(stackOptions(pods).map((s) => s.name)).toEqual(["FastAPI", "Azure OpenAI", "Next.js", "Node.js"]);
  });

  it("counts wings", () => {
    expect(wingCounts(pods)).toEqual({ all: 3, ai: 2, software: 1 });
  });
});

describe("timeline filters", () => {
  it("parses the type and counts entries", () => {
    expect(parseTypeFilter("?type=award")).toBe("award");
    expect(parseTypeFilter("?type=x")).toBe("all");
    expect(typeCounts([{ type: "job" }, { type: "job" }, { type: "award" }])).toEqual({ all: 3, job: 2, freelance: 0, education: 0, award: 1, milestone: 0 });
  });
});

describe("navMatch", () => {
  it("matches the section and its children only", () => {
    expect(navMatch("/labs", "/labs")).toBe(true);
    expect(navMatch("/labs/voice", "/labs")).toBe(true);
    expect(navMatch("/blog/x", "/library")).toBe(true);
    expect(navMatch("/labsx", "/labs")).toBe(false);
    expect(navMatch("/", "/labs")).toBe(false);
  });
});
