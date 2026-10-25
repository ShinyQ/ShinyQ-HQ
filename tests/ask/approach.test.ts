import { beforeAll, describe, expect, it } from "vitest";
import { checkAnswer, leaksPrompt, prescribes } from "../../functions/_lib/checks";
import { packVocabulary } from "../../functions/_lib/pipeline";
import { buildStoredVectors, readEmbeddingCache, readExemplars } from "@/ask/embeddings";
import { buildRepoPack } from "@/ask/repo-pack";
import { approachLine, PROMPT_VERSION, routingLines, RULES } from "../../functions/_lib/prompt";
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

describe("rule 18 and the approach line", () => {
  it("bumps the prompt version", () => expect(PROMPT_VERSION).toBe("2026-10-25.approach.1"));

  it("adds rule 18 and points rule 11 to it", () => {
    const rules = RULES.join(" ");
    expect(rules).toContain("18. When the routing marks a problem question");
    expect(RULES.find((r) => r.startsWith("11."))).toContain("rule 18");
    expect(rules).toContain("Never tell the visitor what to use, build or do");
  });

  it("states the approach line instead of the lead line", () => {
    const lines = routingLines({ approach: { matches: ["Realtime Voice AI Contact Center"] } });
    expect(lines).toEqual([approachLine(["Realtime Voice AI Contact Center"])]);
    expect(lines[0]).toContain("rule 18");
    expect(lines[0]).toContain('"Realtime Voice AI Contact Center"');
    expect(lines[0]).not.toContain("rule 11");
  });

  it("does not count the bridging sentence rule 18 allows as a prompt leak", () => {
    expect(leaksPrompt("A similar problem would likely start the same way.")).toBe(false);
    expect(leaksPrompt("In Realtime Voice AI Contact Center, he started by mapping the call flow [S1]. A similar problem would likely start the same way, with the same first questions [S2].")).toBe(false);
  });

  it("does not count a contact card invitation as a prompt leak", () => {
    for (const text of [
      "Get in touch, the site shows a contact card under this answer.",
      "Feel free to get in touch, the site shows a contact card.",
      "Kurniadi takes freelance and part-time work; get in touch through the contact card.",
    ]) expect(leaksPrompt(text), text).toBe(false);
  });

  it("still flags a verbatim span of rule 18", () => {
    expect(leaksPrompt("Never tell the visitor what to use, build or do, recommend a stack or an architecture")).toBe(true);
    expect(leaksPrompt("Describe how Kurniadi approached similar problems in the matching past projects it names.")).toBe(true);
  });
});

