import { describe, expect, it } from "vitest";
import { getContent } from "@/content/load";
import type { RoomId } from "@/content/schema";
import { buildRoomCatalog, buildYears, floorOf, localize, roomFromPath, roomPath, type RoomInfo } from "@/experience/missions/rooms";
import { pickSurprise } from "@/experience/missions/surprise";
import { buildHudIndex, structuralLabels } from "@/hud/index-data";

const content = getContent();
const rooms = buildRoomCatalog(content, structuralLabels());
const byId = new Map(rooms.map((r) => [r.id, r]));

describe("room catalog", () => {
  it("has unique room ids that match FloorId:slug", () => {
    expect(new Set(rooms.map((r) => r.id)).size).toBe(rooms.length);
    for (const room of rooms) {
      expect(room.id).toBe(`${room.floor}:${room.slug}`);
      expect(floorOf(room.id)).toBe(room.floor);
    }
  });

  it("covers every pod, career entry and post", () => {
    for (const pod of content.floors.labs.pods) expect(byId.get(`L3:${pod.slug}`)?.path).toBe(`/labs/${pod.slug}`);
    for (const entry of content.floors.careerArchive.entries) expect(byId.get(`L2:${entry.slug}`)?.path).toBe(`/journey/${entry.slug}`);
    for (const post of content.floors.library.posts) expect(byId.has(`L4:${post.slug}`)).toBe(true);
  });

  it("resolves every room referenced by a mission step", () => {
    const refs = content.missions.flatMap((m) =>
      m.steps.flatMap((s) => (s.kind === "open" ? [s.room] : s.kind === "drive" && typeof s.to === "string" ? [s.to] : [])),
    );
    expect(refs.length).toBeGreaterThan(0);
    expect(refs.filter((id) => !byId.has(id))).toEqual([]);
  });

  it("maps rooms to static routes (appendix 06 URL scheme)", () => {
    const pod = byId.get("L3:voice-ai-contact-center")!;
    expect(roomPath(pod)).toBe("/labs/voice-ai-contact-center");
    expect(roomPath(pod, "architecture")).toBe("/labs/voice-ai-contact-center#architecture");
    expect(roomPath(pod, "overview")).toBe("/labs/voice-ai-contact-center");
    expect(roomPath(byId.get("RF:contact")!)).toBe("/contact");
    expect(roomPath(byId.get("RF:cv")!)).toBe("/cv");
    expect(byId.get("L2:prologue-2016")!.floorPath).toBe("/journey#y2019");
    expect(byId.get("L1:skills")!.path).toBe("/#skills");
  });

  it("sends external posts to the library shelf instead of a /blog page", () => {
    const external = rooms.filter((r) => r.kind === "post" && r.external);
    expect(external.length).toBeGreaterThan(0);
    for (const room of external) expect(room.path).toBe("/library#posts");
  });

  it("adds the locale prefix", () => {
    expect(localize("en", "/")).toBe("/en");
    expect(localize("id", "/#skills")).toBe("/id#skills");
    expect(localize("id", "/labs/x#results")).toBe("/id/labs/x#results");
  });

  it("finds the room for a page path", () => {
    expect(roomFromPath("/labs/voice-ai-contact-center", rooms)?.id).toBe("L3:voice-ai-contact-center");
    expect(roomFromPath("/contact/", rooms)?.id).toBe("RF:contact");
    expect(roomFromPath("/labs", rooms)).toBeUndefined();
  });

  it("builds year rooms 2019 onward with the prologue folded in", () => {
    const years = buildYears(content);
    expect(years[0].year).toBe(2019);
    expect(years[0].room).toBe("L2:prologue-2016");
    expect(years.map((y) => y.path)).toContain("/journey#y2024");
  });

  it("builds a serializable HUD index with labels in both languages", () => {
    const index = buildHudIndex(content);
    expect(JSON.parse(JSON.stringify(index))).toEqual(index);
    expect(index.missions.map((m) => m.order)).toEqual([...index.missions.map((m) => m.order)].sort((a, b) => a - b));
    expect(byId.get("RF:cv")!.title.id).not.toBe(byId.get("RF:cv")!.title.en);
  });
});

describe("pickSurprise", () => {
  const sample: RoomInfo[] = [
    { ...rooms[0], id: "L3:hero" as RoomId, surpriseWeight: 6 },
    { ...rooms[0], id: "L3:listed" as RoomId, surpriseWeight: 1 },
    { ...rooms[0], id: "L1:never" as RoomId, surpriseWeight: 0 },
  ];

  it("weights the roll by surpriseWeight", () => {
    expect(pickSurprise(sample, [], () => 0)?.id).toBe("L3:hero");
    expect(pickSurprise(sample, [], () => 0.85)?.id).toBe("L3:hero");
    expect(pickSurprise(sample, [], () => 0.9)?.id).toBe("L3:listed");
    expect(pickSurprise(sample, [], () => 0.999999)?.id).toBe("L3:listed");
  });

  it("skips visited rooms and never picks weight 0", () => {
    expect(pickSurprise(sample, ["L3:hero"], () => 0)?.id).toBe("L3:listed");
  });

  it("falls back to every candidate once all were visited", () => {
    expect(pickSurprise(sample, ["L3:hero", "L3:listed"], () => 0)?.id).toBe("L3:hero");
  });

  it("prefers hero pods across the real catalog", () => {
    let seed = 42;
    const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const counts = { hero: 0, other: 0 };
    for (let i = 0; i < 2000; i++) {
      const room = pickSurprise(rooms, [], random)!;
      expect(room.surpriseWeight).toBeGreaterThan(0);
      if (room.tier === "hero") counts.hero++;
      else counts.other++;
    }
    const heroRooms = rooms.filter((r) => r.tier === "hero").length;
    const candidates = rooms.filter((r) => r.surpriseWeight > 0).length;
    expect(counts.hero / 2000).toBeGreaterThan((heroRooms / candidates) * 2);
  });
});
