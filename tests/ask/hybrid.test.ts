import { beforeAll, describe, expect, it } from "vitest";
import { buildPackArtifacts, PACK_VALUE_MAX_BYTES, validateStoredPack } from "@/ask/pack";
import { buildRepoPack } from "@/ask/repo-pack";
import { buildStoredVectors, embedKey, embedText, readEmbeddingCache, readExemplars, wantedTexts } from "@/ask/embeddings";
import type { ModelClient } from "../../functions/_lib/model";
import { hydratePack, storePack } from "../../functions/_lib/pack-index";
import { assistRoute, packVocabulary, planRoute, runPipeline } from "../../functions/_lib/pipeline";
import { cleanQuery, retrieve, scoreChunks } from "../../functions/_lib/retrieve";
import type { KnowledgePack } from "../../functions/_lib/types";
import { bindingEmbedder, cosines, decodeRows, EMBED_DIMS, EMBED_MODEL, encodeRows, extractEmbedding, hydrateVectors, packVectors, quantize, routerSignals, type StoredVectors } from "../../functions/_lib/vectors";
import fixture from "./fixtures/question-vectors.json";

/**
 * Hybrid retrieval (owner decision 2026-10-24): BM25 fused with bge-m3 cosine ranks, the semantic router assist and
 * the BM25 fallback. Question vectors come from a recorded fixture, so no test calls Workers AI.
 */
let pack: KnowledgePack;
let vectors: StoredVectors;

const q = (text: keyof typeof fixture.vectors) => {
  const rows = decodeRows(fixture.vectors[text]);
  return Float32Array.from(rows);
};
const ids = (question: string, semantic?: Float32Array) => retrieve(pack, question, "en", { semantic }).chunks.map((c) => c.id);

beforeAll(() => {
  ({ pack } = buildRepoPack("2026-10-11"));
  const built = buildStoredVectors(pack, readEmbeddingCache(), readExemplars());
  vectors = built.vectors as StoredVectors;
  hydrateVectors({ pack, vectors });
});

describe("vectors", () => {
  it("quantizes to int8 and round-trips through base64", () => {
    const v = Array.from({ length: EMBED_DIMS }, (_, i) => Math.sin(i) / 10);
    const rows = quantize(v);
    expect(Math.max(...rows.map(Math.abs))).toBe(127);
    expect(decodeRows(encodeRows(rows))).toEqual(rows);
    const self = cosines(Float32Array.from(v), rows, Float32Array.of(Math.hypot(...rows)), EMBED_DIMS)[0];
    expect(self).toBeGreaterThan(0.999);
  });

  it("reads the Workers AI response shape and rejects anything else", () => {
    const data = [Array.from({ length: EMBED_DIMS }, () => 0.01)];
    expect(extractEmbedding({ shape: [1, EMBED_DIMS], data })?.length).toBe(EMBED_DIMS);
    expect(extractEmbedding({ result: { data } })?.length).toBe(EMBED_DIMS);
    for (const bad of [null, {}, { data: [[1, 2]] }, { data: [Array(EMBED_DIMS).fill("x")] }]) expect(extractEmbedding(bad)).toBeNull();
  });

  it("ignores vectors of another model, another size or a malformed value: retrieval stays BM25", () => {
    for (const bad of [{ ...vectors, model: "@cf/other" }, { ...vectors, chunks: encodeRows(new Int8Array(EMBED_DIMS)) }, { ...vectors, chunks: "%%%" }]) {
      const copy = { ...pack };
      expect(hydrateVectors({ pack: copy, vectors: bad })).toBeNull();
      expect(scoreChunks(copy, "What motivates him?", q("What motivates him?"))).toEqual(scoreChunks(copy, "What motivates him?"));
    }
  });

  it("falls back to null on an error or a slow call", async () => {
    const ok = bindingEmbedder({ run: async () => ({ shape: [1, EMBED_DIMS], data: [Array(EMBED_DIMS).fill(0.1)] }) });
    expect((await ok("hi"))?.length).toBe(EMBED_DIMS);
    expect(await bindingEmbedder({ run: async () => Promise.reject(new Error("3036 quota")) })("hi")).toBeNull();
    expect(await bindingEmbedder({ run: () => new Promise((r) => setTimeout(() => r({ data: [Array(EMBED_DIMS).fill(0.1)] }), 200)) }, 20)("hi")).toBeNull();
    expect(await bindingEmbedder({ run: async () => ({ response: "text" }) })("hi")).toBeNull();
  });
});

