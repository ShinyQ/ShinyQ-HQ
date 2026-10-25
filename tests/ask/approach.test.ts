import { beforeAll, describe, expect, it } from "vitest";
import { buildStoredVectors, readEmbeddingCache, readExemplars } from "@/ask/embeddings";
import { buildRepoPack } from "@/ask/repo-pack";
import { APPROACH_MATCH_CAP, APPROACH_PERSPECTIVE_CAP, approachMatches, leadMatches, LEAD_ENGAGEMENTS, retrieve, SEMANTIC_FLOOR } from "../../functions/_lib/retrieve";
import { isProblemQuestion } from "../../functions/_lib/scope";
import type { KnowledgePack } from "../../functions/_lib/types";
import { cosines, decodeRows, encodeRows, hydrateVectors, type PackVectors, type StoredVectors } from "../../functions/_lib/vectors";

let pack: KnowledgePack;
beforeAll(() => {
  ({ pack } = buildRepoPack("2026-10-11"));
});

/** Bring your problem (owner decision 2026-10-25): problem questions, approach retrieval, rule 18 and the approach checks. */
describe("isProblemQuestion", () => {
  it.each([
    "Our fraud checks are manual. His approach?",
    "Our call center can't keep up. His approach?",
    "We review documents manually and it is too slow",
    "Our support team is drowning in emails, how would he tackle it?",
    "How would he speed up slow document review?",
    "How would he tackle slow voice AI latency?",
    "How would you approach fraud detection for us?",
    "What would Kurniadi do about our slow onboarding?",
    "Call center kami kewalahan. Pendekatannya?",
    "Review dokumen kami lambat. Pendekatannya?",
    "Tim kami kesulitan menyaring CV pelamar",
    "Bagaimana Kurniadi menangani deteksi fraud dokumen?",
    "Gimana dia akan mengatasi latensi voice AI?",
    "We would like to know how he would approach our slow onboarding",
    "We would like to know how he would tackle our manual fraud checks",
    "Can we see how he would handle our support backlog?",
    "Kami ingin tahu bagaimana Kurniadi akan menangani call center kami yang kewalahan",
    "Our fraud checks are manual. He built fraud detection before, how would he approach ours?",
    "Our call center cannot keep up. Has he handled this before? His approach?",
    "Tim kami kewalahan dengan CV pelamar, apakah dia pernah menangani hal seperti ini?",
  ])("detects %s", (q) => expect(isProblemQuestion(q)).toBe(true));

  it.each([
    "How did he build the fraud review platform?",
    "What problems did he solve at Metrodata?",
    "How do I build a RAG chatbot step by step?",
    "What is RAG?",
    "How was this site built?",
    "Can he build us a chatbot?",
    "I need an AI chatbot for my clinic, can you help?",
    "I struggle to learn machine learning",
    "Saya kesulitan belajar AI",
    "How would he solve corruption in the government?",
    "What would he do about AI regulation?",
    "How would he build a RAG chatbot?",
    "We would like to know what problems he solved at Metrodata",
    "Our team wants to know which issues he worked on",
    "Can we see the issues he fixed at Jenius?",
    "We heard he fixed slow queries at Jenius, how?",
    "Kami ingin tahu masalah apa yang pernah dia selesaikan",
    "Bisakah kami lihat proyek yang menyelesaikan masalah fraud?",
  ])("leaves %s alone", (q) => expect(isProblemQuestion(q)).toBe(false));
});

