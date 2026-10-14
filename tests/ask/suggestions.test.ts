import { beforeAll, describe, expect, it } from "vitest";
import { ASK_MAX_QUESTION, ASK_TAGS } from "@/ask/protocol";
import { hardCodedFacts, resolveGoldenItem } from "@/ask/golden-facts";
import { buildRepoPack, loadDynamicFacts } from "@/ask/repo-pack";
import { ASK_TOPICS, matchSuggestion, pickFollowUps, SUGGESTIONS, TOPIC_SIZE, topicQuestions, type Suggestion } from "@/ask/suggestions";
import { getContent } from "@/content/load";
import { findBlockedLabels, FORBIDDEN_PATTERNS } from "@/content/safety";
import { orderPods } from "@/content/selectors";
import { retrieve } from "../../functions/_lib/retrieve";
import type { KnowledgePack, SafetyData } from "../../functions/_lib/types";
import { scoreSuggestion, suggestionItems } from "../../scripts/ask-eval";

let pack: KnowledgePack;
let safety: SafetyData;

beforeAll(() => {
  ({ pack, safety } = buildRepoPack("2026-10-11"));
});

const ids = new Set(SUGGESTIONS.map((s) => s.id));
const hit = (chunkIds: string[], expected: string) => (expected.endsWith("*") ? chunkIds.some((id) => id.startsWith(expected.slice(0, -1))) : chunkIds.includes(expected));

describe("curated question bank (content/ask/suggestions.json)", () => {
  it("offers a Perspectives topic of 4 to 6 questions, each grounded in his written sources", () => {
    const perspectives = SUGGESTIONS.filter((s) => s.topic === "perspectives");
    expect(perspectives.length).toBeGreaterThanOrEqual(4);
    expect(perspectives.length).toBeLessThanOrEqual(6);
    for (const s of perspectives) {
      expect(s.tags, s.id).toContain("perspectives");
      expect((s.expect ?? []).some((chunk) => /^(principles|perspective-|post-|talk-)/.test(chunk)), s.id).toBe(true);
    }
  });

  it("has about 30 well-formed bilingual questions with unique ids", () => {
    expect(SUGGESTIONS.length).toBeGreaterThanOrEqual(28);
    expect(ids.size).toBe(SUGGESTIONS.length);
    for (const s of SUGGESTIONS) {
      expect(ASK_TOPICS, s.id).toContain(s.topic);
      for (const locale of ["en", "id"] as const) {
        expect(s.q[locale].trim().length, `${s.id} ${locale}`).toBeGreaterThan(8);
        expect(s.q[locale].length).toBeLessThanOrEqual(ASK_MAX_QUESTION);
      }
      expect(s.q.en).not.toBe(s.q.id);
      expect(s.tags.length, s.id).toBeGreaterThan(0);
      for (const tag of s.tags) expect(ASK_TAGS, `${s.id} tag ${tag}`).toContain(tag);
      expect(s.expect?.length, `${s.id} expect`).toBeGreaterThan(0);
    }
  });

  it("gives every topic enough questions and every question valid follow-ups", () => {
    for (const topic of ASK_TOPICS) expect(SUGGESTIONS.filter((s) => s.topic === topic).length, topic).toBeGreaterThanOrEqual(TOPIC_SIZE + 1);
    for (const s of SUGGESTIONS) {
      expect(s.followUps?.length ?? 0, s.id).toBeGreaterThanOrEqual(2);
      for (const id of s.followUps ?? []) {
        expect(ids.has(id), `${s.id} -> ${id}`).toBe(true);
        expect(id).not.toBe(s.id);
      }
    }
  });

  it("asks about projects in site order within each topic (gallery first, orderPods)", () => {
    const rank = new Map(orderPods(getContent().floors.labs.pods).map((pod, i) => [`project-${pod.slug}`, i]));
    for (const topic of ASK_TOPICS) {
      const seen: string[] = [];
      for (const s of SUGGESTIONS.filter((q) => q.topic === topic)) {
        for (const chunk of s.expect ?? []) if (rank.has(chunk) && !seen.includes(chunk)) seen.push(chunk);
      }
      const ranks = seen.map((chunk) => rank.get(chunk)!);
      expect(ranks, `${topic}: ${seen.join(", ")}`).toEqual([...ranks].sort((a, b) => a - b));
    }
  });

  it("passes the public-safety lint (no client names, em dashes, money or personal data)", () => {
    const text = SUGGESTIONS.flatMap((s) => [s.q.en, s.q.id]).join("\n");
    expect(findBlockedLabels(text, safety.blocklist)).toEqual([]);
    for (const { name, pattern } of FORBIDDEN_PATTERNS) expect(text, name).not.toMatch(pattern);
  });

  // Quality gate: no pill may lead to "I don't know". The nightly eval checks the real answers.
  it.each(SUGGESTIONS.flatMap((s) => (["en", "id"] as const).map((locale) => [s.id, locale, s] as const)))("%s (%s) retrieves its expected chunks", (_id, locale, s: Suggestion) => {
    const chunkIds = retrieve(pack, s.q[locale], locale).chunks.map((c) => c.id);
    for (const expected of s.expect ?? []) expect(hit(chunkIds, expected), `${expected} in ${chunkIds.join(", ")}`).toBe(true);
  });
});

