import { expandTokens, tokenize } from "./text";
import type { KnowledgePack, StoredPack } from "./types";
import { hydrateVectors } from "./vectors";

/** Shape version of a stored pack (`pack:v1:<packVersion>` in KV): bumped when `StoredPack` changes. */
export const PACK_SCHEMA = 1;

/**
 * BM25 statistics and the word vocabulary of a pack. The build precomputes them (`storePack`), so an
 * isolate only hydrates the term map (`hydratePack`) instead of tokenizing every chunk; postings are
 * expanded per term on first use.
 */
export interface PackIndex {
  /** Tokens per chunk. */
  len: number[];
  /** Chunks that hold each term. */
  df: ReadonlyMap<string, number>;
  avgLen: number;
  /** Lowercase words of every chunk and entity (entity check, T3). */
  vocabulary: ReadonlySet<string>;
  /** Chunk index to term frequency for one term (empty when the term is not in the pack). */
  postingsOf(term: string): ReadonlyMap<number, number>;
  /** Frequency of a term in one chunk (0 when absent). */
  tfOf(chunk: number, term: string): number;
}

const cache = new WeakMap<KnowledgePack, PackIndex>();
const EMPTY: ReadonlyMap<number, number> = new Map();

/** Tokens a chunk is scored on (title, keywords, both languages). */
function chunkTokens(chunk: KnowledgePack["chunks"][number]): string[] {
  return expandTokens([...tokenize(chunk.title), ...tokenize(chunk.keywords.join(" ")), ...tokenize(chunk.text_en), ...tokenize(chunk.text_id)]);
}

const words = (text: string) => text.toLowerCase().normalize("NFKC").match(/[\p{L}\p{N}]+/gu) ?? [];

/** Builds the stored form of a pack: its text plus the BM25 postings and the vocabulary (build time). */
export function storePack(pack: KnowledgePack, vectors?: StoredPack["vectors"]): StoredPack {
  const byTerm = new Map<string, number[]>();
  const len: number[] = [];
  const vocabulary = new Set<string>();
  pack.chunks.forEach((chunk, i) => {
    const tokens = chunkTokens(chunk);
    const counts = new Map<string, number>();
    for (const token of tokens) counts.set(token, (counts.get(token) ?? 0) + 1);
    for (const [term, tf] of counts) {
      let list = byTerm.get(term);
      if (!list) byTerm.set(term, (list = []));
      list.push(i, tf);
    }
    len.push(tokens.length);
    for (const text of [chunk.title, chunk.text_en, chunk.text_id, chunk.keywords.join(" ")]) for (const word of words(text)) vocabulary.add(word);
  });
  for (const entity of pack.entities) for (const word of entity.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []) vocabulary.add(word);
  const terms = [...byTerm.keys()].sort();
  return { schema: PACK_SCHEMA, pack, index: { terms, postings: terms.map((t) => byTerm.get(t) as number[]), len, vocabulary: [...vocabulary].sort().join(" ") }, ...(vectors ? { vectors } : {}) };
}

/** Turns a stored pack into its `PackIndex` without tokenizing, and registers it so `indexPack(pack)` returns it. */
export function hydratePack(stored: StoredPack): { pack: KnowledgePack; index: PackIndex } {
  const { pack, index: raw } = stored;
  // The vectors (if any) are decoded once and registered for `packVectors(pack)`; bad vectors leave BM25 alone.
  if (stored.vectors) hydrateVectors(stored);
  const hit = cache.get(pack);
  if (hit) return { pack, index: hit };
  const termAt = new Map<string, number>();
  const df = new Map<string, number>();
  raw.terms.forEach((term, t) => {
    termAt.set(term, t);
    df.set(term, raw.postings[t].length / 2);
  });
  const expanded = new Map<string, ReadonlyMap<number, number>>();
  const postingsOf = (term: string): ReadonlyMap<number, number> => {
    const done = expanded.get(term);
    if (done) return done;
    const t = termAt.get(term);
    if (t === undefined) return EMPTY;
    const list = raw.postings[t];
    const map = new Map<number, number>();
    for (let j = 0; j < list.length; j += 2) map.set(list[j], list[j + 1]);
    expanded.set(term, map);
    return map;
  };
  const index: PackIndex = {
    len: raw.len,
    df,
    avgLen: raw.len.reduce((a, b) => a + b, 0) / Math.max(1, raw.len.length),
    vocabulary: new Set(raw.vocabulary ? raw.vocabulary.split(" ") : []),
    postingsOf,
    tfOf: (chunk, term) => postingsOf(term).get(chunk) ?? 0,
  };
  cache.set(pack, index);
  return { pack, index };
}

/** The index of a pack: the hydrated one when the pack came from `hydratePack`, else built from its text once. */
export function indexPack(pack: KnowledgePack): PackIndex {
  return cache.get(pack) ?? hydratePack(storePack(pack)).index;
}
