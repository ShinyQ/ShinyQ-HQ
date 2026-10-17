import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BuildFactsSchema, BuildStorySchema, COMING_SOON_IDS, STATION_IDS, getBuildFacts, getBuildStory, type BuildStory } from "@/content/build-story";
import { parseCiJobs } from "../../scripts/build-facts";
import { BYTES_3D_BUDGET, GPU_MEMORY_BUDGET, RENDER_BUDGET } from "../../e2e/budgets";
import { hasFirstPerson } from "@/lib/first-person";
import { LOCALES } from "@/content/locales";
import { EM_DASH, collectStrings } from "@/content/safety";
import { isTitleCase } from "@/content/title-case";

const root = process.cwd();
const raw = JSON.parse(readFileSync(path.join(root, "content", "build-story.json"), "utf8"));
const story = BuildStorySchema.parse(raw);

const ciJobNames = () => {
  const ci = readFileSync(path.join(root, ".github", "workflows", "ci.yml"), "utf8");
  return parseCiJobs(ci);
};

const titles = (s: BuildStory) => [
  { at: "title", value: s.title },
  ...STATION_IDS.map((id) => ({ at: `stations.${id}.title`, value: s.stations[id].title })),
  ...COMING_SOON_IDS.map((id) => ({ at: `comingSoon.${id}.title`, value: s.comingSoon[id].title })),
  ...s.stations.timeline.rounds.map((r) => ({ at: `rounds.${r.id}.title`, value: r.title })),
  ...s.stations.gates.gates.map((g) => ({ at: `gates.${g.id}.title`, value: g.title })),
  ...s.stations.agents.steps.map((st, i) => ({ at: `agents.steps[${i}].title`, value: st.title })),
];

