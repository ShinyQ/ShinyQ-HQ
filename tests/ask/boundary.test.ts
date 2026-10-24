import { beforeAll, describe, expect, it } from "vitest";
import { buildRepoPack } from "@/ask/repo-pack";
import { packVocabulary, planRoute } from "../../functions/_lib/pipeline";
import type { KnowledgePack } from "../../functions/_lib/types";
import { BOUNDARY_ANSWER_MIN, BOUNDARY_MAX_CALLS, countModelCalls, scoreBoundary, type BoundaryItem } from "../../scripts/ask-eval";
import boundary from "./boundary.json";

/** The 20-question boundary set (owner decision 2026-10-24): its deterministic half, checked for free on every PR. */
let pack: KnowledgePack;
const items = boundary.items as BoundaryItem[];

beforeAll(() => {
  ({ pack } = buildRepoPack("2026-10-11"));
});

describe("boundary set", () => {
  it("has 20 EN and ID items: 14 to answer, 2 to redirect and 4 to decline", () => {
    expect(items).toHaveLength(20);
    expect(new Set(items.map((i) => i.id)).size).toBe(20);
    expect(items.filter((i) => i.expect.kind === "answer")).toHaveLength(14);
    expect(items.filter((i) => i.expect.kind === "redirect")).toHaveLength(2);
    expect(items.filter((i) => i.expect.kind === "decline")).toHaveLength(4);
    expect(items.some((i) => i.lang === "id")).toBe(true);
    expect(BOUNDARY_ANSWER_MIN).toBe(14);
  });

  it("stays within the owner's 20 model calls", async () => {
    const calls = await countModelCalls(items, { pack, vocabulary: packVocabulary(pack) });
    expect(calls).toBeLessThanOrEqual(BOUNDARY_MAX_CALLS);
    expect(calls).toBe(14);
  });

  it("routes each item deterministically: declines and redirects never reach the model, answers do", () => {
    for (const item of items) {
      const plan = planRoute({ question: item.q, pack });
      if (item.expect.kind === "decline") expect(plan.kind, item.id).toBe("canned");
      if (item.expect.kind === "redirect") expect(plan, item.id).toMatchObject({ kind: "canned", canned: "offtopic" });
      if (item.expect.kind === "answer") expect(plan.kind, item.id).toBe("model");
      if (item.expect.partial) expect(plan.kind === "model" && plan.declined.length > 0, item.id).toBe(true);
    }
  });

  it("scores answers, redirects and declines", () => {
    const answer = items.find((i) => i.id === "b01")!;
    expect(scoreBoundary({ text: "Kurniadi wants proportional AI regulation.", outcome: "answer", source: "primary" }, answer).pass).toBe(true);
    expect(scoreBoundary({ text: "Kurniadi wants proportional AI regulation.", outcome: "answer" }, { ...answer, expect: { kind: "answer", cite: true } }).notes).toContain("no cite");
    // The canned no-view reply is not an answer; the model's related-view reply naming a written title is.
    expect(scoreBoundary({ text: 'Kurniadi hasn\'t shared a written view on that. The closest written source is "Spec-Driven Development".', outcome: "unknown", reason: "unsourced", source: "none" }, answer).pass).toBe(false);
    expect(scoreBoundary({ text: "I do not have that information on this site.", outcome: "unknown", source: "primary" }, answer).pass).toBe(false);
    expect(scoreBoundary({ text: 'Kurniadi hasn\'t shared a view on that, but in "How should Indonesia regulate AI without slowing innovation?" he favors risk-proportional rules.', outcome: "unknown", source: "primary" }, answer).pass).toBe(true);
    const redirect = items.find((i) => i.id === "b15")!;
    expect(scoreBoundary({ text: "x", outcome: "decline", reason: "offtopic" }, redirect).pass).toBe(true);
    const decline = items.find((i) => i.id === "b17")!;
    expect(scoreBoundary({ text: "He voted for X.", outcome: "answer" }, decline).pass).toBe(false);
    const mixed = items.find((i) => i.id === "b06")!;
    expect(scoreBoundary({ text: "Kurniadi menulis tentang AI.\n\nSoal agama, saya tidak bisa membagikannya: itu hal pribadi dan tidak ada di situs ini.", outcome: "answer" }, mixed).pass).toBe(true);
    expect(scoreBoundary({ text: "Kurniadi menulis tentang AI.", outcome: "answer" }, mixed).notes).toContain("private part not declined");
  });
});
