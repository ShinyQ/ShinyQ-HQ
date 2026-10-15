import { describe, expect, it } from "vitest";
import { isKeyProject, matchesPod, moreKeyProjects, pickFeaturedPods, podAttrs, withParams, navMatch, parsePodFilter, parseTypeFilter, podFilterQuery, stackOptions, typeCounts, wingCounts } from "@/content/pageview";
import { getPods } from "@/content/load";
import type { Pod } from "@/content/schema";

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
    expect(wingCounts(pods)).toEqual({ all: 3, ai: 2, data: 0, software: 1 });
    expect(wingCounts([...pods, { wing: "data" as const }])).toMatchObject({ all: 4, data: 1 });
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

describe("withParams", () => {
  it("replaces filter keys and keeps the rest", () => {
    expect(withParams("?tier=static&wing=ai", { wing: "software", stack: null })).toBe("?tier=static&wing=software");
    expect(withParams("?wing=ai", { wing: null })).toBe("");
  });

  it("serializes pod attributes for the filter islands", () => {
    expect(podAttrs({ wing: "ai", stack: ["A", "B"] })).toEqual({ "data-pod": "", "data-wing": "ai", "data-stack": "A|B" });
  });
});

describe("pickFeaturedPods", () => {
  const pod = (id: string, images: number, selected?: number) => ({ id, selected, assets: Array.from({ length: images }, () => ({})) as unknown as Pod["assets"] });

  it("keeps the given order and skips pods without a gallery", () => {
    expect(pickFeaturedPods([pod("a", 0), pod("b", 2), pod("c", 1), pod("d", 5), pod("e", 3)]).map((p) => p.id)).toEqual(["b", "c", "d"]);
  });

  it("returns fewer when fewer pods have a gallery", () => {
    expect(pickFeaturedPods([pod("a", 0), pod("b", 1)]).map((p) => p.id)).toEqual(["b"]);
    expect(pickFeaturedPods([pod("a", 1), pod("b", 1)], 1).map((p) => p.id)).toEqual(["a"]);
  });

  it("puts the owner's picks first by rank, then fills from the given order (owner decision 2026-10-15)", () => {
    const list = [pod("a", 1), pod("b", 1, 2), pod("c", 1), pod("d", 1, 1)];
    expect(pickFeaturedPods(list).map((p) => p.id)).toEqual(["d", "b", "a"]);
    expect(pickFeaturedPods(list, 2).map((p) => p.id)).toEqual(["d", "b"]);
  });

  it("features the three selected pods from the real dataset, independent of tier", () => {
    const pods = getPods();
    const picks = pickFeaturedPods(pods);
    expect(picks.map((p) => p.selected)).toEqual([1, 2, 3]);
    for (const p of picks) expect(p.assets.length).toBeGreaterThan(0);
    expect(picks.map((p) => p.slug)).toContain("ai-solutions-assistant");
    expect(pods.find((p) => p.slug === "ai-solutions-assistant")?.tier).toBe("featured");
    expect(pods.find((p) => p.slug === "fraud-review-platform")?.tier).toBe("hero");
  });
});

describe("key projects", () => {
  const asset = { src: "/x.webp", alt: { en: "x", id: "x" }, width: 1600, height: 1000, redacted: true };
  it("needs the hero tier and at least one screenshot", () => {
    expect(isKeyProject({ tier: "hero", assets: [asset] })).toBe(true);
    expect(isKeyProject({ tier: "hero", assets: [] })).toBe(false);
    expect(isKeyProject({ tier: "featured", assets: [asset] })).toBe(false);
  });
  it("lists only image key projects on the landing, outside Selected work (owner 2026-10-16)", () => {
    const all = getPods();
    const featured = pickFeaturedPods(all);
    const more = moreKeyProjects(all, featured).map((p) => p.slug);
    expect(more).toEqual(["fraud-review-platform", "vendor-management-portal", "ai-app-accelerator"]);
    expect(more).not.toContain("digital-banking-integrations");
    expect(more).not.toContain("ticket-marketplace-backend");
  });
});