describe("build story content", () => {
  it("parses and is memoized", () => {
    expect(getBuildStory()).toBe(getBuildStory());
    expect(getBuildStory().title.en).toBe("How This Site Was Built");
    expect(getBuildStory().title.id).toBe("Cara Situs Ini Dibuat");
  });

  it("has every title in Title Case and none in the first person", () => {
    for (const { at, value } of titles(story))
      for (const locale of LOCALES) {
        expect(isTitleCase(value[locale]), `${at}.${locale}: ${value[locale]}`).toBe(true);
        expect(hasFirstPerson(value[locale], locale), `${at}.${locale}`).toBe(false);
      }
  });

  it("has no em dash anywhere", () => {
    expect(collectStrings(raw).filter((l) => l.value.includes(EM_DASH)).map((l) => l.path)).toEqual([]);
  });

  it("numbers rounds in order with contiguous pull request ranges and an open last round", () => {
    const rounds = story.stations.timeline.rounds;
    expect(rounds).toHaveLength(9);
    expect(rounds.at(-1)!.prs.to).toBeNull();
    expect(rounds[0].prs.from).toBe(1);
  });

  it("rejects a round list with a gap", () => {
    const bad = structuredClone(raw);
    bad.stations.timeline.rounds[1].prs.from += 1;
    expect(BuildStorySchema.safeParse(bad).success).toBe(false);
    const open = structuredClone(raw);
    open.stations.timeline.rounds[0].prs.to = null;
    expect(BuildStorySchema.safeParse(open).success).toBe(false);
  });

  it("ships every before and after capture under 120 KB", () => {
    const shots = story.stations.timeline.rounds.flatMap((r) => (r.shots ? [r.shots.before, r.shots.after] : []));
    expect(shots).toHaveLength(6);
    for (const s of shots) {
      const file = path.join(root, "public", s.src);
      expect(existsSync(file), s.src).toBe(true);
      expect(statSync(file).size, s.src).toBeLessThan(120 * 1024);
    }
  });

  it("names only real ci.yml jobs in the gates", () => {
    const names = ciJobNames();
    for (const gate of story.stations.gates.gates)
      for (const job of gate.jobs) expect(names, `${gate.id}: ${job}`).toContain(job);
  });

  it("marks a gate required exactly when it blocks a merge through the aggregate job", () => {
    const ci = readFileSync(path.join(root, ".github", "workflows", "ci.yml"), "utf8");
    const aggregate = "Build, CV and e2e";
    const nameByKey = new Map([...ci.matchAll(/^ {2}([a-z][\w-]*):\n(?: {4}#.*\n)* {4}name: (.+)$/gm)].map((m) => [m[1], m[2].trim()] as const));
    const needs = ci.match(new RegExp(`name: ${aggregate}\\n(?:.*\\n)*? {4}needs: \\[([^\\]]+)\\]`))?.[1];
    expect(needs, "aggregate needs list").toBeTruthy();
    const neededNames = needs!.split(",").map((k) => nameByKey.get(k.trim()));
    expect(neededNames.every(Boolean), `needs resolve to job names: ${needs}`).toBe(true);
    for (const gate of story.stations.gates.gates)
      expect(gate.required, gate.id).toBe(gate.jobs.some((j) => j === aggregate || neededNames.includes(j)));
  });

  it("quotes the agents excerpt verbatim from its plan", () => {
    const { path: file, text } = story.stations.agents.excerpt;
    expect(existsSync(path.join(root, file))).toBe(true);
    const lines = readFileSync(path.join(root, file), "utf8").split("\n").map((l) => l.trim());
    const quoted = text.split("\n").map((l) => l.trim());
    expect(quoted.length).toBeGreaterThanOrEqual(6);
    expect(quoted.length).toBeLessThanOrEqual(20);
    const start = lines.findIndex((l, i) => quoted.every((q, k) => lines[i + k] === q));
    expect(start, "excerpt lines are consecutive in the plan").toBeGreaterThanOrEqual(0);
  });

  it("keeps the diagram free of resource ids and hostnames", () => {
    const text = JSON.stringify(story.stations.blueprint.architecture);
    expect(text).not.toMatch(/https?:\/\/|\.dev\b|\.com\b|[0-9a-f]{32}/i);
  });

  it("exports a facts schema and loader", () => {
    expect(BuildFactsSchema.safeParse({ generatedAt: "2026-10-17" }).success).toBe(true);
    expect(BuildFactsSchema.safeParse({ generatedAt: "2026-10-17", extra: 1 }).success).toBe(false);
    expect(getBuildFacts().generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("pins the budgets written in gate copy to e2e/budgets.ts and lighthouserc.json", () => {
    const gate = (id: string) => story.stations.gates.gates.find((g) => g.id === id)!;
    const lighthouse = JSON.parse(readFileSync(path.join(root, "lighthouserc.json"), "utf8"));
    const strict = lighthouse.ci.assert.assertMatrix.find((m: { assertions: Record<string, [string]> }) => m.assertions["largest-contentful-paint"][0] === "error").assertions;
    const max = (audit: string): number => strict[audit][1].maxNumericValue;
    const kb = (bytes: number) => `${bytes / 1024} KB`;
    const ids = (n: number, locale: "en" | "id") => String(n).replace(".", locale === "id" ? "," : ".");

    for (const locale of LOCALES) {
      const bytes = gate("bytes-3d").budget[locale];
      expect(bytes, `bytes-3d.${locale}`).toContain(kb(BYTES_3D_BUDGET.failAt));

      const render = gate("render-memory").budget[locale];
      expect(render, `render-memory.${locale}`).toContain(String(RENDER_BUDGET.sceneCalls));
      expect(render, `render-memory.${locale}`).toContain(locale === "en" ? `${RENDER_BUDGET.triangles / 1000}k` : `${RENDER_BUDGET.triangles / 1000} ribu`);
      expect(render, `render-memory.${locale}`).toContain(`${GPU_MEMORY_BUDGET.heapBytes / 1024 / 1024} MB`);

      const speed = gate("lighthouse").budget[locale];
      const seconds = max("largest-contentful-paint") / 1000;
      expect(speed, `lighthouse.${locale}`).toContain(locale === "en" ? `LCP ${seconds} s` : `LCP ${seconds} detik`);
      expect(speed, `lighthouse.${locale}`).toContain(`CLS ${ids(max("cumulative-layout-shift"), locale)}`);
      expect(speed, `lighthouse.${locale}`).toContain(`TBT ${max("total-blocking-time")} ms`);
      expect(speed, `lighthouse.${locale}`).toContain(`JS ${kb(max("resource-summary:script:size"))}`);
    }
    expect([GPU_MEMORY_BUDGET.geometries, GPU_MEMORY_BUDGET.textures, GPU_MEMORY_BUDGET.programs], "the copy says zero GPU object growth").toEqual([0, 0, 0]);
  });

  it("keeps client names out of the timeline and counts the unlinked pull requests", () => {
    const round2 = story.stations.timeline.rounds[1];
    expect(round2.summary.en).not.toMatch(/names?\b/i);
    expect(round2.summary.id).not.toMatch(/nama/i);
    expect(story.stations.timeline.unlinkedPrs).toEqual([26]);
    expect(round2.prs.from).toBeLessThanOrEqual(26);
    expect(round2.prs.to).toBeGreaterThanOrEqual(26);
    const bad = structuredClone(raw);
    bad.stations.timeline.unlinkedPrs = [0];
    expect(BuildStorySchema.safeParse(bad).success).toBe(false);
  });

  it("has a publication date", () => {
    expect(story.published).toBe("2026-10-17");
    const bad = structuredClone(raw);
    bad.published = "17 Oct 2026";
    expect(BuildStorySchema.safeParse(bad).success).toBe(false);
  });
});
