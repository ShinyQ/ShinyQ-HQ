import { beforeAll, describe, expect, it } from "vitest";
import { APPROACH_BRIDGE, checkAnswer, hypothesizes, leaksPrompt, prescribes } from "../../functions/_lib/checks";
import { MESSAGES } from "../../functions/_lib/messages";
import type { ModelClient } from "../../functions/_lib/model";
import { scrubPII } from "../../functions/_lib/pii";
import { packVocabulary, planRoute, runPipeline } from "../../functions/_lib/pipeline";
import { buildStoredVectors, readEmbeddingCache, readExemplars } from "@/ask/embeddings";
import { buildRepoPack } from "@/ask/repo-pack";
import { approachLine, PROMPT_VERSION, routingLines, RULES } from "../../functions/_lib/prompt";
import { APPROACH_MATCH_CAP, APPROACH_PERSPECTIVE_CAP, approachMatches, leadMatches, LEAD_ENGAGEMENTS, retrieve, SEMANTIC_FLOOR } from "../../functions/_lib/retrieve";
import { isApproachAsk, isOwnProblem, isProblemQuestion } from "../../functions/_lib/scope";
import { cleanText, detectLocale } from "../../functions/_lib/text";
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
    "Bagaimana Kurniadi menangani deteksi fraud dokumen?",
    "Bagaimana dia menangani reliabilitas LLM?",
    // Questions about his team, this site or his views keep their routes (final review F1).
    "How would he handle a disagreement with his manager?",
    "How would you improve this website?",
    "We are curious what problems AI cannot solve in his view",
    "Bagaimana dia akan menangani konflik dengan atasannya?",
    // A problem word needs its own word boundary.
    "We issued a press release about his talk",
    "Was our problematic launch in his case study?",
    "Our slowdown chart came from his talk?",
  ])("leaves %s alone", (q) => expect(isProblemQuestion(q)).toBe(false));

  it("splits the own-problem shape from an approach ask", () => {
    expect(isOwnProblem("Our team struggles with flaky tests")).toBe(true);
    expect(isApproachAsk("Our team struggles with flaky tests")).toBe(false);
    expect(isOwnProblem("How would he handle a tight deadline?")).toBe(false);
    expect(isApproachAsk("How would he handle a tight deadline?")).toBe(true);
    expect(isOwnProblem("Our call center can't keep up. His approach?")).toBe(true);
    expect(isApproachAsk("Our call center can't keep up. His approach?")).toBe(true);
    // The exclusions apply to both predicates.
    expect(isApproachAsk("How would he handle a disagreement with his manager?")).toBe(false);
    expect(isOwnProblem("We are curious what problems AI cannot solve in his view")).toBe(false);
  });
});