describe("approach checks", () => {
  const q = "Our call center can't keep up. His approach?";
  const setup = () => {
    const matches = approachMatches(pack, leadMatches(pack, q), null);
    const { chunks, context } = retrieve(pack, q, "en", { lead: true, approach: matches });
    return { matches, chunks, context };
  };
  const check = (answer: string) => {
    const { matches, chunks, context } = setup();
    return checkAnswer({ answer, question: q, context, packDate: pack.packDate, pack, vocabulary: packVocabulary(pack), chunks, lead: { fit: true }, approach: { matches }, locale: "en" });
  };
  /** A past-tense outline built from the first match's own CONTEXT words. */
  const outline = () => {
    const { matches } = setup();
    const m = matches[0];
    const words = m.text_en.split(/(?<=[.!?])\s+/).slice(0, 2).join(" ");
    return `In **${m.title}**, ${words.charAt(0).toLowerCase()}${words.slice(1)} A similar problem would likely start the same way. Kurniadi takes freelance and part-time work, so get in touch through the contact card.`;
  };

  it("passes a grounded past-tense outline and cites the project page", () => {
    const r = check(outline());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.cite).toBe(setup().matches[0].url);
  });

  it.each([
    "You should use Azure OpenAI with a RAG layer for this.",
    "I recommend a three-service architecture.",
    "It would take about 6 weeks to build.",
    "Step 1: set up a vector index.",
  ])("rejects visitor-directed advice or estimates: %s", (bad) => {
    const r = check(`${outline()} ${bad}`);
    expect(r).toMatchObject({ ok: false, reason: "consulting", replacement: "lead" });
  });

  it("rejects more than seven sentences or four list items", () => {
    expect(prescribes("A. B. C. D. E. F. G. H.", "A. B. C. D. E. F. G. H.", "")).toBe(true);
    const list = "Steps he took:\n\n- a\n- b\n- c\n- d\n- e";
    expect(prescribes("Steps he took:\na\nb\nc\nd\ne", list, "")).toBe(true);
    expect(prescribes("A. B. C. D. E. F. G.", "A. B. C. D. E. F. G.", "")).toBe(false);
  });

  it("allows a duration CONTEXT states, never a new one", () => {
    expect(prescribes("The review went from 3 days to 4 hours.", "The review went from 3 days to 4 hours.", "review time fell from 3 days to 4 hours")).toBe(false);
    expect(prescribes("It would be done in 3 weeks.", "It would be done in 3 weeks.", "review time fell from 3 days to 4 hours")).toBe(true);
  });

  it("rejects an answer that cites no matched project", () => {
    const r = check("Kurniadi likes to start small and measure everything before scaling. Get in touch through the contact card.");
    expect(r).toMatchObject({ ok: false, reason: "unsourced", replacement: "lead" });
  });

  it("rejects general-knowledge wording", () => {
    const r = check(`${outline()} In general, teams use chatbots for this.`);
    expect(r).toMatchObject({ ok: false, reason: "unsourced", replacement: "lead" });
  });

  const invitation = "Kurniadi takes freelance and part-time work, so get in touch through the contact card.";
  /** A longer outline (four of the match's own sentences), grounded enough to carry one more sentence. */
  const outlineOnly = () => {
    const m = setup().matches[0];
    const words = m.text_en.split(/(?<=[.!?])\s+/).slice(0, 4).join(" ");
    return `In **${m.title}**, ${words.charAt(0).toLowerCase()}${words.slice(1)} A similar problem would likely start the same way.`;
  };

  it("rejects an invented view even though the invitation echoes the engagements perspective", () => {
    const r = check(`${outlineOnly()} In his view, this is the right way to start. ${invitation}`);
    expect(r).toMatchObject({ ok: false, reason: "unsourced", replacement: "lead" });
  });

  it("passes a view that cites a retrieved written view", () => {
    const r = check(`${outlineOnly()} In his view, "Design for Recovery" matters: he plans for failures and builds a recovery path rather than assume the system will always work. ${invitation}`);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.cites).toContain(pack.chunks.find((c) => c.id === "principles")?.url);
  });

  it.each(["Yours could be live in 2 days.", "Expect results within 2 days."])("rejects a CONTEXT duration reused as the visitor's timeline: %s", (bad) => {
    const fq = "Our fraud checks are manual. His approach?";
    const matches = approachMatches(pack, leadMatches(pack, fq), null);
    const { chunks, context } = retrieve(pack, fq, "en", { lead: true, approach: matches });
    expect(context).toMatch(/\b2 days\b/);
    const m = matches[0];
    const words = m.text_en.split(/(?<=[.!?])\s+/).slice(0, 2).join(" ");
    const answer = `In **${m.title}**, ${words.charAt(0).toLowerCase()}${words.slice(1)} ${bad} ${invitation}`;
    const r = checkAnswer({ answer, question: fq, context, packDate: pack.packDate, pack, vocabulary: packVocabulary(pack), chunks, lead: { fit: true }, approach: { matches }, locale: "en" });
    expect(r).toMatchObject({ ok: false, reason: "consulting", replacement: "lead" });
    expect(prescribes(bad, bad, "Results: 2 days Time to the first working client dashboard")).toBe(true);
  });

  it("matches a CONTEXT duration on word boundaries only", () => {
    expect(prescribes("The rollout took 3 weeks.", "The rollout took 3 weeks.", "the rollout took 13 weeks")).toBe(true);
    expect(prescribes("The rollout took 3 weeks.", "The rollout took 3 weeks.", "the rollout took 3 weeks")).toBe(false);
  });
});
