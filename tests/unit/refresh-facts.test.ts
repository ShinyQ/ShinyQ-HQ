import { describe, expect, it } from "vitest";
import { DynamicFactsSchema, type DynamicFacts } from "@/content/dynamic-facts";
import {
  isReachable,
  loginFromUrl,
  mergeFacts,
  parseCalendar,
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

const GITHUB_LEVELS = ["NONE", "FIRST_QUARTILE", "SECOND_QUARTILE", "THIRD_QUARTILE", "FOURTH_QUARTILE"];
const plusDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** A year of 366 days from a Sunday: 300 quiet days, 65 days with one contribution, then the rest on the last day. */
function year(total: number, start = "2025-11-02") {
  const counts = Array.from({ length: 366 }, (_, i) => (i < 300 ? 0 : i < 365 ? 1 : total - 65));
  const levels = counts.map((n) => (n === 0 ? 0 : n === 1 ? 1 : 4));
  return { start, levels: levels.join(""), counts };
}

/** The GraphQL payload for a compact calendar: weeks of seven days, GitHub's level names. */
function calendarPayload(cal: { start: string; levels: string; counts: number[] }, total = cal.counts.reduce((s, n) => s + n, 0)) {
  const days = cal.counts.map((contributionCount, i) => ({ date: plusDays(cal.start, i), contributionCount, contributionLevel: GITHUB_LEVELS[Number(cal.levels[i])] }));
  const weeks = Array.from({ length: Math.ceil(days.length / 7) }, (_, w) => ({ contributionDays: days.slice(w * 7, w * 7 + 7) }));
  return { data: { user: { contributionsCollection: { contributionCalendar: { totalContributions: total, weeks } } } } };
}
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

  it("reads the calendar as a start date, one level digit and one count per day", () => {
    const cal = year(7542);
    expect(parseCalendar(calendarPayload(cal))).toEqual(cal);
    expect(parseContributions(calendarPayload(cal))).toBe(7542);
  });

  it("rejects a calendar with an unknown level, a missing day, or counts that miss the total", () => {
    const cal = year(7542);
    const unknown = calendarPayload(cal);
    unknown.data.user.contributionsCollection.contributionCalendar.weeks[50].contributionDays[3].contributionLevel = "FIFTH_QUARTILE";
    expect(() => parseCalendar(unknown)).toThrow(/level/);
    const gap = calendarPayload(cal);
    gap.data.user.contributionsCollection.contributionCalendar.weeks[10].contributionDays.splice(2, 1);
    expect(() => parseCalendar(gap)).toThrow(/date/);
    expect(() => parseCalendar(calendarPayload(cal, 7543))).toThrow(/7543/);
    expect(() => parseCalendar(graphql)).toThrow();
    expect(() => parseCalendar({ errors: [{ message: "Bad credentials" }] })).toThrow(/Bad credentials/);
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

  it("takes the calendar with its total", () => {
    const withCal: DynamicFacts = { ...prev, github: { ...prev.github!, calendar: year(7350) } };
    const { facts, changed } = mergeFacts(withCal, { github: { ...fetched.github, calendar: year(7542, "2025-11-09") } }, "2026-10-12");
    expect(changed).toBe(true);
    expect(facts.github?.contributionsLastYear).toBe(7542);
    expect(facts.github?.calendar?.start).toBe("2025-11-09");
  });

  it("keeps the previous total with the previous calendar when the calendar is missing", () => {
    const withCal: DynamicFacts = { ...prev, github: { ...prev.github!, calendar: year(7350) } };
    const warnings: string[] = [];
    const { facts, changed } = mergeFacts(withCal, { github: fetched.github }, "2026-10-12", (m) => warnings.push(m));
    expect(changed).toBe(false);
    expect(facts.github).toEqual(withCal.github);
    expect(warnings[0]).toMatch(/calendar/);
  });

  it("keeps the previous calendar when a suspicious drop keeps the previous total", () => {
    const withCal: DynamicFacts = { ...prev, github: { ...prev.github!, calendar: year(7350) } };
    const { facts } = mergeFacts(withCal, { github: { login: "ShinyQ", contributionsLastYear: 900, publicRepos: 171, calendar: year(900, "2025-11-09") } }, "2026-10-12");
    expect(facts.github).toEqual(withCal.github);
  });

  it("starts the calendar when the previous facts had none", () => {
    const { facts } = mergeFacts(prev, { github: { ...fetched.github, calendar: year(7542) } }, "2026-10-12");
    expect(facts.github?.calendar).toEqual(year(7542));
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

  it("writes the calendar counts on one line", () => {
    const facts: DynamicFacts = { ...prev, github: { ...prev.github!, contributionsLastYear: 7542, calendar: year(7542) } };
    const text = serializeFacts(facts);
    expect(JSON.parse(text)).toEqual(facts);
    expect(text).toContain(`      "counts": [${year(7542).counts.join(",")}]\n`);
    expect(text.split("\n").length).toBeLessThan(40);
  });

  it("uses the WIB calendar date", () => {
    expect(todayWib(new Date("2026-10-11T18:00:00Z"))).toBe("2026-10-12");
    expect(todayWib(new Date("2026-10-11T16:00:00Z"))).toBe("2026-10-11");
  });
});
