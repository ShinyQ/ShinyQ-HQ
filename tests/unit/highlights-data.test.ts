import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildCareerData, buildExperienceData } from "@/content/experience";
import { beforeAfterResults, buildHighlightsData, highlightEntries, highlightProjects, resultBars, winTokens } from "@/content/highlights";
import { getPod, getPods, getTimeline } from "@/content/load";
import { pickFeaturedPods } from "@/content/pageview";
import { podLiveLink } from "@/content/selectors";
import { experienceRows, gateStartRoom, highlightRoom, highlightsRoomFromHash, isHighlightRoom } from "@/experience/floors/lobby/stations";

const names = { L1: "Lobby", L2: "Career Archive", L3: "Labs", L4: "Library", RF: "Roof" };

describe("Highlights data", () => {
  it("picks the same three projects as the Page View landing", () => {
    const landing = pickFeaturedPods(getPods()).map((p) => p.slug);
    expect(landing).toHaveLength(3);
    expect(highlightProjects().map((p) => p.slug)).toEqual(landing);
    expect(buildHighlightsData("en").projects.map((p) => p.slug)).toEqual(landing);
  });

  it("ships a cover thumbnail that exists for every project", () => {
    for (const p of buildHighlightsData("en").projects) {
      expect(p.thumb).toMatch(/\.thumb\.webp$/);
      expect(existsSync(join(process.cwd(), "public", p.thumb)), p.thumb).toBe(true);
    }
  });

  it("splits employment and freelance, newest first", () => {
    const { employment, freelance } = highlightEntries(getTimeline());
    expect(employment.length).toBeGreaterThan(0);
    expect(freelance.length).toBeGreaterThan(0);
    expect(employment.every((e) => e.type === "job")).toBe(true);
    expect(freelance.every((e) => e.type === "freelance")).toBe(true);
    for (const list of [employment, freelance]) {
      const starts = list.map((e) => e.start);
      expect(starts).toEqual([...starts].sort().reverse());
    }
  });

  it("orders the 3D rows like the drawer (same slugs, same order)", () => {
    const rows = experienceRows(buildCareerData("en"));
    const entries = highlightEntries(getTimeline());
    expect(rows.employment.map((e) => e.slug)).toEqual(entries.employment.map((e) => e.slug));
    expect(rows.freelance.map((e) => e.slug)).toEqual(entries.freelance.map((e) => e.slug));
  });

  it("finds every project's live link (R4-J) on the L3 payload, so the hall never ships it twice", () => {
    const data = buildExperienceData("en", names);
    for (const p of data.highlights.projects) {
      const labPod = data.labs.pods.find((pod) => pod.slug === p.slug)!;
      expect(podLiveLink(labPod)).toEqual(podLiveLink(getPod(p.slug)!));
    }
    expect(Object.keys(data.highlights.projects[0]).sort()).toEqual(["slug", "thumb", "title", "wing"]);
  });

  it("adds the payload to ExperienceData in the requested locale", () => {
    const data = buildExperienceData("id", names);
    expect(data.highlights.projects).toHaveLength(3);
    expect(data.highlights.projects[0].title).toBe(pickFeaturedPods(getPods())[0].title.id);
  });
});

describe("Highlights rooms", () => {
  it("builds room ids and parses deep-link hashes", () => {
    expect(highlightRoom("projects")).toBe("L1:highlights-projects");
    expect(isHighlightRoom("L1:highlights-contact")).toBe(true);
    expect(isHighlightRoom("L1:profile")).toBe(false);
    expect(highlightsRoomFromHash("#highlights")).toBe("L1:highlights-about");
    expect(highlightsRoomFromHash("#highlights-experience")).toBe("L1:highlights-experience");
    expect(highlightsRoomFromHash("#HIGHLIGHTS-CONTACT")).toBe("L1:highlights-contact");
    expect(highlightsRoomFromHash("#work")).toBeNull();
    expect(highlightsRoomFromHash("")).toBeNull();
  });

  it("starts the landing on a station from its hash, and never overrides a floor or room route", () => {
    expect(gateStartRoom(undefined, undefined, "#highlights-projects")).toBe("L1:highlights-projects");
    expect(gateStartRoom(undefined, undefined, "#work")).toBeUndefined();
    // The Tech Reactor deep link only on the L3 floor route.
    expect(gateStartRoom("L3", undefined, "#labs-tech=azure-openai")).toBe("L3:reactor");
    expect(gateStartRoom("L3", undefined, "#all-projects")).toBeUndefined();
    expect(gateStartRoom("L2", undefined, "#labs-tech=azure-openai")).toBeUndefined();
    expect(gateStartRoom("L3", "L3:voice-ai-contact-center", "#labs-tech=azure-openai")).toBe("L3:voice-ai-contact-center");
    expect(gateStartRoom("L3", undefined, "#highlights")).toBeUndefined();
    expect(gateStartRoom(undefined, "L3:x", "#highlights")).toBe("L3:x");
  });
});

