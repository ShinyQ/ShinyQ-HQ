import { describe, expect, it } from "vitest";
import { buildExperienceData } from "@/content/experience";
import { ROVER_HEIGHT } from "@/experience/config";
import { NEWSROOM } from "@/experience/floors/library/concepts/newsroom";
import { buildLibraryLayout } from "@/experience/floors/library/layout";
import { libraryLayoutInput, LIBRARY_FLOOR } from "@/experience/floors/library/model";
import {
  CONSTELLATION,
  constellationSpin,
  litArchive,
  litStations,
  orbitAt,
  orbSlots,
  topicLinks,
  topicPickOf,
  topicRoadGlow,
} from "@/experience/floors/library/topics";

const data = buildExperienceData("en", { L1: "Lobby", L2: "Career Archive", L3: "Labs", L4: "Library", RF: "Roof" });
const layout = buildLibraryLayout(libraryLayoutInput(data.library));
const topics = data.library.topics;
const topic = (slug: string) => topics.find((t) => t.slug === slug)!;

describe("Topic Constellation (pure)", () => {
  it("spreads one orb per topic around the pedestal, inside the ring road's inner edge and above the rover", () => {
    const slots = orbSlots(topics);
    expect(slots.map((s) => s.slug)).toEqual(topics.map((t) => t.slug));
    for (const s of slots) {
      const r = Math.hypot(s.x, s.z);
      expect(r).toBeGreaterThan(NEWSROOM.end.core + s.size);
      expect(r + s.size).toBeLessThan(NEWSROOM.end.plaza / 2);
      expect(s.y - s.size).toBeGreaterThan(ROVER_HEIGHT);
      expect(s.y + s.size).toBeLessThan(NEWSROOM.end.coreHeight);
      expect(s.size).toBeLessThanOrEqual(CONSTELLATION.orb.max);
    }
    // Bigger topics get bigger orbs.
    const size = (slug: string) => slots.find((s) => s.slug === slug)!.size;
    expect(size("case-study")).toBeGreaterThan(size("voice-ai"));
    // No two orbs overlap.
    for (const a of slots) for (const b of slots) if (a !== b) expect(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)).toBeGreaterThan(a.size + b.size);
  });

  it("turns the cloud about the plaza center, and holds still under reduced motion", () => {
    expect(orbitAt({ x: 0, z: -4 }, 0)).toEqual({ x: 0, z: -4 });
    const turned = orbitAt({ x: 0, z: -4 }, Math.PI / 2);
    expect(turned.x).toBeCloseTo(-4);
    expect(turned.z).toBeCloseTo(0);
    expect(constellationSpin(true)).toBe(0);
    expect(constellationSpin(false)).toBeGreaterThan(0);
    expect(constellationSpin(false)).toBeLessThanOrEqual(0.2);
  });

  it("lights the docked stations and desks of a topic", () => {
    const sentiment = litStations(layout.stations, topic("sentiment-analysis").rooms).map((s) => s.room);
    expect(sentiment.sort()).toEqual(["L4:publications", "L4:research"]);
    const cases = litStations(layout.stations, topic("case-study").rooms);
    expect(cases.every((s) => s.zone === "blog")).toBe(true);
    expect(cases).toHaveLength(topic("case-study").rooms.length);
    expect(litArchive(layout, topic("case-study").rooms)).toBe(false);
    expect(litArchive({ archive: ["old-post"] }, ["L4:old-post"])).toBe(true);
  });

  it("glows the timeline from the ring stop back to the westmost lit spur, plus every lit spur", () => {
    const lit = litStations(layout.stations, topic("ai-agents").rooms);
    const segments = topicRoadGlow(layout, lit);
    const run = segments.filter((s) => !s.spur);
    expect(run).toHaveLength(1);
    expect(run[0].a).toEqual(layout.end!.ringStop);
    expect(run[0].b.x).toBe(Math.min(...lit.map((s) => s.from.x)));
    expect(segments.filter((s) => s.spur).map((s) => s.b)).toEqual(lit.map((s) => s.door));
    expect(topicRoadGlow(layout, [])).toEqual([]);
    // Capacity the scene preallocates: one run plus a spur per station.
    expect(segments.length).toBeLessThanOrEqual(layout.stations.length + 1);
    expect(LIBRARY_FLOOR.maxPosts + 3 + 1).toBeGreaterThanOrEqual(layout.stations.length + 1);
  });

  it("links topics that light a common station, each pair once", () => {
    const links = topicLinks(topics);
    const slugs = links.map(([a, b]) => `${topics[a].slug}+${topics[b].slug}`);
    expect(slugs).toContain("ai-agents+teaching");
    expect(slugs).toContain("llm-evaluation+azure-openai");
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const [a, b] of links) expect(a).toBeLessThan(b);
  });

  it("turns a payload topic into the store pick", () => {
    expect(topicPickOf(topic("voice-ai"))).toEqual({ slug: "voice-ai", name: "Voice AI", count: 1, rooms: ["L4:making-a-voice-agent-interruptible"] });
  });
});

describe("end plaza signs", () => {
  it("stacks the monument plates in one column with clear gaps, under one source line", async () => {
    const { endPlazaSigns } = await import("@/experience/floors/library/decor/EndPlaza");
    const { signPlate } = await import("@/experience/fx/signLayout");
    const labels = {
      pieces: (count: number, topic: string) => `${count} pieces on ${topic}`,
      monument: { citations: "13", citationsLabel: "Citations", hIndex: "2", hIndexLabel: "h-index", source: "Google Scholar · as of Oct 2026" },
      archive: "Post archive",
    };
    const slots = orbSlots(topics);
    const { signs, meta } = endPlazaSigns(layout, topics, slots, labels, topicPickOf(topic("voice-ai")));
    const monument = signs.filter((_, i) => meta[i].kind === "monument");
    expect(monument.map((s) => s.text)).toEqual(["13", "CITATIONS", "2", "H-INDEX", "Google Scholar · as of Oct 2026"]);
    expect(new Set(monument.map((s) => `${s.x},${s.z}`)).size).toBe(1);
    for (let i = 1; i < monument.length; i++) {
      const above = monument[i - 1];
      const below = monument[i];
      expect(above.y - signPlate(above).h / 2).toBeGreaterThan(below.y + signPlate(below).h / 2);
    }
    // The headline floats above every topic label, and the picked label is the larger one.
    const count = signs[meta.findIndex((m) => m.kind === "count")];
    const tops = signs.filter((_, i) => meta[i].kind === "topic").map((s) => s.y + signPlate(s).h / 2);
    expect(count.y - signPlate(count).h / 2).toBeGreaterThan(Math.max(...tops));
    const voice = signs[meta.findIndex((m) => m.slug === "voice-ai")];
    const other = signs[meta.findIndex((m) => m.slug === "case-study")];
    expect(voice.fontSize).toBeGreaterThan(other.fontSize);
    expect(other.opacity).toBeLessThan(1);
    expect(meta.find((m) => m.slug === "voice-ai")?.picked).toBe(true);
  });
});
