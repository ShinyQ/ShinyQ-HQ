import { beforeAll, describe, expect, it } from "vitest";
import { buildRepoPack } from "@/ask/repo-pack";
import { getPerspectivesFile } from "@/content/load";
import { SUGGESTIONS } from "@/ask/suggestions";
import { OPINION_PERSPECTIVE_CAP, retrieve, SITE_INCLUDE } from "../../functions/_lib/retrieve";
import { civicQuestion, isGeneralAssistantRequest, isLeadQuestion, isMentoringQuestion, isOffTopic, isPerspectiveQuestion, isSiteQuestion, isTeamQuestion, maskPoliticians, namesPerson, opinionAboutOthers, nicknameForModel, orgAliases, partitionQuestion, privateTopic, resolveNickname, splitClauses } from "../../functions/_lib/scope";
import { indexPack } from "../../functions/_lib/pack-index";
import type { KnowledgePack } from "../../functions/_lib/types";
import golden from "./golden.json";

let pack: KnowledgePack;

beforeAll(() => {
  ({ pack } = buildRepoPack("2026-10-11"));
});

const originalGolden = golden.items.filter((i) => Number(i.id.slice(1)) <= 32);
const refuses = (item: (typeof golden.items)[number]) => (item.expect as { refuse?: boolean }).refuse === true;