describe("hall interiors data (owner decision 2026-11-04)", () => {
  it("parses a result's before and after into comparable numbers", () => {
    expect(resultBars("90.9% to 36.4%")).toEqual({ before: 90.9, after: 36.4, scale: "linear" });
    expect(resultBars("11.7 MB → 158 KB")).toEqual({ before: 11_700, after: 158, scale: "log" });
    expect(resultBars("~2 s to ~0.2 s")).toEqual({ before: 2, after: 0.2, scale: "linear" });
    expect(resultBars("60 s → <2 s")).toEqual({ before: 60, after: 2, scale: "log" });
    expect(resultBars("76.2% to 0%")).toEqual({ before: 76.2, after: 0, scale: "linear" });
    expect(resultBars("2 → 1")).toEqual({ before: 2, after: 1, scale: "linear" });
    expect(resultBars("850 ms to 1.2 s")).toEqual({ before: 0.85, after: 1.2, scale: "linear" });
  });

  it("shows text only when the sides are not comparable", () => {
    expect(resultBars("6 vs 18")).toBeNull();
    expect(resultBars("4.5 KB → 2.1 s")).toBeNull();
    expect(resultBars("0% to 0%")).toBeNull();
    expect(resultBars("fast to faster")).toBeNull();
  });

  it("parses every result the station shows today (at least 8 of them)", () => {
    const values = beforeAfterResults().map((r) => r.result.value);
    expect(values.filter((v) => resultBars(v) !== null).length).toBeGreaterThanOrEqual(Math.min(8, values.length));
  });

  it("makes one win token per award and honor, gold larger in the inner ring", () => {
    const wins = buildHighlightsData("en").wins;
    const tokens = winTokens(wins.tiers);
    expect(tokens).toHaveLength(wins.placings);
    expect(tokens.filter((t) => t.tier === "gold").every((t) => t.size > 1 && t.ring === 0)).toBe(true);
    expect(tokens.filter((t) => t.tier === "honor").every((t) => t.size < 1 && t.ring === 2)).toBe(true);
    // Each ring's tokens stand at distinct angles.
    for (const ring of [0, 1, 2]) {
      const angles = tokens.filter((t) => t.ring === ring).map((t) => t.angle.toFixed(4));
      expect(new Set(angles).size).toBe(angles.length);
    }
  });
});

describe("hall interiors text morphs (owner, 2026-11-04)", () => {
  it("morphs a result from its before to its after value in the after side's unit, ending on its own text", async () => {
    const { morphFrames } = await import("@/content/hallBars");
    expect(morphFrames("~2 s to ~0.2 s")).toEqual(expect.arrayContaining(["~2.0 s", "~2 s to ~0.2 s"]));
    expect(morphFrames("~2 s to ~0.2 s")[0]).toBe("~2.0 s");
    const size = morphFrames("11.7 MB → 156 KB");
    expect(size[0]).toBe("11,700 KB");
    expect(size.at(-1)).toBe("11.7 MB → 156 KB");
    expect(morphFrames("90.9% to 36.4%")[0]).toBe("90.9%");
    expect(morphFrames("6 vs 18")).toEqual(["6 vs 18"]);
  });
  it("types a line in behind a cursor and ends on it", async () => {
    const { typeFrames } = await import("@/content/hallBars");
    const f = typeFrames("Metrodata", 4);
    expect(f).toHaveLength(4);
    expect(f[0].endsWith("_")).toBe(true);
    expect(f.at(-1)).toBe("Metrodata");
  });
});
