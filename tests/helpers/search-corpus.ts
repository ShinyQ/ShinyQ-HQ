import type { PaletteEntry } from "@/hud/palette-types";

/**
 * The palette search equivalence corpus (against the frozen pre-round-5 search, `search-legacy.ts`): every word of
 * every entry, prefixes, a dropped-letter typo, word pairs, diacritics and questions. `tests/bench/search.bench.ts`
 * checks all of it; `tests/unit/search.test.ts` checks a seeded sample (`sampleQueries`) on every run.
 */
export function searchCorpus(entries: readonly PaletteEntry[]): string[] {
  const words = new Set<string>();
  for (const e of entries) {
    for (const text of [e.title.en, e.title.id, ...e.keywords, e.subtitle?.en ?? "", e.subtitle?.id ?? ""]) for (const w of text.split(/\s+/)) if (w) words.add(w);
  }
  const list = [...words].sort();
  const queries = [...FIXED_QUERIES];
  list.forEach((w, i) => {
    if (i % 3 === 0) queries.push(w, w.slice(0, 2), w.slice(0, 4), w.toUpperCase());
    if (i % 5 === 0 && w.length > 3) queries.push(w.slice(0, 1) + w.slice(2));
    if (i % 7 === 0) queries.push(`${w} ${list[(i * 13) % list.length]}`);
  });
  return queries;
}

/** Hand-picked queries: blanks, phrases in both languages, diacritics, a question, digits, no-match and one-letter queries. */
export const FIXED_QUERIES: readonly string[] = ["", "   ", "voice ai contact center", "sorotan utama", "kontak", "Caf\u00e9 ", "what did you build?", "siapa kamu", "copy email", "2021", "zz", "qxj", "a", "ai ml", "rag llm azure", "View CV!"];

/** A deterministic PRNG (mulberry32), so a sample is the same on every run. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** `size` queries of `corpus`: every hand-picked query, then a seeded draw of the generated ones without repeats. */
export function sampleQueries(corpus: readonly string[], size: number, seed = 20261023): string[] {
  const out = [...new Set(FIXED_QUERIES)];
  const rest = [...new Set(corpus.filter((q) => !FIXED_QUERIES.includes(q)))];
  const random = mulberry32(seed);
  while (out.length < size && rest.length > 0) out.push(rest.splice(Math.floor(random() * rest.length), 1)[0]);
  return out;
}
