import { describe, expect, it } from "vitest";
import { getContent } from "@/content/load";
import type { RoomId } from "@/content/schema";
import { buildHudIndex } from "@/hud/index-data";
import type { PaletteGroup } from "@/hud/palette-types";
import { buildPaletteEntries, fuzzyScore, normalize, scoreEntry, searchPalette } from "@/hud/search";

const index = buildHudIndex(getContent());
const entries = buildPaletteEntries(index, ["download-cv", "copy-email", "toggle-language", "quick-view"]);
const group = (groups: PaletteGroup[], id: PaletteGroup["id"]) => groups.find((g) => g.id === id)?.entries ?? [];
const keys = (groups: PaletteGroup[], id: PaletteGroup["id"]) => group(groups, id).map((entry) => entry.key);

describe("buildPaletteEntries", () => {
  it("indexes missions, rooms, years and only the requested actions", () => {
    expect(entries.filter((e) => e.group === "missions").map((e) => e.key)).toEqual(index.missions.map((m) => `mission:${m.id}`));
    expect(entries.filter((e) => e.group === "rooms")).toHaveLength(index.rooms.length);
    expect(entries.filter((e) => e.group === "years")).toHaveLength(index.years.length);
    expect(entries.filter((e) => e.group === "actions").map((e) => e.key)).toEqual([
      "action:download-cv",
      "action:copy-email",
      "action:toggle-language",
      "action:quick-view",
    ]);
    expect(new Set(entries.map((e) => e.key)).size).toBe(entries.length);
  });

  it("takes the mission floor from its first elevator step", () => {
    expect(entries.find((e) => e.key === "mission:best-ai")?.floor).toBe("L3");
    expect(entries.find((e) => e.key === "mission:surprise")?.floor).toBeUndefined();
  });

  it("builds year entries on L2 with the year as title", () => {
    const year = entries.find((e) => e.key === "year:2024");
    expect(year).toMatchObject({ group: "years", floor: "L2", title: { en: "2024", id: "2024" } });
    expect(year?.target).toMatchObject({ type: "year", year: 2024 });
  });
});