describe("approach retrieval", () => {
  const q = "Our call center can't keep up. His approach?";

  it("keeps at most two matches, in BM25 order without a question vector", () => {
    const all = leadMatches(pack, q);
    expect(all.length).toBeGreaterThan(APPROACH_MATCH_CAP);
    expect(approachMatches(pack, all, null)).toEqual(all.slice(0, APPROACH_MATCH_CAP));
  });

  it("puts the lead set, the matches, principles and at most two perspectives in CONTEXT, matches before views", () => {
    const matches = approachMatches(pack, leadMatches(pack, q), null);
    const { chunks } = retrieve(pack, q, "en", { lead: true, approach: matches });
    const ids = chunks.map((c) => c.id);
    expect(ids.slice(0, 4)).toEqual(["profile", "now", "contact", LEAD_ENGAGEMENTS].filter((id) => pack.chunks.some((c) => c.id === id)));
    for (const m of matches) expect(ids).toContain(m.id);
    expect(ids).toContain("principles");
    const views = chunks.filter((c) => c.type === "perspective" && c.id !== LEAD_ENGAGEMENTS);
    expect(views.length).toBeLessThanOrEqual(APPROACH_PERSPECTIVE_CAP);
    expect(ids.indexOf(matches[0].id)).toBeLessThan(ids.indexOf("principles"));
    expect(chunks.filter((c) => c.type === "project" && !matches.includes(c))).toEqual([]);
  });
});

describe("approachMatches with a question vector", () => {
  const q = "Our call center can't keep up. His approach?";
  let vpack: KnowledgePack;
  let stored: StoredVectors;
  let vectors: PackVectors;
  const row = (v: PackVectors, i: number) => Float32Array.from(v.rows.subarray(i * v.dims, (i + 1) * v.dims));

  beforeAll(() => {
    // A separate pack: hydration is cached per pack object, so the null-vector tests above keep an unhydrated pack.
    ({ pack: vpack } = buildRepoPack("2026-10-11"));
    stored = buildStoredVectors(vpack, readEmbeddingCache(), readExemplars()).vectors as StoredVectors;
    const hydrated = hydrateVectors({ pack: vpack, vectors: stored });
    if (!hydrated) throw new Error("pack vectors did not hydrate");
    vectors = hydrated;
  });

  it("orders the matches by cosine", () => {
    const matches = leadMatches(vpack, q);
    expect(matches.length).toBeGreaterThan(1);
    const i = vpack.chunks.indexOf(matches[1]);
    expect(vectors.norms[i]).toBeGreaterThan(0);
    expect(approachMatches(vpack, matches, row(vectors, i))[0]).toBe(matches[1]);
  });

  it("drops every match under SEMANTIC_FLOOR", () => {
    const matches = leadMatches(vpack, q);
    const at = matches.map((m) => vpack.chunks.indexOf(m));
    const far = vpack.chunks.findIndex((c, i) => {
      if (c.type === "project" || !vectors.norms[i]) return false;
      const sims = cosines(row(vectors, i), vectors.rows, vectors.norms, vectors.dims);
      return at.every((j) => sims[j] < SEMANTIC_FLOOR);
    });
    expect(far).toBeGreaterThanOrEqual(0);
    const sims = cosines(row(vectors, far), vectors.rows, vectors.norms, vectors.dims);
    for (const j of at) expect(sims[j]).toBeLessThan(SEMANTIC_FLOOR);
    expect(approachMatches(vpack, matches, row(vectors, far))).toEqual([]);
  });

  it("keeps a match without a stored vector at the floor", () => {
    const matches = leadMatches(vpack, q);
    const zeroed = vpack.chunks.indexOf(matches[0]);
    const rows = decodeRows(stored.chunks);
    rows.fill(0, zeroed * stored.dims, (zeroed + 1) * stored.dims);
    const copy: KnowledgePack = { ...vpack };
    const hydrated = hydrateVectors({ pack: copy, vectors: { ...stored, chunks: encodeRows(rows) } });
    expect(hydrated?.norms[zeroed]).toBe(0);
    // A question far from every other match: only the zero-norm match survives, sitting at the floor.
    const at = matches.map((m) => vpack.chunks.indexOf(m));
    const far = vpack.chunks.findIndex((c, i) => {
      if (c.type === "project" || !vectors.norms[i]) return false;
      const sims = cosines(row(vectors, i), vectors.rows, vectors.norms, vectors.dims);
      return at.every((j) => j === zeroed || sims[j] < SEMANTIC_FLOOR);
    });
    expect(far).toBeGreaterThanOrEqual(0);
    expect(approachMatches(copy, matches, row(vectors, far))).toEqual([matches[0]]);
  });
});