describe("pill logic", () => {
  const list: Suggestion[] = [
    { id: "w1", topic: "work", q: { en: "Work one?", id: "Karya satu?" }, tags: ["work"], followUps: ["w2", "a1"] },
    { id: "w2", topic: "work", q: { en: "Work two?", id: "Karya dua?" }, tags: ["work", "software"] },
    { id: "a1", topic: "ai", q: { en: "AI one?", id: "AI satu?" }, tags: ["ai", "voice"] },
    { id: "a2", topic: "ai", q: { en: "AI two?", id: "AI dua?" }, tags: ["ai", "fraud", "voice"] },
    { id: "c1", topic: "career", q: { en: "Career one?", id: "Karier satu?" }, tags: ["career"] },
    { id: "k1", topic: "contact", q: { en: "Contact one?", id: "Kontak satu?" }, tags: ["contact"] },
  ];

  it("expands a topic into its first unasked questions", () => {
    expect(topicQuestions("ai", new Set(), list).map((s) => s.id)).toEqual(["a1", "a2"]);
    expect(topicQuestions("ai", new Set(["a1"]), list).map((s) => s.id)).toEqual(["a2"]);
    expect(topicQuestions("ai", new Set(["a1", "a2"]), list).map((s) => s.id)).toEqual(["a1", "a2"]);
    expect(topicQuestions("work", new Set(), SUGGESTIONS)).toHaveLength(TOPIC_SIZE);
  });

  it("uses the answered question's own follow-ups first, then tags, then other topics", () => {
    expect(pickFollowUps({ answered: "w1", list }).map((s) => s.id)).toEqual(["w2", "a1", "c1"]);
    expect(pickFollowUps({ answered: "w1", asked: new Set(["w2"]), list }).map((s) => s.id)).toEqual(["a1", "c1", "k1"]);
    expect(pickFollowUps({ tags: ["voice", "fraud"], list }).map((s) => s.id)).toEqual(["a2", "a1", "w1"]);
    expect(pickFollowUps({ tags: ["voice"], asked: new Set(["a1"]), list }).map((s) => s.id)).toEqual(["a2", "w1", "c1"]);
    expect(pickFollowUps({ list }).map((s) => s.id)).toEqual(["w1", "a1", "c1"]);
  });

  it("is deterministic and never repeats the answered or asked questions", () => {
    for (const s of SUGGESTIONS) {
      const asked = new Set([s.id]);
      const first = pickFollowUps({ answered: s.id, tags: s.tags, asked });
      expect(first.map((f) => f.id)).toEqual(pickFollowUps({ answered: s.id, tags: s.tags, asked }).map((f) => f.id));
      expect(first.length).toBeGreaterThanOrEqual(2);
      expect(first.length).toBeLessThanOrEqual(3);
      expect(first.some((f) => f.id === s.id)).toBe(false);
    }
  });

  it("recognizes a typed or palette question as a curated one in either language", () => {
    expect(matchSuggestion("  how can I CONTACT him ")?.id).toBe("contact-reach");
    expect(matchSuggestion("Bagaimana cara menghubunginya?")?.id).toBe("contact-reach");
    expect(matchSuggestion("Something else entirely")).toBeUndefined();
    expect(matchSuggestion("")).toBeUndefined();
  });
});

describe("nightly eval of the bank (scripts/ask-eval.ts suggestions)", () => {
  it("asks every pill in both languages and resolves live-fact placeholders", () => {
    const facts = loadDynamicFacts();
    const items = suggestionItems().map((i) => resolveGoldenItem(i, facts));
    expect(items).toHaveLength(SUGGESTIONS.length * 2);
    const models = items.find((i) => i.id === "ai-models:en")!;
    expect(models.expect.any).toContain(`${facts.huggingface?.models} model`);
    expect(hardCodedFacts(JSON.stringify(SUGGESTIONS), facts)).toEqual([]);
  });

  it("passes only real answers in the asked language", () => {
    const [en, id] = suggestionItems().filter((i) => i.id.startsWith("contact-reach:"));
    expect(scoreSuggestion({ outcome: "answer", text: "Email him or use LinkedIn." }, en).pass).toBe(true);
    expect(scoreSuggestion({ outcome: "unknown", text: "I don't have that information on this site." }, en).notes).toContain("outcome unknown");
    expect(scoreSuggestion({ outcome: "answer", text: "Email him or use LinkedIn." }, id).notes).toContain("not Indonesian");
    expect(scoreSuggestion({ outcome: "answer", text: "Anda bisa menghubungi dia lewat email dan LinkedIn yang ada di situs." }, id).pass).toBe(true);
  });
});
