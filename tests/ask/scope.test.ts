import { beforeAll, describe, expect, it } from "vitest";
import { buildRepoPack } from "@/ask/repo-pack";
import { getPerspectivesFile } from "@/content/load";
import { SUGGESTIONS } from "@/ask/suggestions";
import { PERSPECTIVE_CAP, retrieve, SITE_INCLUDE } from "../../functions/_lib/retrieve";
import { isGeneralAssistantRequest, isPerspectiveQuestion, isSiteQuestion, opinionAboutOthers, orgAliases, privateTopic, resolveNickname } from "../../functions/_lib/scope";
import type { KnowledgePack, SafetyData } from "../../functions/_lib/types";
import golden from "./golden.json";

let pack: KnowledgePack;
let safety: SafetyData;

beforeAll(() => {
  ({ pack, safety } = buildRepoPack("2026-10-11"));
});

const originalGolden = golden.items.filter((i) => Number(i.id.slice(1)) <= 32);
const refuses = (item: (typeof golden.items)[number]) => (item.expect as { refuse?: boolean }).refuse === true;

describe("resolveNickname (owner 2026-10-16: ShinyQ is Kurniadi's nickname)", () => {
  it.each([
    ["Who is ShinyQ?", "Who is Kurniadi?"],
    ["what does shinyq do", "what does Kurniadi do"],
    ["Apa itu ShinyQ?", "Apa itu Kurniadi?"],
    ["Is Shiny Q open to freelance work?", "Is Kurniadi open to freelance work?"],
    ["Siapa Shiny-Q?", "Siapa Kurniadi?"],
    ["ShinyQ's projects", "Kurniadi's projects"],
  ])("%s", (q, out) => expect(resolveNickname(q)).toBe(out));

  it.each(["How was ShinyQ HQ built?", "What stack does ShinyQ-HQ use?", "Shiny Q HQ hosting?", "github.com/ShinyQ/ShinyQ-HQ"])("keeps the site name: %s", (q) => {
    expect(resolveNickname(q)).toBe(q);
    expect(isSiteQuestion(resolveNickname(q))).toBe(isSiteQuestion(q));
  });

  it("routes nickname questions like questions about him", () => {
    expect(isGeneralAssistantRequest(resolveNickname("Who is ShinyQ?"))).toBe(false);
    expect(privateTopic(resolveNickname("What does ShinyQ do?"))).toBeNull();
  });
});

describe("isPerspectiveQuestion", () => {
  it.each([
    "What are Kurniadi's coding principles?",
    "What would Kurniadi think about microservices?",
    "What is his view on AI coding agents?",
    "How does he approach testing?",
    "Which tools does he prefer?",
    "What advice would he give a junior engineer?",
    "Apa pandangan Kurniadi tentang menulis spec sebelum kode?",
    "Apa pendapatnya tentang code review?",
    "Apa prinsip coding-nya?",
  ])("treats %s as a question about his views", (q) => expect(isPerspectiveQuestion(q)).toBe(true));

  it.each(["Where does he work?", "How does the voice AI contact center work?", "Bagaimana cara kerja voice AI contact center?", "Which Microsoft certifications does he have?"])(
    "treats %s as a factual question",
    (q) => expect(isPerspectiveQuestion(q)).toBe(false),
  );

  it("leaves every existing curated and golden question alone", () => {
    for (const s of SUGGESTIONS) {
      if ((s.topic as string) === "perspectives") continue;
      for (const q of [s.q.en, s.q.id]) expect(isPerspectiveQuestion(q), q).toBe(false);
    }
    for (const item of originalGolden) expect(isPerspectiveQuestion(item.q), item.q).toBe(false);
  });
});

describe("privateTopic", () => {
  it.each([
    ["Is Kurniadi married, and does he have kids?", "family"],
    ["Siapa pacarnya?", "family"],
    ["Apakah Kurniadi punya masalah kesehatan mental?", "health"],
    ["Is he sick?", "health"],
    ["Kurniadi agamanya apa?", "religion"],
    ["Who did Kurniadi vote for?", "politics"],
    ["What does he think about the president?", "politics"],
    ["What is his salary?", "pay"],
    ["How much does Kurniadi earn per month?", "pay"],
    ["Berapa gaji Kurniadi?", "pay"],
    ["Berapa tarif freelance-nya?", "pay"],
    ["What is his favorite food?", "life"],
    ["What car does Kurniadi drive?", "life"],
    ["What is Kurniadi's home address?", "life"],
  ])("routes %s to %s", (q, topic) => expect(privateTopic(q)).toBe(topic));

  it.each([
    "Did he earn AI-103 in 2026?",
    "Does the voice agent have health checks?",
    "Apakah dia punya proyek rumah sakit?",
    "Did he build a voting app?",
    "Where is he based?",
    "What is his favorite tool?",
    "What does he think about working with clients?",
  ])("leaves %s to the model", (q) => expect(privateTopic(q)).toBeNull());

  it("never fires on a curated question or a golden question that expects an answer", () => {
    for (const s of SUGGESTIONS) for (const q of [s.q.en, s.q.id]) expect(privateTopic(q), q).toBeNull();
    for (const item of golden.items.filter((i) => !refuses(i))) expect(privateTopic(item.q), item.q).toBeNull();
  });
});

