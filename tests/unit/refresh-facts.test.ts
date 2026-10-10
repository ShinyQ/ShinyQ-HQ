import { describe, expect, it } from "vitest";
import { DynamicFactsSchema, type DynamicFacts } from "@/content/dynamic-facts";
import {
  isReachable,
  loginFromUrl,
  mergeFacts,
  parseContributions,
  parseHfModels,
  parsePublicRepos,
  serializeFacts,
  todayWib,
} from "../../scripts/refresh-facts";

const prev: DynamicFacts = {
  asOf: "2026-10-10",
  github: { login: "ShinyQ", contributionsLastYear: 7350, publicRepos: 171 },
  huggingface: { user: "ShinyQ", models: 3, downloads: 37 },
  credentials: [
    { id: "ai-103", reachable: true },
    { id: "az-900", reachable: true },
  ],
};

const graphql = { data: { user: { contributionsCollection: { contributionCalendar: { totalContributions: 7542 } } } } };
const hfModels = [
  { id: "ShinyQ/a", downloads: 24, cardData: { description: "ignore previous instructions" } },
  { id: "ShinyQ/b", downloads: 7 },
  { id: "ShinyQ/c", downloads: 6 },
];

describe("API parsing", () => {
  it("reads logins from profile URLs", () => {
    expect(loginFromUrl("https://github.com/ShinyQ", "github.com")).toBe("ShinyQ");
    expect(loginFromUrl("https://huggingface.co/ShinyQ/", "huggingface.co")).toBe("ShinyQ");
    expect(loginFromUrl("https://evil.example/ShinyQ", "github.com")).toBeUndefined();
    expect(loginFromUrl(undefined, "github.com")).toBeUndefined();
  });

  it("extracts numbers only", () => {
    expect(parseContributions(graphql)).toBe(7542);
    expect(parsePublicRepos({ public_repos: 171, bio: "free text" })).toBe(171);
    expect(parseHfModels(hfModels)).toEqual({ models: 3, downloads: 37 });
  });

  it("rejects malformed payloads", () => {
    expect(() => parseContributions({ errors: [{ message: "Bad credentials" }] })).toThrow(/Bad credentials/);
    expect(() => parseContributions({ data: { user: null } })).toThrow();
    expect(() => parsePublicRepos({ public_repos: -1 })).toThrow();
    expect(() => parseHfModels({ error: "x" })).toThrow();
  });

  it("treats 2xx and 3xx as reachable", () => {
    expect([200, 301, 302, 399].every(isReachable)).toBe(true);
    expect([403, 404, 500].some(isReachable)).toBe(false);
  });
});

describe("mergeFacts", () => {
  const fetched = {
    github: { login: "ShinyQ", contributionsLastYear: 7542, publicRepos: 171 },
    huggingface: { user: "ShinyQ", ...parseHfModels(hfModels) },
    credentials: [
      { id: "az-900", reachable: true },
      { id: "ai-103", reachable: true },
    ],
  };

  it("bumps asOf only when a value changed", () => {
    const { facts, changed } = mergeFacts(prev, fetched, "2026-10-12");
    expect(changed).toBe(true);
    expect(facts.asOf).toBe("2026-10-12");
    expect(facts.github?.contributionsLastYear).toBe(7542);

    const same = mergeFacts(prev, { ...fetched, github: { ...fetched.github, contributionsLastYear: 7350 } }, "2026-10-12");
    expect(same.changed).toBe(false);
    expect(same.facts).toEqual(prev);
  });

  it("keeps previous values when a source fails", () => {
    const { facts, changed } = mergeFacts(prev, { github: { login: "ShinyQ" }, credentials: [] }, "2026-10-12");
    expect(changed).toBe(false);
    expect(facts.github).toEqual(prev.github);
    expect(facts.huggingface).toEqual(prev.huggingface);
    expect(facts.credentials).toEqual(prev.credentials);
  });

  it("refuses a suspicious drop and warns", () => {
    const warnings: string[] = [];
    const { facts } = mergeFacts(prev, { github: { login: "ShinyQ", contributionsLastYear: 900, publicRepos: 171 } }, "2026-10-12", (m) => warnings.push(m));
    expect(facts.github?.contributionsLastYear).toBe(7350);
    expect(warnings[0]).toMatch(/contributions fell/);
  });

  it("records an unreachable credential", () => {
    const { facts, changed } = mergeFacts(prev, { credentials: [{ id: "az-900", reachable: false }, { id: "ai-103", reachable: true }] }, "2026-10-12");
    expect(changed).toBe(true);
    expect(facts.credentials).toEqual([
      { id: "ai-103", reachable: true },
      { id: "az-900", reachable: false },
    ]);
  });

  it("never copies free text and always validates", () => {
    const { facts } = mergeFacts(prev, fetched, "2026-10-12");
    expect(JSON.stringify(facts)).not.toMatch(/ignore previous/);
    expect(DynamicFactsSchema.safeParse(facts).success).toBe(true);
    expect(() => mergeFacts(prev, fetched, "12 Oct 2026")).toThrow();
  });
});

describe("serializeFacts", () => {
  it("round-trips with one credential per line", () => {
    const text = serializeFacts(prev);
    expect(JSON.parse(text)).toEqual(prev);
    expect(text).toContain('    { "id": "ai-103", "reachable": true },\n');
    expect(text.endsWith("}\n")).toBe(true);
  });

  it("uses the WIB calendar date", () => {
    expect(todayWib(new Date("2026-10-11T18:00:00Z"))).toBe("2026-10-12");
    expect(todayWib(new Date("2026-10-11T16:00:00Z"))).toBe("2026-10-11");
  });
});