describe("lead promotion of a problem question", () => {
  it.each([
    ["How would he handle a tight deadline?", "default"],
    ["How would he handle conflict in a team?", "default"],
    ["How would he handle a project with unclear requirements?", "default"],
  ])("keeps an approach ask with no matching project on its old route: %s", (q, route) => {
    expect(leadMatches(pack, q)).toEqual([]);
    expect(planRoute({ question: q, pack })).toMatchObject({ kind: "model", route, lead: false, approach: false });
  });

  it("promotes an approach ask with matching projects and an own problem without them", () => {
    expect(planRoute({ question: "How would he speed up slow document review?", pack })).toMatchObject({ route: "approach", lead: true });
    expect(leadMatches(pack, "Our team struggles with flaky tests")).toEqual([]);
    expect(planRoute({ question: "Our team struggles with flaky tests", pack })).toMatchObject({ route: "lead", lead: true });
  });
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

  it("states the exact bridging sentence in both languages and never counts it as a leak", () => {
    const rule = RULES.find((r) => r.startsWith("18."))!;
    expect(rule).toContain(`exactly "${APPROACH_BRIDGE.en}"`);
    expect(rule).toContain(`"${APPROACH_BRIDGE.id}"`);
    expect(leaksPrompt(`${APPROACH_BRIDGE.en} In his view, this is the right way to start.`)).toBe(false);
    expect(leaksPrompt(APPROACH_BRIDGE.id)).toBe(false);
    expect(leaksPrompt(`Dalam proyek itu, dia memetakan alur panggilan [S1]. ${APPROACH_BRIDGE.id} Silakan hubungi lewat kartu kontak.`)).toBe(false);
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

  // Final review F2: stack picks, designs and fuzzy timelines phrased without "you should".
  it.each([
    "Start with a voice agent on Azure OpenAI Realtime and Azure AI Search, then add warm transfer to a human.",
    "Your call center needs a voice agent with Azure AI Search and warm transfer.",
    "A similar problem would likely start the same way, with Azure OpenAI Realtime, Azure AI Search and FastAPI.",
    "A similar system could be live in a few weeks.",
  ])("rejects a reproduced prescription: %s", (bad) => {
    expect(check(`${outline()} ${bad}`)).toMatchObject({ ok: false, reason: "consulting", replacement: "lead" });
  });

  it.each([
    "Yours is a common problem.",
    "Kamu bisa mulai dari data.",
    "Masalah call center kalian umum.",
    "Use a vector index for the transcripts.",
    "Consider a human handoff.",
    "Set up a queue first.",
    "Gunakan Azure AI Search untuk transkrip.",
    "Tambahkan human handoff.",
    "He will build it on Azure.",
    "Kurniadi'll start with the transcripts.",
    "It might start with a pilot.",
    "Masalah serupa akan dimulai dengan Azure.",
    "Sebaiknya dimulai dengan pilot.",
    "Several months of work went into it.",
    "It could be ready in a couple of weeks.",
    "The pilot needs three sprints.",
    "Butuh beberapa minggu.",
    "Selesai dalam hitungan hari.",
    "Butuh dua belas minggu.",
  ])("rejects a sentence that addresses the visitor, gives an order, looks ahead or names a vague duration: %s", (bad) => {
    expect(prescribes(bad, bad, "the pilot ran for six weeks")).toBe(true);
  });

  it.each([
    "A similar problem would likely start the same way.",
    "A similar problem would likely start the same way [S2].",
    "Masalah serupa kemungkinan besar dimulai dengan cara yang sama.",
    "Masalah serupa kemungkinan besar dimulai dengan cara yang sama [S3].",
  ])("passes the exact bridging sentence: %s", (bridge) => {
    expect(prescribes(bridge, bridge, "")).toBe(false);
  });

  it("passes a spelled-out duration CONTEXT states, in a past-tense sentence", () => {
    expect(prescribes("The pilot ran for six weeks.", "The pilot ran for six weeks.", "the pilot ran for six weeks")).toBe(false);
    expect(prescribes("The pilot ran for six weeks.", "The pilot ran for six weeks.", "the pilot ran for 6 weeks")).toBe(true);
  });

  it("passes a modal his written words in CONTEXT use", () => {
    const ctx = "I plan for failures and build a recovery path rather than assume the system will always work.";
    expect(prescribes("He builds a recovery path rather than assume the system will always work.", "x", ctx)).toBe(false);
    expect(prescribes("The system will always scale.", "x", ctx)).toBe(true);
  });

  it("matches a CONTEXT duration on word boundaries only", () => {
    expect(prescribes("The rollout took 3 weeks.", "The rollout took 3 weeks.", "the rollout took 13 weeks")).toBe(true);
    expect(prescribes("The rollout took 3 weeks.", "The rollout took 3 weeks.", "the rollout took 3 weeks")).toBe(false);
  });

  // Follow-up R1: the final contact card invitation may address the visitor, nothing else may.
  it.each([
    "If you'd like to discuss this, you can reach him through the contact card.",
    "If you want to talk it through, get in touch through the contact card.",
    "You can reach him through the contact card.",
    "If this sounds similar to your situation, get in touch through the contact card.",
    "To discuss your project, use the contact card below.",
  ])("passes a final contact card invitation: %s", (invite) => {
    expect(prescribes(invite, invite, "")).toBe(false);
    const r = check(`${outlineOnly()} ${invite}`);
    expect(r.ok, JSON.stringify(r)).toBe(true);
  });

  it.each(["Jika Anda ingin berdiskusi, hubungi Kurniadi lewat kartu kontak.", "Silakan hubungi dia lewat kartu kontak di bawah."])("passes an Indonesian final invitation: %s", (invite) => {
    expect(prescribes(invite, invite, "")).toBe(false);
  });

  it.each([
    "If you want Azure AI Search in two weeks, use the contact card.",
    "If you'd like a pilot within 2 weeks, get in touch through the contact card.",
    "If you want a RAG pipeline, reach out through the contact card.",
    "You should reach him through the contact card.",
    "If you'd like, he will reach out through the contact card.",
    "Use a vector index and the contact card.",
    "If you'd like to discuss it, get in touch through the contact card, he could help with a few weeks of design and review work.",
    "If you would like to talk about the details, the background and the goals of the work with him at a time that suits, get in touch through the contact card.",
  ])("rejects an invitation that adds a stack, a timeline, a modal, an order or advice: %s", (bad) => {
    expect(prescribes(bad, bad, "")).toBe(true);
    expect(check(`${outlineOnly()} ${bad}`)).toMatchObject({ ok: false, reason: "consulting", replacement: "lead" });
  });

  it("rejects an invitation that is not the final sentence", () => {
    const invite = "You can reach him through the contact card.";
    expect(prescribes(`${invite} ${APPROACH_BRIDGE.en}`, "x", "")).toBe(true);
    expect(check(`${outlineOnly()} ${invite} ${invitation}`)).toMatchObject({ ok: false, reason: "consulting", replacement: "lead" });
  });

  // Follow-up R2: no sentence projects his work onto the visitor's case, even in words CONTEXT states.
  it.each([
    "A similar call center would be selective: Azure OpenAI Realtime, Azure AI Search and warm transfer to a human.",
    "A similar setup on Azure OpenAI Realtime and Azure AI Search with warm transfer will always work.",
    "A similar team would push for Azure OpenAI and Azure AI Search, with a human review queue.",
    "What would most help a similar team is a document pipeline with Azure OpenAI and a review queue.",
    "A similar system could use Azure OpenAI Realtime and Azure AI Search.",
    "A similar call center may need Azure AI Search.",
    "The same stack fits: Azure OpenAI Realtime, Azure AI Search and FastAPI.",
    "The right fit here is Azure OpenAI Realtime with Azure AI Search and warm transfer.",
    "A similar build needs two weeks.",
    "Building something similar takes two weeks.",
    "A similar build is two weeks of work.",
    "Untuk kasus ini, Azure AI Search cocok.",
  ])("rejects a projection onto the visitor's case: %s", (bad) => {
    expect(prescribes(bad, bad, bad)).toBe(true);
    expect(check(`${outlineOnly()} ${bad} ${invitation}`)).toMatchObject({ ok: false, reason: "consulting", replacement: "lead" });
  });

  it("passes a modal only when CONTEXT states the stretch from three words before it to the end of the sentence", () => {
    const ctx = "I plan for failures and build a recovery path rather than assume the system will always work.";
    expect(prescribes("He plans for failures, and the system will always work.", "x", ctx)).toBe(true);
    expect(prescribes("He builds a recovery path rather than assume the system will always work today.", "x", ctx)).toBe(true);
    expect(prescribes("The agents can scale later.", "x", "")).toBe(true);
    expect(prescribes("The pipeline could absorb peaks.", "x", "")).toBe(true);
    expect(prescribes("The queue may grow.", "x", "")).toBe(true);
    expect(prescribes("The agents can hand off to a human.", "x", "in production the agents can hand off to a human")).toBe(false);
    // The month is not a modal.
    expect(prescribes("In May he shipped the pilot.", "x", "")).toBe(false);
  });
});

describe("lead opinion check", () => {
  /** A plain lead (final review F1): an answer that tells a view as his must cite his written view. */
  const lead = (answer: string, q = "How would he handle a tight deadline for our launch?") => {
    const { chunks, context } = retrieve(pack, q, "en", { lead: true });
    expect(chunks.map((c) => c.id)).toContain(LEAD_ENGAGEMENTS);
    return checkAnswer({ answer, question: q, context, packDate: pack.packDate, pack, vocabulary: packVocabulary(pack), chunks, lead: { fit: false }, locale: "en" });
  };

  it("rejects an invented opinion on the lead path", () => {
    const r = lead("Kurniadi believes deadlines are met by close collaboration. He would likely talk to stakeholders daily. Get in touch through the contact card.");
    expect(r).toMatchObject({ ok: false, reason: "unsourced", replacement: "lead" });
  });

  it("passes a plain lead answer that restates his engagements view", () => {
    const title = pack.chunks.find((c) => c.id === LEAD_ENGAGEMENTS)!.title;
    const r = lead(`In his written view "${title}", Kurniadi is interested in projects with clear boundaries: backend systems, integrations, production hardening and practical AI applications. Get in touch through the contact card.`);
    expect(r.ok).toBe(true);
  });

  it("passes a plain lead answer that claims no opinion", () => {
    expect(lead("Kurniadi takes freelance and part-time work. Get in touch through the contact card.").ok).toBe(true);
  });

  // Follow-up R3: invented behaviour without an opinion verb, on any lead answer.
  const flaky = "Our team struggles with flaky tests";
  const card = "Kurniadi takes freelance and part-time work, so get in touch through the contact card.";
  it.each([
    "For a tight deadline he would cut scope first and talk to stakeholders daily.",
    "He'd cut scope first and talk to stakeholders daily.",
    "Kurniadi will start with the flaky tests.",
    "He might talk to stakeholders daily.",
    "He'll cut scope first.",
    "Dia akan memangkas lingkup lebih dulu.",
  ])("rejects a hypothetical about him on a plain lead: %s", (bad) => {
    expect(planRoute({ question: flaky, pack })).toMatchObject({ route: "lead", lead: true });
    expect(hypothesizes(`${bad} ${card}`)).toBe(true);
    expect(lead(`${bad} ${card}`, flaky)).toMatchObject({ ok: false, reason: "consulting", replacement: "lead" });
  });

  it("passes a hypothetical inside quoted text and a plain invitation", () => {
    expect(hypothesizes(`One of his posts is titled "What he would change next time". ${card}`)).toBe(false);
    expect(hypothesizes("Kurniadi takes freelance work. If you'd like to discuss it, you can reach him through the contact card.")).toBe(false);
    expect(lead(`Kurniadi takes freelance and part-time work. ${card}`, flaky).ok).toBe(true);
  });

  it("never flags a canned message", () => {
    for (const [kind, m] of Object.entries(MESSAGES)) for (const text of Object.values(m)) expect(hypothesizes(text), `${kind}: ${text}`).toBe(false);
  });
});

const fast = { firstTokenMs: 60, totalMs: 150 };

function mockClient(answer: string) {
  const calls: { model: string; input: unknown }[] = [];
  const client: ModelClient = {
    stream(model, input) {
      calls.push({ model, input });
      return (async function* () {
        yield answer;
      })();
    },
  };
  return { client, calls };
}

const ask = async (q: string, answer = "unused", locale: "en" | "id" = "en") => {
  const question = scrubPII(cleanText(q));
  const { client, calls } = mockClient(answer);
  const result = await runPipeline({ question, locale: detectLocale(question, locale), pack, vocabulary: packVocabulary(pack), client, models: { primary: "p", fallback: "f" }, timeouts: fast });
  return { ...result, calls };
};

const systemOf = (calls: { input: unknown }[]) => (calls[0].input as { messages: { content: string }[] }).messages[0].content;

describe("approach pipeline", () => {
  const q = "Our call center can't keep up. His approach?";

  it("routes a problem with matches to approach, states rule 18, and carries the cite and the contact card", async () => {
    const matches = approachMatches(pack, leadMatches(pack, q), null);
    const { context } = retrieve(pack, q, "en", { lead: true, approach: matches });
    const m = matches[0];
    const body = m.text_en.split(/(?<=[.!?])\s+/).slice(0, 2).join(" ");
    const answer = `In **${m.title}**, ${body.charAt(0).toLowerCase()}${body.slice(1)} Get in touch through the contact card.`;
    expect(context).toContain(m.text_en.slice(0, 40));
    const r = await ask(q, answer);
    expect(r).toMatchObject({ outcome: "answer", route: "approach", lead: true, cite: m.url });
    expect(systemOf(r.calls)).toContain("(rule 18)");
  });

  it("replaces a prescriptive answer with the lead message and the card", async () => {
    const r = await ask(q, "You should use Azure OpenAI and it would take 6 weeks.");
    expect(r).toMatchObject({ text: MESSAGES.lead.en, reason: "consulting", route: "approach", lead: true });
  });

  it("falls back to the lead route when no project matches", async () => {
    const r = await ask("Our team struggles with flaky tests", "Kurniadi takes freelance work; get in touch through the contact card.");
    expect(r.route).toBe("lead");
    expect(systemOf(r.calls)).toContain("(rule 11)");
  });

  it("drops to a plain lead with no fit when the question vector rejects every match", async () => {
    // A separate hydrated pack (hydration is cached per pack object) and a stored row far from every match.
    const { pack: vpack } = buildRepoPack("2026-10-11");
    const stored = buildStoredVectors(vpack, readEmbeddingCache(), readExemplars()).vectors as StoredVectors;
    const vectors = hydrateVectors({ pack: vpack, vectors: stored });
    if (!vectors) throw new Error("pack vectors did not hydrate");
    const row = (i: number) => Float32Array.from(vectors.rows.subarray(i * vectors.dims, (i + 1) * vectors.dims));
    const matches = leadMatches(vpack, q);
    expect(matches.length).toBeGreaterThan(0);
    const at = matches.map((m) => vpack.chunks.indexOf(m));
    const far = vpack.chunks.findIndex((c, i) => {
      if (c.type === "project" || !vectors.norms[i]) return false;
      const sims = cosines(row(i), vectors.rows, vectors.norms, vectors.dims);
      return at.every((j) => sims[j] < SEMANTIC_FLOOR);
    });
    expect(far).toBeGreaterThanOrEqual(0);
    const { client, calls } = mockClient("Kurniadi's past work looks like a strong fit for this. Get in touch through the contact card.");
    const r = await runPipeline({ question: q, locale: "en", pack: vpack, vocabulary: packVocabulary(vpack), client, models: { primary: "p", fallback: "f" }, timeouts: fast, embed: async () => row(far) });
    expect(r).toMatchObject({ route: "lead", lead: true, reason: "fit", text: MESSAGES.lead.en, retrieval: "hybrid" });
    const system = systemOf(calls);
    expect(system).toContain("No past project in CONTEXT closely matches it");
    expect(system).not.toContain("(rule 18). Past projects");
    for (const m of matches) {
      expect(r.chunkIds).not.toContain(m.id);
      expect(system).not.toContain(`"${m.title}"`);
    }
  });
});
