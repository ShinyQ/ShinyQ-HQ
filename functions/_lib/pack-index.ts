import { expandTokens, tokenize } from "./text";
import type { KnowledgePack } from "./types";

/**
 * BM25 statistics and the word vocabulary of a pack. Built once per isolate at module load
 * (functions/api/ask.ts), so the pack ships as plain text and stays under the 200 KB cap.
 */
export interface PackIndex {
  tf: Record<string, number>[];
  len: number[];
  df: Record<string, number>;
  avgLen: number;
  /** Lowercase words of every chunk and entity (entity check, T3). */
  vocabulary: ReadonlySet<string>;
}

const cache = new WeakMap<KnowledgePack, PackIndex>();

export function indexPack(pack: KnowledgePack): PackIndex {
  const hit = cache.get(pack);
  if (hit) return hit;
  const tf: Record<string, number>[] = [];
  const len: number[] = [];
  const df: Record<string, number> = {};
  const vocabulary = new Set<string>();
  for (const chunk of pack.chunks) {
    const tokens = expandTokens([...tokenize(chunk.title), ...tokenize(chunk.keywords.join(" ")), ...tokenize(chunk.text_en), ...tokenize(chunk.text_id)]);
    const counts: Record<string, number> = {};
    for (const token of tokens) counts[token] = (counts[token] ?? 0) + 1;
    for (const token of Object.keys(counts)) df[token] = (df[token] ?? 0) + 1;
    tf.push(counts);
    len.push(tokens.length);
    for (const text of [chunk.title, chunk.text_en, chunk.text_id, chunk.keywords.join(" ")]) {
      for (const word of text.toLowerCase().normalize("NFKC").match(/[\p{L}\p{N}]+/gu) ?? []) vocabulary.add(word);
    }
  }
  for (const entity of pack.entities) for (const word of entity.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []) vocabulary.add(word);
  const index: PackIndex = { tf, len, df, avgLen: len.reduce((a, b) => a + b, 0) / Math.max(1, len.length), vocabulary };
  cache.set(pack, index);
  return index;
}
