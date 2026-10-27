import { describe, expect, it } from "vitest";
import { buildExperienceData } from "@/content/experience";
import { getContent, getTopicIndex, getTrackIndex } from "@/content/load";
import { buildRoomViews } from "@/content/room-views";
import { topicRooms } from "@/content/topic-index";
import { buildHudIndex } from "@/hud/index-data";

const floors = { L1: "Lobby", L2: "Career Archive", L3: "Labs", L4: "Library", RF: "Roof" };

describe("Topic Constellation payloads", () => {
  const index = getTopicIndex();

  it("ships every topic to the 3D chunk with its locale label, count and rooms", () => {
    for (const locale of ["en", "id"] as const) {
      const topics = buildExperienceData(locale, floors).library.topics;
      expect(topics.map((t) => t.slug)).toEqual(index.topics.map((t) => t.slug));
      for (const [i, t] of topics.entries()) {
        expect(t.count).toBe(index.topics[i].items.length);
        expect(t.rooms).toEqual(topicRooms(index.topics[i]));
        expect(t.label.length).toBeGreaterThan(0);
      }
    }
    expect(buildExperienceData("id", floors).library.topics.find((t) => t.slug === "sentiment-analysis")?.label).toBe("Analisis sentimen");
  });

  it("builds the L4:topics drawer view with every piece and its room", () => {
    const view = buildRoomViews("en")["L4:topics"];
    expect(view.kind).toBe("topics");
    expect(view.title).toBe("Topic Constellation");
    expect(view.page).toBe("/library#topics");
    expect(view.topics?.topics.map((t) => t.slug)).toEqual(index.topics.map((t) => t.slug));
    const voice = view.topics!.topics.find((t) => t.slug === "voice-ai")!;
    expect(voice.label).toBe("Voice AI");
    expect(voice.items).toEqual([
      { room: "L4:aria-acs-to-livekit", title: "Moving ARIA From ACS to LiveKit: What Changed and What Improved", kind: "post" },
      { room: "L4:making-a-voice-agent-interruptible", title: "How We Made a Voice Agent Interruptible", kind: "post" },
    ]);
    const teaching = buildRoomViews("id")["L4:topics"].topics!.topics.find((t) => t.slug === "teaching")!;
    expect(teaching.label).toBe("Mengajar dan mentoring");
    expect(teaching.items.some((i) => i.room === "L4:talks" && i.title === "Praktikum Dasar Pemrograman Go")).toBe(true);
  });

  it("lists the topics in the HUD index and the room catalog", () => {
    const hud = buildHudIndex(getContent());
    expect(hud.topics.map((t) => t.slug)).toEqual(index.topics.map((t) => t.slug));
    expect(hud.topics.find((t) => t.slug === "ui-ux")?.title).toEqual({ en: "Show work about UI/UX", id: "Tampilkan karya tentang UI/UX" });
    const room = hud.rooms.find((r) => r.id === "L4:topics");
    expect(room).toMatchObject({ floor: "L4", kind: "topics", path: "/library#topics", title: { en: "Topic Constellation", id: "Konstelasi Topik" } });
  });
});

describe("reader track payloads", () => {
  it("ships the non-empty tracks to the 3D chunk with their locale label and post order", () => {
    const index = getTrackIndex().filter((t) => t.posts.length);
    for (const locale of ["en", "id"] as const) {
      const tracks = buildExperienceData(locale, floors).library.tracks;
      expect(tracks.map((t) => t.slug)).toEqual(index.map((t) => t.slug));
      expect(tracks.map((t) => t.posts)).toEqual(index.map((t) => t.posts));
    }
    expect(buildExperienceData("en", floors).library.tracks[0]).toMatchObject({ slug: "ai-in-production", label: "AI in Production" });
    expect(buildExperienceData("id", floors).library.tracks[0].label).toBe("AI di Produksi");
  });
});
