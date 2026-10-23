import { describe, expect, test } from "vitest";
import { getContent } from "@/content/load";
import type { RoomId } from "@/content/schema";
import { buildHudIndex } from "@/hud/index-data";
import { buildPaletteEntries, fuzzyScore, searchPalette } from "@/hud/search";
import { searchCorpus } from "../helpers/search-corpus";
import * as legacy from "../helpers/search-legacy";

/** Perf report SP11: one search per keystroke while typing a three-word query. Pass: current at most 4 ms per key (16 ms at 4x CPU). */
const entries = buildPaletteEntries(buildHudIndex(getContent()), ["view-cv", "copy-email", "toggle-language", "quick-view"]);
const typed = "voice ai contact center";
const keys = Array.from({ length: typed.length }, (_, i) => typed.slice(0, i + 1));

test(`palette: typing "${typed}" (${keys.length} searches per iteration)`, async ({ bench }) => {
  await bench.compare(
    bench("current", () => {
      for (const q of keys) searchPalette(entries, q, { ask: true });
    }),
    bench("legacy", () => {
      for (const q of keys) legacy.searchPalette(entries, q, { ask: true });
    }),
  );
}, 60_000);

/**
 * The full equivalence oracle (about 3,000 queries, 10 to 20 s): the palette search returns exactly what the frozen
 * pre-round-5 implementation returned. `tests/unit/search.test.ts` runs a seeded 150-query sample of the same corpus on
 * every run; run this after a change to `src/hud/search.ts`.
 */
describe("palette search returns exactly what the pre-round-5 implementation returned (full corpus)", () => {
  const queries = searchCorpus(entries);

  test(`for ${queries.length} queries with Ask enabled`, () => {
    for (const q of queries) expect(searchPalette(entries, q, { ask: true }), q).toEqual(legacy.searchPalette(entries, q, { ask: true }));
  }, 120_000);

  test("with the pods and posts filters and recent rooms", () => {
    const recent = entries.filter((e) => e.target.type === "room").slice(0, 4).map((e) => (e.target as { id: RoomId }).id);
    for (const q of queries.slice(0, 300)) {
      for (const filter of ["pods", "posts", null] as const) {
        expect(searchPalette(entries, q, { filter, recent }), `${filter} ${q}`).toEqual(legacy.searchPalette(entries, q, { filter, recent }));
      }
    }
  }, 120_000);

  test("scores single texts the same", () => {
    const texts = entries.flatMap((e) => [e.title.en, e.title.id, ...e.keywords]).slice(0, 80);
    for (const q of queries.slice(0, 200)) for (const t of texts) expect(fuzzyScore(q, t), `${q} / ${t}`).toBe(legacy.fuzzyScore(q, t));
  }, 120_000);
});
