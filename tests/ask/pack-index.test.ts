import { beforeAll, describe, expect, it } from "vitest";
import { buildRepoPack } from "@/ask/repo-pack";
import { SUGGESTIONS } from "@/ask/suggestions";
import { hydratePack, indexPack, PACK_SCHEMA, storePack, type PackIndex } from "../../functions/_lib/pack-index";
import { leadMatches, retrieve, scoreChunks } from "../../functions/_lib/retrieve";
import { expandTokens, tokenize } from "../../functions/_lib/text";
import type { KnowledgePack, StoredPack } from "../../functions/_lib/types";
import golden from "./golden.json";

/** The pre-KV index, built per chunk from text (reference for the hydrated postings). */
function referenceIndex(pack: KnowledgePack) {
  const tf: Map<string, number>[] = [];
  const len: number[] = [];
  const df = new Map<string, number>();
  for (const chunk of pack.chunks) {
    const tokens = expandTokens([...tokenize(chunk.title), ...tokenize(chunk.keywords.join(" ")), ...tokenize(chunk.text_en), ...tokenize(chunk.text_id)]);
    const counts = new Map<string, number>();
    for (const t of tokens) counts.set(t, (counts.get(t) ?? 0) + 1);
    for (const t of counts.keys()) df.set(t, (df.get(t) ?? 0) + 1);
    tf.push(counts);
    len.push(tokens.length);
  }
  return { tf, len, df, avgLen: len.reduce((a, b) => a + b, 0) / len.length };
}

/** Pure BM25 per chunk, as `scoreChunks` computed it before the postings (K1 1.2, B 0.75). */
function referenceBm25(pack: KnowledgePack, question: string): number[] {
  const ref = referenceIndex(pack);
  const terms = [...new Set(expandTokens(tokenize(question)))];
  const n = pack.chunks.length;
  return pack.chunks.map((_, i) => {
    let score = 0;
    for (const term of terms) {
      const df = ref.df.get(term);
      const tf = ref.tf[i].get(term);
      if (!df || !tf) continue;
      const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
      score += (idf * tf * 2.2) / (tf + 1.2 * (1 - 0.75 + (0.75 * ref.len[i]) / ref.avgLen));
    }
    return score;
  });
}

let pack: KnowledgePack;
let stored: StoredPack;
let hydrated: { pack: KnowledgePack; index: PackIndex };

const questions = [...(golden.items as { q: string }[]).map((i) => i.q), ...SUGGESTIONS.flatMap((s) => [s.q.en, s.q.id])];

beforeAll(() => {
  const built = buildRepoPack("2026-10-11");
  pack = built.pack;
  stored = storePack(pack);
  hydrated = hydratePack(JSON.parse(JSON.stringify(stored)) as StoredPack);
});

describe("stored pack index", () => {
  it("stores the schema, sorted terms and one length per chunk", () => {
    expect(stored.schema).toBe(PACK_SCHEMA);
    expect(stored.index.len).toHaveLength(pack.chunks.length);
    expect(stored.index.terms).toHaveLength(stored.index.postings.length);
    expect([...stored.index.terms].sort()).toEqual(stored.index.terms);
    for (const list of stored.index.postings) expect(list.length % 2).toBe(0);
  });

  it("hydrates to the same statistics as the index built from text", () => {
    const ref = referenceIndex(pack);
    const built = indexPack(pack);
    for (const index of [built, hydrated.index]) {
      expect(index.len).toEqual(ref.len);
      expect(index.avgLen).toBe(ref.avgLen);
      expect(new Map(index.df)).toEqual(ref.df);
    }
    expect(hydrated.index.vocabulary).toEqual(built.vocabulary);
    expect(hydrated.index.vocabulary.has("metrodata")).toBe(true);
    pack.chunks.forEach((_, i) => {
      for (const [term, tf] of ref.tf[i]) expect(hydrated.index.tfOf(i, term)).toBe(tf);
    });
    expect(hydrated.index.tfOf(0, "zzz-not-a-term")).toBe(0);
  });

  it("registers the hydrated index, so indexPack never rebuilds it", () => {
    expect(indexPack(hydrated.pack)).toBe(hydrated.index);
  });

  it("scores and retrieves the same chunks for every golden and curated question", () => {
    expect(questions.length).toBeGreaterThan(50);
    for (const q of questions) {
      const ref = referenceBm25(pack, q);
      const fromText = scoreChunks(pack, q).map((r) => r.score);
      const fromStore = scoreChunks(hydrated.pack, q).map((r) => r.score);
      expect(fromStore, q).toEqual(fromText);
      fromText.forEach((score, i) => expect(score, `${q} ${pack.chunks[i].id}`).toBeGreaterThanOrEqual(ref[i]));
      for (const locale of ["en", "id"] as const) expect(retrieve(hydrated.pack, q, locale).chunks.map((c) => c.id), q).toEqual(retrieve(pack, q, locale).chunks.map((c) => c.id));
      expect(leadMatches(hydrated.pack, q).map((c) => c.id), q).toEqual(leadMatches(pack, q).map((c) => c.id));
    }
  });

  it("matches the reference BM25 exactly when no boost applies", () => {
    // No intent or title boost applies to a "repo" chunk with a neutral id.
    const boostless = { ...pack, chunks: pack.chunks.map((c, i) => ({ ...c, id: `x${i}`, type: "repo" as const })) };
    for (const q of questions) {
      const ref = referenceBm25(boostless, q);
      expect(scoreChunks(boostless, q).map((r) => r.score), q).toEqual(ref);
    }
  });
});
