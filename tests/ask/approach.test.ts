import { beforeAll, describe, expect, it } from "vitest";
import { buildRepoPack } from "@/ask/repo-pack";
import { APPROACH_MATCH_CAP, APPROACH_PERSPECTIVE_CAP, approachMatches, leadMatches, LEAD_ENGAGEMENTS, retrieve } from "../../functions/_lib/retrieve";
import { isProblemQuestion } from "../../functions/_lib/scope";
import type { KnowledgePack } from "../../functions/_lib/types";

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
