import { describe, expect, it } from "vitest";
import { getContent } from "@/content/load";
import type { RoomId } from "@/content/schema";
import { directoryStop } from "@/experience/floors/labs/layout";
import { buildHudIndex } from "@/hud/index-data";
import type { PaletteGroup } from "@/hud/palette-types";
import { buildPaletteEntries, fuzzyScore, normalize, scoreEntry, searchPalette } from "@/hud/search";
import { sampleQueries, searchCorpus } from "../helpers/search-corpus";
import * as legacy from "../helpers/search-legacy";

const index = buildHudIndex(getContent());
const entries = buildPaletteEntries(index, ["view-cv", "copy-email", "toggle-language", "quick-view"]);
const group = (groups: PaletteGroup[], id: PaletteGroup["id"]) => groups.find((g) => g.id === id)?.entries ?? [];
const keys = (groups: PaletteGroup[], id: PaletteGroup["id"]) => group(groups, id).map((entry) => entry.key);

describe("buildPaletteEntries", () => {
  it("indexes missions, rooms, years and only the requested actions", () => {
    expect(entries.filter((e) => e.group === "missions").map((e) => e.key)).toEqual(index.missions.map((m) => `mission:${m.id}`));
    expect(entries.filter((e) => e.group === "rooms")).toHaveLength(index.rooms.length);
    expect(entries.filter((e) => e.group === "years")).toHaveLength(index.years.length);
    expect(entries.filter((e) => e.group === "actions" && e.target.type === "action").map((e) => e.key)).toEqual([
      "action:view-cv",
      "action:copy-email",
      "action:toggle-language",
      "action:quick-view",
    ]);
    expect(entries.filter((e) => e.target.type === "tech")).toHaveLength(index.techs.length);
    expect(entries.filter((e) => e.target.type === "topic")).toHaveLength(index.topics.length);
    expect(new Set(entries.map((e) => e.key)).size).toBe(entries.length);
  });

  it("takes the mission floor from its first elevator step", () => {
    expect(entries.find((e) => e.key === "mission:work")?.floor).toBe("L3");
  });

  it("builds year entries on L2 with the year as title", () => {
    const year = entries.find((e) => e.key === "year:2024");
    expect(year).toMatchObject({ group: "years", floor: "L2", title: { en: "2024", id: "2024" } });
    expect(year?.target).toMatchObject({ type: "year", year: 2024 });
  });
});

