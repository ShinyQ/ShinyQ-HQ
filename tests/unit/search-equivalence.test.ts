import { describe, expect, it } from "vitest";
import { getContent } from "@/content/load";
import type { RoomId } from "@/content/schema";
import { buildHudIndex } from "@/hud/index-data";
import { buildPaletteEntries, fuzzyScore, searchPalette } from "@/hud/search";
import * as legacy from "../helpers/search-legacy";

const index = buildHudIndex(getContent());
const entries = buildPaletteEntries(index, ["view-cv", "copy-email", "toggle-language", "quick-view"]);

/** Every word of every entry, prefixes, a dropped-letter typo, word pairs, diacritics and questions. */
function corpus(): string[] {
  const words = new Set<string>();
  for (const e of entries) {
    for (const text of [e.title.en, e.title.id, ...e.keywords, e.subtitle?.en ?? "", e.subtitle?.id ?? ""]) for (const w of text.split(/\s+/)) if (w) words.add(w);
  }
  const list = [...words].sort();
  const queries = ["", "   ", "voice ai contact center", "sorotan utama", "kontak", "Caf\u00e9 ", "what did you build?", "siapa kamu", "copy email", "2021", "zz", "qxj", "a", "ai ml", "rag llm azure", "View CV!"];
  list.forEach((w, i) => {
    if (i % 3 === 0) queries.push(w, w.slice(0, 2), w.slice(0, 4), w.toUpperCase());
    if (i % 5 === 0 && w.length > 3) queries.push(w.slice(0, 1) + w.slice(2));
    if (i % 7 === 0) queries.push(`${w} ${list[(i * 13) % list.length]}`);
  });
  return queries;
}

describe("palette search returns exactly what the pre-round-5 implementation returned", () => {
  const queries = corpus();

  it(`for ${queries.length} queries with Ask enabled`, () => {
    for (const q of queries) expect(searchPalette(entries, q, { ask: true }), q).toEqual(legacy.searchPalette(entries, q, { ask: true }));
  }, 120_000);

  it("with the pods and posts filters and recent rooms", () => {
    const recent = entries.filter((e) => e.target.type === "room").slice(0, 4).map((e) => (e.target as { id: RoomId }).id);
    for (const q of queries.slice(0, 300)) {
      for (const filter of ["pods", "posts", null] as const) {
        expect(searchPalette(entries, q, { filter, recent }), `${filter} ${q}`).toEqual(legacy.searchPalette(entries, q, { filter, recent }));
      }
    }
  }, 120_000);

  it("scores single texts the same", () => {
    const texts = entries.flatMap((e) => [e.title.en, e.title.id, ...e.keywords]).slice(0, 80);
    for (const q of queries.slice(0, 200)) for (const t of texts) expect(fuzzyScore(q, t), `${q} / ${t}`).toBe(legacy.fuzzyScore(q, t));
  }, 120_000);
});