describe("embedding cache", () => {
  it("covers the pack and every router exemplar (run bun scripts/ask-embed.ts --cli after a content change)", () => {
    const cache = readEmbeddingCache();
    expect(cache.model).toBe(EMBED_MODEL);
    const exemplars = readExemplars();
    for (const list of Object.values(exemplars)) for (const text of list) expect(cache.vectors[embedKey(text)], text).toBeDefined();
    // The weekly live-facts refresh changes one chunk's text; the deploy re-embeds it, so a few misses are tolerated here.
    const { missing } = buildStoredVectors(pack, cache, exemplars);
    expect(missing.length / pack.chunks.length).toBeLessThan(0.1);
    // Nothing stale: every cached vector belongs to a chunk or an exemplar.
    const wanted = wantedTexts(pack, exemplars);
    expect(Object.keys(cache.vectors).filter((k) => !wanted.has(k)).length).toBeLessThanOrEqual(Math.ceil(pack.chunks.length * 0.1));
    expect(embedText({ title: "T", text_en: "x".repeat(5000) }).length).toBe(4000);
  });

  it("stores the vectors in the KV value under the 768 KiB cap and checks they match the pack", () => {
    const artifacts = buildPackArtifacts(pack, vectors);
    expect(artifacts.errors).toEqual([]);
    expect(artifacts.meta.bytes).toBeLessThan(PACK_VALUE_MAX_BYTES);
    const stored = JSON.parse(artifacts.json);
    expect(stored.vectors.model).toBe(EMBED_MODEL);
    expect(validateStoredPack(JSON.stringify({ ...stored, vectors: { ...stored.vectors, chunks: encodeRows(new Int8Array(EMBED_DIMS)) } }))).toContain("vectors do not match the pack (model, dimensions or one row per chunk)");
    // The isolate decodes them once with the pack.
    const fresh = hydratePack(storePack(structuredClone(pack), vectors)).pack;
    expect(packVectors(fresh)?.rows.length).toBe(pack.chunks.length * EMBED_DIMS);
  });
});

describe("hybrid retrieval", () => {
  it("folds question templates so the topic words decide", () => {
    expect(cleanQuery("What does he think about vibe coding?").trim()).toBe("view  vibe coding?");
    expect(cleanQuery("Apa pendapatnya soal AI?")).toContain("view");
  });

  it("finds his written views that share no word with the question, in English and Indonesian", () => {
    expect(ids("What motivates him?")).not.toContain("perspective-growth-focus");
    expect(ids("What motivates him?", q("What motivates him?"))).toContain("perspective-growth-focus");
    expect(ids("Apa yang memotivasi dia?", q("Apa yang memotivasi dia?"))).toContain("perspective-growth-focus");
    expect(ids("What is he proud of?", q("What is he proud of?"))).toContain("perspective-self-description");
    // Ranked near the top; long case studies on AI risk can fill the 6,000-character context before it.
    const fused = scoreChunks(pack, "Is AI dangerous?", q("Is AI dangerous?")).sort((a, b) => b.score - a.score).slice(0, 5).map((r) => r.chunk.id);
    expect(fused).toContain("perspective-where-not-ai");
    expect(scoreChunks(pack, "Is AI dangerous?").sort((a, b) => b.score - a.score).slice(0, 5).map((r) => r.chunk.id)).not.toContain("perspective-where-not-ai");
  });

  it("keeps the BM25 matches of a question BM25 already answers", () => {
    const bm25 = ids("Why did he join Metrodata?");
    const hybrid = ids("Why did he join Metrodata?", q("Why did he join Metrodata?"));
    expect(hybrid).toContain("career-metrodata-2026");
    expect(bm25).toContain("career-metrodata-2026");
  });
});

describe("pipeline with embeddings", () => {
  const client = (answer: string): ModelClient => ({
    async *stream() {
      yield answer;
    },
  });
  const run = (question: keyof typeof fixture.vectors, embed?: (t: string) => Promise<Float32Array | null>) =>
    runPipeline({ question, locale: "en", pack, vocabulary: packVocabulary(pack), client: client("Kurniadi has no information about that on this site."), timeouts: { firstTokenMs: 500, totalMs: 1000 }, ...(embed ? { embed } : {}) });

  it("logs hybrid retrieval when the question is embedded and bm25 when the call fails or is absent", async () => {
    expect((await run("What motivates him?", async () => q("What motivates him?"))).retrieval).toBe("hybrid");
    expect((await run("What motivates him?", async () => null)).retrieval).toBe("bm25");
    expect((await run("What motivates him?")).retrieval).toBe("bm25");
  });

  it("never embeds a question the rules already answered or declined", async () => {
    let calls = 0;
    const r = await run("What's the weather in Jakarta today?", async () => {
      calls++;
      return q("What's the weather in Jakarta today?");
    });
    expect(r.reason).toBe("offtopic");
    expect(calls).toBe(0);
  });

  it("re-routes a default question only when one router label clearly leads", async () => {
    const signals = (text: keyof typeof fixture.vectors) => routerSignals(q(text), packVectors(pack)!);
    const plan = (text: string) => planRoute({ question: text, pack }) as Extract<ReturnType<typeof planRoute>, { kind: "model" }>;
    expect(assistRoute(plan("What does he think the state should do about technology?"), signals("What does he think the state should do about technology?"), 0.53)).toBe("civic");
    expect(assistRoute(plan("Will it be sunny in Bali tomorrow?"), signals("Will it be sunny in Bali tomorrow?"), 0.46)).toBe("offtopic");
    // Close to a private exemplar: no re-route (the model and rule 9 decide), and nothing is ever declined by similarity.
    expect(assistRoute(plan("Is he seeing anyone?"), signals("Is he seeing anyone?"), 0.47)).toBeUndefined();
    expect(assistRoute(plan("Why did he join Metrodata?"), signals("Why did he join Metrodata?"), 0.57)).toBeUndefined();
    // Only the default route is assisted.
    expect(assistRoute(plan("How do I learn machine learning?"), signals("How do I learn machine learning?"), 0.58)).toBeUndefined();
    const offtopic = await run("Will it be sunny in Bali tomorrow?", async () => q("Will it be sunny in Bali tomorrow?"));
    expect(offtopic).toMatchObject({ outcome: "decline", reason: "offtopic", calledModel: false });
    const civic = await run("What does he think the state should do about technology?", async () => q("What does he think the state should do about technology?"));
    expect(civic.route).toBe("civic");
  });
});