describe("searchPalette", () => {
  it('finds the highlights mission for "highlights" and the Indonesian "sorotan"', () => {
    expect(keys(searchPalette(entries, "highlights"), "missions")[0]).toBe("mission:highlights");
    expect(keys(searchPalette(entries, "sorotan"), "missions")[0]).toBe("mission:highlights");
    expect(entries.find((e) => e.key === "mission:highlights")?.floor).toBe("L1");
  });

  it('ranks the voice AI pod first for "voice"', () => {
    expect(keys(searchPalette(entries, "voice"), "rooms")[0]).toBe("room:L3:voice-ai-contact-center");
  });

  it('puts the 2024 year first for "2024"', () => {
    expect(keys(searchPalette(entries, "2024"), "years")[0]).toBe("year:2024");
  });

  it('finds View CV for the Indonesian "lihat"', () => {
    const groups = searchPalette(entries, "lihat");
    const found = [...keys(groups, "actions"), ...keys(groups, "missions")];
    expect(found).toContain("action:view-cv");
    expect(found).toContain("mission:cv");
  });

  it('returns rooms using FastAPI for "fastapi", a pod first', () => {
    const groups = searchPalette(entries, "fastapi");
    // Rooms first; the Tech Reactor row ("Show projects using FastAPI") follows under actions.
    expect(groups.map((g) => g.id)).toEqual(["rooms", "actions"]);
    expect(keys(groups, "actions")).toEqual(["tech:fastapi"]);
    const rooms = group(groups, "rooms");
    expect(rooms.length).toBeGreaterThan(0);
    expect(rooms[0].roomKind).toBe("pod");
    for (const room of rooms) expect(room.keywords.some((k) => normalize(k).includes("fastapi"))).toBe(true);
  });

  it("finds the Tech Reactor row first for a show query, in both languages", () => {
    const show = searchPalette(entries, "show projects using azure openai");
    expect(show[0].entries[0].key).toBe("tech:azure-openai");
    expect(show[0].entries[0].title).toEqual({ en: "Show projects using Azure OpenAI", id: "Tampilkan proyek yang memakai Azure OpenAI" });
    expect(searchPalette(entries, "tampilkan proyek next.js")[0].entries[0].key).toBe("tech:next-js");
    expect(searchPalette(entries, "")).not.toContainEqual(expect.objectContaining({ id: "actions" }));
  });

  it("finds the Topic Constellation row first for a writing query, in both languages", () => {
    const show = searchPalette(entries, "show writing about voice ai");
    expect(show[0].entries[0].key).toBe("topic:voice-ai");
    expect(show[0].entries[0].title).toEqual({ en: "Show work about Voice AI", id: "Tampilkan karya tentang Voice AI" });
    expect(show[0].entries[0].floor).toBe("L4");
    expect(searchPalette(entries, "tampilkan tulisan analisis sentimen")[0].entries[0].key).toBe("topic:sentiment-analysis");
    expect(searchPalette(entries, "").flatMap((g) => g.entries).some((e) => e.target.type === "topic")).toBe(false);
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

  it("indexes every L4 reader track with posts as a room (its drawer), found by its title in both languages", () => {
    const library = getContent().floors.library;
    const tracks = library.tracks.filter((t) => library.posts.some((p) => p.track === t.slug));
    expect(tracks.length).toBeGreaterThan(0);
    for (const t of tracks) {
      const room = index.rooms.find((r) => r.id === `L4:track:${t.slug}`)!;
      expect(room).toMatchObject({ floor: "L4", kind: "shelf", title: t.title, surpriseWeight: 0 });
      expect(room.path).toContain("#");
      for (const title of [t.title.en, t.title.id]) expect(keys(searchPalette(entries, title), "rooms"), title).toContain(`room:L4:track:${t.slug}`);
    }
    expect(index.rooms.filter((r) => r.id.startsWith("L4:track:"))).toHaveLength(tracks.length);
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

describe("wing rows (Data and ML, owner request 2026-10-14)", () => {
  it("indexes one row per wing with pods, the data wing with its board stop at the fork", () => {
    expect(index.wings.map((w) => w.wing)).toEqual(["software", "ai", "data"]);
    expect(entries.filter((e) => e.target.type === "wing").map((e) => e.key)).toEqual(["wing:software", "wing:ai", "wing:data"]);
    const data = index.wings.find((w) => w.wing === "data")!;
    expect(data.title).toEqual({ en: "Data and ML projects", id: "Proyek Data dan ML" });
    // The Data and ML board stands in the middle of the wall at the fork, over the spine (Round 7 G).
    expect(data.stop).toEqual(directoryStop("data"));
  });

  it('finds "Data and ML projects" for data, ML and machine learning queries in both languages', () => {
    for (const q of ["data and ml", "machine learning", "proyek data", "ml projects"]) {
      expect(searchPalette(entries, q).flatMap((g) => g.entries.map((e) => e.key)), q).toContain("wing:data");
    }
    expect(searchPalette(entries, "")).not.toContainEqual(expect.objectContaining({ id: "actions" }));
  });
});

describe("palette search returns what the pre-round-5 implementation returned (seeded sample)", () => {
  // 150 queries of the equivalence corpus, the same on every run; `bun run bench tests/bench/search.bench.ts` checks all of it.
  const queries = sampleQueries(searchCorpus(entries), 150);

  it(`for ${queries.length} queries with Ask enabled`, () => {
    expect(queries).toHaveLength(150);
    for (const q of queries) expect(searchPalette(entries, q, { ask: true }), q).toEqual(legacy.searchPalette(entries, q, { ask: true }));
  });

  it("with the pods and posts filters and recent rooms", () => {
    const recent = entries.filter((e) => e.target.type === "room").slice(0, 4).map((e) => (e.target as { id: RoomId }).id);
    for (const q of queries) {
      for (const filter of ["pods", "posts", null] as const) {
        expect(searchPalette(entries, q, { filter, recent }), `${filter} ${q}`).toEqual(legacy.searchPalette(entries, q, { filter, recent }));
      }
    }
  });

  it("scores single texts the same", () => {
    const texts = entries.flatMap((e) => [e.title.en, e.title.id, ...e.keywords]).slice(0, 80);
    for (const q of queries) for (const t of texts) expect(fuzzyScore(q, t), `${q} / ${t}`).toBe(legacy.fuzzyScore(q, t));
  });
});