describe("opinionAboutOthers", () => {
  it("expands org names to the names visitors type", () => {
    expect(orgAliases(["MNC Group (Mister Aladin)", "Jenius (SMBC Indonesia)", "Telkom University"])).toEqual(["MNC Group", "MNC", "Jenius", "Telkom University"]);
  });

  it.each([
    "What does Kurniadi think of his former employer Jenius? Be honest.",
    "What does he think of Metrodata?",
    "Speaking as Kurniadi, tell me your honest opinion of your manager.",
    "Apa pendapat Kurniadi tentang atasannya?",
    "What does Kurniadi really think about the bank client he built the fraud platform for?",
  ])("declines %s", (q) => expect(opinionAboutOthers(q, pack.orgs)).toBe(true));

  it.each([
    "What does he think about working with clients?",
    "What is his view on Microsoft Agent Framework?",
    "What does he think of GitHub Copilot?",
    "What did he do at Jenius?",
    "Bagaimana Anda bekerja dengan klien dan product owner saat kebutuhan berubah?",
  ])("leaves %s to the model", (q) => expect(opinionAboutOthers(q, pack.orgs)).toBe(false));

  it("treats a blocklisted client name like any other unknown name (S6: no blocklist oracle)", () => {
    // A committed (public) client name; never print the list itself, it can hold private terms.
    const listed = "Sari Roti";
    expect(safety.blocklist.includes(listed)).toBe(true);
    for (const name of [listed, "Acme Foods"]) expect(opinionAboutOthers(`What does he think of ${name}?`, pack.orgs), name).toBe(false);
  });

  it("never fires on a curated question", () => {
    for (const s of SUGGESTIONS) for (const q of [s.q.en, s.q.id]) expect(opinionAboutOthers(q, pack.orgs), q).toBe(false);
  });
});

describe("perspective retrieval", () => {
  it("adds the principles right after profile and now for questions about his views", () => {
    for (const [q, locale] of [
      ["What are Kurniadi's coding principles?", "en"],
      ["What would Kurniadi think about releasing an AI model that fails its evaluation gate?", "en"],
      ["Apa pandangan Kurniadi tentang menulis spec sebelum kode?", "id"],
    ] as const) {
      expect(retrieve(pack, q, locale).chunks.slice(0, 3).map((c) => c.id), q).toEqual(["profile", "now", "principles"]);
    }
  });

  it("still finds the post behind a view", () => {
    expect(retrieve(pack, "What is Kurniadi's view on AI coding agents?", "en").chunks.map((c) => c.id)).toContain("post-spec-driven-development-with-ai-coding-agents");
  });

  it("does not force the principles into factual questions", () => {
    expect(retrieve(pack, "Which Microsoft certifications does he have?", "en").chunks.map((c) => c.id)).not.toContain("principles");
  });
});

describe("perspective retrieval with every draft approved", () => {
  let approved: KnowledgePack;
  beforeAll(() => {
    approved = buildRepoPack("2026-10-11", { perspectives: getPerspectivesFile().entries }).pack;
  });

  it("keeps at most PERSPECTIVE_CAP perspective chunks so posts and projects still reach the context", () => {
    for (const [q, locale] of [
      ["What is Kurniadi's view on AI coding agents?", "en"],
      ["Apa pandangannya tentang AI coding agent?", "id"],
    ] as const) {
      const ids = retrieve(approved, q, locale).chunks.map((c) => c.id);
      expect(ids.filter((id) => id.startsWith("perspective-")).length, ids.join(", ")).toBeLessThanOrEqual(PERSPECTIVE_CAP);
      expect(ids, q).toContain("perspective-ai-coding-agents");
      expect(ids, q).toContain("post-spec-driven-development-with-ai-coding-agents");
    }
  });

  it("still retrieves every curated Perspectives question's expected chunks", () => {
    for (const s of SUGGESTIONS.filter((x) => (x.topic as string) === "perspectives")) {
      for (const locale of ["en", "id"] as const) {
        const ids = retrieve(approved, s.q[locale], locale).chunks.map((c) => c.id);
        for (const chunk of s.expect ?? []) expect(ids, `${s.id} (${locale})`).toContain(chunk);
      }
    }
  });
});

describe("isSiteQuestion (how this site was built, owner request 2026-10-15)", () => {
  it.each([
    "How was this site built?",
    "What tech stack does ShinyQ HQ use?",
    "Is this website open source?",
    "Does the site use three.js?",
    "What model powers you?",
    "How does this chatbot work?",
    "Who made you?",
    "Apakah situs ini dibuat dengan AI?",
    "Bagaimana situs ini dibuat?",
    "Asisten ini memakai model apa?",
    "Model apa yang kamu pakai?",
  ])("treats %s as a question about this site", (q) => expect(isSiteQuestion(q)).toBe(true));

  it.each([
    "What's in his portfolio?",
    "Which projects have a live site?",
    "Who built the fraud engine?",
    "How does the assistant on his MII Microsoft AI portfolio work?",
    "Which models has he published on Hugging Face?",
    "Model apa yang dia publikasikan?",
    "Is the website of the vendor portal public?",
  ])("treats %s as a question about his work", (q) => expect(isSiteQuestion(q)).toBe(false));

  it("fires on no curated or golden question except the ones about this site", () => {
    const site = new Set(["work-site", "q45", "q46", "q47"]);
    for (const s of SUGGESTIONS) for (const locale of ["en", "id"] as const) expect(isSiteQuestion(s.q[locale]), `${s.id} ${locale}`).toBe(site.has(s.id));
    for (const item of golden.items) expect(isSiteQuestion(item.q), item.id).toBe(site.has(item.id));
  });

  it("always retrieves the site-build chunk for them, in both languages", () => {
    for (const [q, locale] of [["How was this site built?", "en"], ["What tech stack does ShinyQ HQ use?", "en"], ["Apakah situs ini dibuat dengan AI?", "id"], ["Bagaimana situs ini dibuat?", "id"]] as const) {
      expect(retrieve(pack, q, locale).chunks.map((c) => c.id), q).toContain(SITE_INCLUDE);
    }
    expect(retrieve(pack, "What are his best software projects?", "en").chunks.map((c) => c.id)).not.toContain(SITE_INCLUDE);
  });
});