describe("resolveNickname (owner 2026-10-16: ShinyQ is Kurniadi's nickname)", () => {
  it.each([
    ["Who is ShinyQ?", "Who is Kurniadi?", "Who is Kurniadi (ShinyQ)?"],
    ["what does shinyq do", "what does Kurniadi do", "what does Kurniadi (shinyq) do"],
    ["Apa itu ShinyQ?", "Apa itu Kurniadi?", "Apa itu Kurniadi (ShinyQ)?"],
    ["Is Shiny Q open to freelance work?", "Is Kurniadi open to freelance work?", "Is Kurniadi (Shiny Q) open to freelance work?"],
    ["Siapa Shiny-Q?", "Siapa Kurniadi?", "Siapa Kurniadi (Shiny-Q)?"],
    ["ShinyQ's projects", "Kurniadi's projects", "Kurniadi's (ShinyQ) projects"],
    ["What does ShinyQ mean?", "What does Kurniadi mean?", "What does Kurniadi (ShinyQ) mean?"],
  ])("%s", (q, plain, forModel) => {
    expect(resolveNickname(q)).toBe(plain);
    expect(nicknameForModel(q)).toBe(forModel);
  });

  it.each(["How was ShinyQ HQ built?", "What stack does ShinyQ-HQ use?", "Shiny Q HQ hosting?", "github.com/ShinyQ/ShinyQ-HQ", "Is @ShinyQ his handle?"])("keeps the site name: %s", (q) => {
    expect(resolveNickname(q)).toBe(q);
    expect(nicknameForModel(q)).toBe(q);
    expect(isSiteQuestion(resolveNickname(q))).toBe(isSiteQuestion(q));
  });

  it("retrieves the same chunks for the nickname as for his name", () => {
    for (const [nick, name] of [
      ["Who is ShinyQ?", "Who is Kurniadi?"],
      ["What projects has ShinyQ built?", "What projects has Kurniadi built?"],
      ["Where does ShinyQ work?", "Where does Kurniadi work?"],
      ["ShinyQ's certifications?", "Kurniadi's certifications?"],
    ]) {
      expect(retrieve(pack, resolveNickname(nick), "en").chunks.map((c) => c.id)).toEqual(retrieve(pack, name, "en").chunks.map((c) => c.id));
    }
  });

  it("routes nickname questions like questions about him", () => {
    expect(isGeneralAssistantRequest(resolveNickname("Who is ShinyQ?"))).toBe(false);
    expect(privateTopic(resolveNickname("What does ShinyQ do?"))).toBeNull();
    expect(isLeadQuestion(resolveNickname("Can ShinyQ build a chatbot for our company?"))).toBe(true);
    expect(opinionAboutOthers(resolveNickname("What does ShinyQ think of Jenius?"), ["Jenius"])).toBe(true);
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
      // Perspectives and About me pills are answered from his written views.
      if (s.topic === "perspectives" || s.topic === "about") continue;
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
    ["What car does Kurniadi drive?", "life"],
    ["What is Kurniadi's home address?", "life"],
    ["Rate the president of Indonesia's leadership.", "politics"],
    ["What do you think about Prabowo?", "politics"],
    ["Which party does he support?", "politics"],
    ["Is he healthy?", "health"],
    ["How old is he?", "life"],
    ["Berapa umurnya?", "life"],
  ])("routes %s to %s", (q, topic) => expect(privateTopic(q)).toBe(topic));

  it.each([
    "Did he earn AI-103 in 2026?",
    "Does the voice agent have health checks?",
    "Apakah dia punya proyek rumah sakit?",
    "What did Kurniadi build for a consumer health company?",
    "Apa proyek dia untuk perusahaan consumer health?",
    "Did he build a voting app?",
    "Where is he based?",
    "What is his favorite tool?",
    "What does he think about working with clients?",
    // The settings panel is "Pengaturan" in Indonesian: a question about this site is never policy.
    "Pengaturan apa saja yang ada di situs ini?",
    // SOFT topic words (owner decision 2026-10-24): answered from his written views, never declined on the word alone.
    "What is his political view?",
    "Apa pandangan politik Kurniadi?",
    "I love this site! What does he think about the government tax policy?",
    "What does he think about the president's AI plans?",
    "How does he feel about AI regulation in Indonesia's parliament (DPR)?",
    "Has he built anything for healthcare or consumer health?",
    "How is the health of Indonesia's tech ecosystem?",
    "Does he work with health data?",
    "How old is his oldest project?",
    "What is his favorite food?",
    "Does he use third-party APIs?",
    "Does his CV screening platform rank candidates?",
    "Apa isi panel Pengaturan situs ini?",
    "What settings can I change on this site?",
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
    "What does he think of his former manager?",
    "Apa pendapat Kurniadi tentang mantan atasannya?",
    "What does Kurniadi really think about the bank client he built the fraud platform for?",
  ])("declines %s", (q) => expect(opinionAboutOthers(q, pack.orgs)).toBe(true));

  it.each([
    "What does he think about working with clients?",
    "What is his view on Microsoft Agent Framework?",
    "What does he think of GitHub Copilot?",
    "What did he do at Jenius?",
    "Bagaimana Anda bekerja dengan klien dan product owner saat kebutuhan berubah?",
    // His current manager, team and clients in general go to the team route (owner decision 2026-10-24).
    "What does he think about his manager?",
    "Apa pendapat Kurniadi tentang atasannya?",
    "What does he think about his clients?",
  ])("leaves %s to the model", (q) => expect(opinionAboutOthers(q, pack.orgs)).toBe(false));

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

  it("keeps at most OPINION_PERSPECTIVE_CAP perspective chunks so posts and projects still reach the context", () => {
    for (const [q, locale] of [
      ["What is Kurniadi's view on AI coding agents?", "en"],
      ["Apa pandangannya tentang AI coding agent?", "id"],
    ] as const) {
      const ids = retrieve(approved, q, locale).chunks.map((c) => c.id);
      expect(ids.filter((id) => id.startsWith("perspective-")).length, ids.join(", ")).toBeLessThanOrEqual(OPINION_PERSPECTIVE_CAP);
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

  it("treats questions about the Engine Room or a secret floor as site questions (EN and ID)", () => {
    for (const q of ["What is the Engine Room?", "What is in the B1 Engine Room?", "Is there a hidden floor?", "Apa itu ruang mesin?", "Apakah ada lantai rahasia?"]) expect(isSiteQuestion(q), q).toBe(true);
    expect(isSiteQuestion("Did Kurniadi work in an engine factory?")).toBe(false);
  });

  it.each(["What is the Agent Office?", "Is the agent office live?", "Apa itu Agent Office?", "Apakah kantor agen itu langsung?", "What does Kurniadi's agent office show?", "Tell me about Agent Office"])("treats %s as a site question", (q) => {
    expect(isSiteQuestion(q)).toBe(true);
  });

  it.each([
    "Did Kurniadi ever work at a travel agent office?",
    "Is there an insurance agent office near his workplace?",
    "Did he build an app for a Travel Agent Office?",
    "Was the agent office of the insurer one of his clients?",
    "Apakah Kurniadi pernah membuat aplikasi untuk kantor agen asuransi?",
    "Apakah dia pernah kerja di kantor agen properti atau kantor agen perjalanan?",
  ])("does not treat the business sense in %s as the office (EN and ID)", (q) => expect(isSiteQuestion(q)).toBe(false));

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
    const site = new Set(["q45", "q46", "q47", "q69", "q70", "q76", "q92", "q93"]);
    for (const s of SUGGESTIONS) for (const locale of ["en", "id"] as const) expect(isSiteQuestion(s.q[locale]), `${s.id} ${locale}`).toBe(s.topic === "site");
    for (const item of golden.items) expect(isSiteQuestion(item.q), item.id).toBe(site.has(item.id));
  });

  it("always retrieves the site-build chunk for them, in both languages", () => {
    for (const [q, locale] of [["How was this site built?", "en"], ["What tech stack does ShinyQ HQ use?", "en"], ["Apakah situs ini dibuat dengan AI?", "id"], ["Bagaimana situs ini dibuat?", "id"]] as const) {
      expect(retrieve(pack, q, locale).chunks.map((c) => c.id), q).toContain(SITE_INCLUDE);
    }
    expect(retrieve(pack, "What are his best software projects?", "en").chunks.map((c) => c.id)).not.toContain(SITE_INCLUDE);
  });
});

describe("answerable instead of refused (owner decision 2026-10-24)", () => {
  const known = (t: string) => indexPack(pack).df.has(t);

  it("splits a mixed question into its own questions and keeps fragments with the clause before them", () => {
    expect(splitClauses("What's his view on AI jobs and is he religious?")).toEqual(["What's his view on AI jobs", "is he religious"]);
    expect(splitClauses("What are his hobbies and his salary?")).toEqual(["What are his hobbies", "his salary"]);
    expect(splitClauses("What does he think about AI and jobs?")).toEqual(["What does he think about AI and jobs"]);
    expect(splitClauses("What salary would he expect? Give a number.")).toEqual(["What salary would he expect and Give a number."]);
  });

  it("keeps the answerable clauses and lists the declined topics", () => {
    expect(partitionQuestion("Is he married and what does he do at Metrodata?", known)).toEqual({ answerable: "what does he do at Metrodata?", declined: ["family"] });
    expect(partitionQuestion("Is Kurniadi married, and does he have kids?", known)).toEqual({ declined: ["family"] });
    expect(partitionQuestion("Who did he vote for, and which party does he support?", known)).toEqual({ declined: ["politics"] });
    expect(partitionQuestion("What are his projects?", known)).toEqual({ answerable: "What are his projects?", declined: [] });
  });

  it("answers a policy named with a politician and declines the opinion of the person", () => {
    expect(maskPoliticians("What does he think about Prabowo's AI policy?")).toBe("What does he think about the government's AI policy?");
    expect(partitionQuestion("What does he think about Prabowo's AI policy?", known)).toEqual({ answerable: "What does he think about the government's AI policy?", declined: ["politics"] });
    expect(partitionQuestion("What does he think about Prabowo?", known)).toEqual({ declined: ["politics"] });
  });

  it.each([
    "What is his political view?",
    "Apa pandangan politik Kurniadi?",
    "Is he left or right leaning?",
    "What does he think about the president's AI plans?",
    "How does he feel about AI regulation in Indonesia's parliament (DPR)?",
    "What's his view on fuel subsidy policy?",
  ])("routes %s to the civic route", (q) => {
    expect(privateTopic(q)).toBeNull();
    expect(civicQuestion(q)).toBe(true);
  });

  it.each(["What should governments use AI for?", "Did he build anything for the government?", "What settings can I change on this site?", "Pengaturan apa saja yang ada di situs ini?"])("keeps %s off the civic route", (q) =>
    expect(civicQuestion(q)).toBe(false),
  );

  it.each([
    "How do I learn machine learning?",
    "How do I become an AI engineer like him?",
    "What should I study to get into AI?",
    "Should students use ChatGPT for homework?",
    "Bagaimana cara saya belajar AI seperti dia?",
    "Any advice for students who want to get into AI?",
  ])("answers %s from his own path", (q) => {
    expect(isMentoringQuestion(q)).toBe(true);
    expect(isGeneralAssistantRequest(q)).toBe(false);
  });

  it.each(["How do I learn guitar?", "How do I learn Rust?", "Explain how transformers work in machine learning.", "How do I build a RAG chatbot step by step?", "Teach me Python", "Help me with my homework", "Can you review my CV?"])(
    "keeps %s declined as general-assistant work",
    (q) => {
      expect(isMentoringQuestion(q)).toBe(false);
      expect(isGeneralAssistantRequest(q)).toBe(true);
    },
  );

  it("answers his manager, team and clients in general, never a named one", () => {
    for (const q of ["What does he think about his manager?", "How does he work with his team?", "Apa pendapat Kurniadi tentang atasannya?", "What does he think about his clients?"]) expect(isTeamQuestion(q), q).toBe(true);
    expect(opinionAboutOthers("What does he think of his former manager?", pack.orgs)).toBe(true);
    expect(opinionAboutOthers("What does he think of Jenius?", pack.orgs)).toBe(true);
  });

  it("declines opinions of people the pack never names, and leaves products he writes about to the model", () => {
    const vocabulary = indexPack(pack).vocabulary;
    expect(namesPerson("What does he think of Elon Musk?", vocabulary)).toBe(true);
    expect(namesPerson("What does he think about Sam Altman's views on AGI?", vocabulary)).toBe(true);
    for (const q of ["What does he think of OpenAI?", "What does he think about Microsoft Agent Framework?", "What does he think of GitHub Copilot?", "Elon Musk said what?"]) expect(namesPerson(q, vocabulary), q).toBe(false);
  });

  it.each(["What's the weather in Jakarta?", "Who won the World Cup 2022?", "What's the capital of France?", "Tell me a joke", "What's 25 times 4?", "Recommend a good restaurant in Jakarta", "What time is it?", "Jam berapa sekarang?", "Berapa 12 kali 3?"])(
    "redirects %s as off-topic",
    (q) => expect(isOffTopic(q)).toBe(true),
  );

  it.each(["Has he won any hackathons?", "Tell me a joke about this site", "Does he like coffee?", "What does he do on weekends?", "How many projects has he built?", "Which year did he join Metrodata?"])("keeps %s on topic", (q) =>
    expect(isOffTopic(q)).toBe(false),
  );

  it("never routes a curated pill off-topic, to the civic route or to a decline", () => {
    for (const s of SUGGESTIONS) for (const q of [s.q.en, s.q.id]) {
      expect(isOffTopic(q), q).toBe(false);
      expect(opinionAboutOthers(q, pack.orgs, indexPack(pack).vocabulary), q).toBe(false);
    }
  });
});