describe("searchPalette", () => {
  it('ranks the voice AI pod first for "voice"', () => {
    expect(keys(searchPalette(entries, "voice"), "rooms")[0]).toBe("room:L3:voice-ai-contact-center");
  });

  it('puts the 2024 year first for "2024"', () => {
    expect(keys(searchPalette(entries, "2024"), "years")[0]).toBe("year:2024");
  });

  it('finds Download CV for the Indonesian "unduh"', () => {
    const groups = searchPalette(entries, "unduh");
    const found = [...keys(groups, "actions"), ...keys(groups, "missions")];
    expect(found).toContain("action:download-cv");
    expect(found).toContain("mission:cv");
  });

  it('returns rooms using FastAPI for "fastapi", a pod first', () => {
    const groups = searchPalette(entries, "fastapi");
    expect(groups.map((g) => g.id)).toEqual(["rooms"]);
    const rooms = group(groups, "rooms");
    expect(rooms.length).toBeGreaterThan(0);
    expect(rooms[0].roomKind).toBe("pod");
    for (const room of rooms) expect(room.keywords.some((k) => normalize(k).includes("fastapi"))).toBe(true);
  });

  it('tolerates a subsequence typo: "vcai" finds the voice pod', () => {
    expect(keys(searchPalette(entries, "vcai"), "rooms")[0]).toBe("room:L3:voice-ai-contact-center");
  });

  it("requires every token to match (AND)", () => {
    const rooms = keys(searchPalette(entries, "azure voice"), "rooms");
    expect(rooms[0]).toBe("room:L3:voice-ai-contact-center");
    expect(searchPalette(entries, "voice zzzqqq")).toEqual([]);
  });

  it("shows missions then up to 3 recent rooms for an empty query", () => {
    expect(searchPalette(entries, "").map((g) => g.id)).toEqual(["missions"]);
    expect(keys(searchPalette(entries, "  "), "missions")).toHaveLength(index.missions.length);
    const recent: RoomId[] = ["RF:contact", "L9:nope" as RoomId, "L3:voice-ai-contact-center", "L1:profile", "L2:jenius-2024"];
    const groups = searchPalette(entries, "", { recent });
    expect(groups.map((g) => g.id)).toEqual(["missions", "recent"]);
    expect(keys(groups, "recent")).toEqual(["room:RF:contact", "room:L3:voice-ai-contact-center", "room:L1:profile"]);
  });

  it('keeps only pods with the "pods" filter, even for an empty query', () => {
    const pods = index.rooms.filter((r) => r.kind === "pod");
    const empty = searchPalette(entries, "", { filter: "pods", recent: ["RF:contact"] });
    expect(empty.map((g) => g.id)).toEqual(["rooms"]);
    expect(group(empty, "rooms")).toHaveLength(pods.length);
    expect(group(empty, "rooms").every((e) => e.roomKind === "pod")).toBe(true);
    const typed = searchPalette(entries, "azure", { filter: "pods" });
    expect(typed.map((g) => g.id)).toEqual(["rooms"]);
    expect(group(typed, "rooms").every((e) => e.roomKind === "pod")).toBe(true);
  });

  it('keeps only posts with the "posts" filter and all rooms with "rooms"', () => {
    const posts = group(searchPalette(entries, "", { filter: "posts" }), "rooms");
    expect(posts.length).toBe(index.rooms.filter((r) => r.kind === "post").length);
    expect(posts.every((e) => e.roomKind === "post")).toBe(true);
    expect(group(searchPalette(entries, "", { filter: "rooms" }), "rooms")).toHaveLength(index.rooms.length);
    expect(searchPalette(entries, "cv", { filter: "rooms" }).map((g) => g.id)).toEqual(["rooms"]);
  });

  it("limits results per group", () => {
    expect(group(searchPalette(entries, "a"), "rooms")).toHaveLength(8);
    expect(group(searchPalette(entries, "a", { limitPerGroup: 3 }), "rooms")).toHaveLength(3);
  });

  it("puts the group with the best match first so Enter runs it", () => {
    const groups = searchPalette(entries, "copy email");
    expect(groups[0].id).toBe("actions");
    expect(groups[0].entries[0].key).toBe("action:copy-email");
  });

  it("keeps the fixed group order when best scores tie", () => {
    const tied = [
      { ...entries.find((e) => e.group === "actions")!, key: "a", title: { en: "zeta", id: "zeta" }, keywords: [] },
      { ...entries.find((e) => e.group === "missions")!, key: "m", title: { en: "zeta", id: "zeta" }, keywords: [] },
    ];
    expect(searchPalette(tied, "zeta").map((g) => g.id)).toEqual(["missions", "actions"]);
  });
});

describe("normalize and fuzzyScore", () => {
  it("normalizes case, diacritics and whitespace", () => {
    expect(normalize("  Café   Déjà\tVu ")).toBe("cafe deja vu");
    expect(fuzzyScore("cafe", "Café")).toBe(fuzzyScore("cafe", "cafe"));
  });

  it("orders exact > prefix > word start > substring > subsequence > none", () => {
    const exact = fuzzyScore("voice", "Voice");
    const prefix = fuzzyScore("voice", "Voice AI");
    const wordStart = fuzzyScore("voice", "Realtime Voice AI");
    const substring = fuzzyScore("voice", "invoices");
    const subsequence = fuzzyScore("voice", "vo ice");
    expect(exact).toBeGreaterThan(prefix);
    expect(prefix).toBeGreaterThan(wordStart);
    expect(wordStart).toBeGreaterThan(substring);
    expect(substring).toBeGreaterThan(subsequence);
    expect(subsequence).toBeGreaterThan(0);
    expect(fuzzyScore("voice", "audio")).toBe(0);
    expect(fuzzyScore("", "audio")).toBe(0);
  });

  it("is deterministic and prefers tight, word-start subsequences", () => {
    expect(fuzzyScore("vcai", "voice contact ai")).toBe(fuzzyScore("vcai", "voice contact ai"));
    expect(fuzzyScore("vca", "voice contact ai")).toBeGreaterThan(fuzzyScore("vca", "xvxxxxxxxcxxxxxxxxxa"));
  });

  it("scores an entry only when every token matches", () => {
    const voice = entries.find((e) => e.key === "room:L3:voice-ai-contact-center")!;
    expect(scoreEntry(voice, ["voice"])).toBeGreaterThan(0);
    expect(scoreEntry(voice, ["voice", "qqqzzz"])).toBe(0);
  });
});
