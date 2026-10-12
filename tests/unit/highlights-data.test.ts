import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildCareerData, buildExperienceData } from "@/content/experience";
import { buildHighlightsData, highlightEntries, highlightProjects } from "@/content/highlights";
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
    expect(gateStartRoom("L3", undefined, "#highlights")).toBeUndefined();
    expect(gateStartRoom(undefined, "L3:x", "#highlights")).toBe("L3:x");
  });
});
