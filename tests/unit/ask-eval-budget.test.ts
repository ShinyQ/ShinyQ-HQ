import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { estimateNeurons, NEURONS_PER_CALL, PRIMARY_NEURON_BUDGET, sliceItems, SMOKE_GOLDEN, SMOKE_REDTEAM } from "../../scripts/ask-eval";
import golden from "../ask/golden.json";
import redteam from "../ask/redteam.json";

/** Eval neuron budget (owner decision 2026-10-19): evals use under 20% of the 10,000 free daily Workers AI neurons. */

describe("eval neuron budget", () => {
  it("keeps the smoke set at 21 existing items, inside the primary budget", () => {
    expect(SMOKE_GOLDEN.length + SMOKE_REDTEAM.length).toBe(21);
    for (const id of SMOKE_GOLDEN) expect(golden.items.some((i) => i.id === id), id).toBe(true);
    for (const id of SMOKE_REDTEAM) expect(redteam.items.some((i) => i.id === id), id).toBe(true);
    expect(estimateNeurons(21).neurons).toBeLessThanOrEqual(PRIMARY_NEURON_BUDGET);
    expect(PRIMARY_NEURON_BUDGET).toBe(2000);
    expect(estimateNeurons(3)).toEqual({ calls: 3, neurons: 3 * NEURONS_PER_CALL, share: (3 * NEURONS_PER_CALL) / 10_000 });
  });

  it("covers Rover's voice, adjacent questions and persona in the smoke set", () => {
    for (const id of ["q79", "q80", "q81", "q84", "q86", "q87"]) expect(SMOKE_GOLDEN).toContain(id);
    expect(SMOKE_REDTEAM).toContain("rt46");
  });

  it("slices items for the nightly rotation", () => {
    const items = Array.from({ length: 10 }, (_, i) => i);
    expect(sliceItems(items, undefined)).toEqual(items);
    expect(sliceItems(items, "1/3")).toEqual([0, 3, 6, 9]);
    expect(sliceItems(items, "3/3")).toEqual([2, 5, 8]);
    // 2026-01-01 is day 1 of the year: 1 % 7 + 1 = slice 2.
    expect(sliceItems(items, "day/7", new Date("2026-01-01T12:00:00Z"))).toEqual([1, 8]);
    const week = Array.from({ length: 7 }, (_, d) => sliceItems(items, "day/7", new Date(Date.UTC(2026, 9, 19 + d))));
    expect(week.flat().sort((a, b) => a - b)).toEqual(items);
    expect(() => sliceItems(items, "4/3")).toThrow();
    expect(() => sliceItems(items, "x")).toThrow();
  });

  it("runs the bulk on Groq models production never uses, the fidelity set on the backup and only the smoke set on Workers AI", () => {
    const workflow = readFileSync(".github/workflows/ask-eval.yml", "utf8");
    const production = /ASK_BACKUP_MODELS = "([^"]+)"/.exec(readFileSync("wrangler.toml", "utf8"))![1].split(",");
    const model = (name: string) => new RegExp(`${name}: (\\S+)`).exec(workflow)![1];
    expect(production).not.toContain(model("EVAL_GROQ_EVAL"));
    expect(production).not.toContain(model("EVAL_GROQ_STRESS"));
    expect(model("EVAL_GROQ_BACKUP")).toBe(production[0]);
    const runs = [...workflow.matchAll(/run: bun scripts\/ask-eval\.ts (.+)/g)].map((m) => m[1]);
    expect(runs).toEqual([
      "smoke",
      'golden --groq "$EVAL_GROQ_EVAL" --slice day/3',
      'suggestions --groq "$EVAL_GROQ_EVAL" --slice day/21',
      'redteam --groq "$EVAL_GROQ_STRESS"',
      'redteam --groq "$EVAL_GROQ_EVAL" --slice day/4',
      'fidelity --groq "$EVAL_GROQ_BACKUP"',
    ]);
    // The eval model's runs follow each other: golden, then the pills, then the red team (one per-minute limit).
    expect(workflow).toMatch(/suggestions:\n[^\n]*\n(?:\s+#[^\n]*\n)*\s+needs: golden\n/);
    expect(workflow).toMatch(/redteam:\n[^\n]*\n(?:\s+#[^\n]*\n)*\s+needs: suggestions\n/);
  });

  it("keeps the eval model's worst night of the 84-day rotation under 80% of its daily tokens", async () => {
    const { buildRepoPack, loadDynamicFacts } = await import("@/ask/repo-pack");
    const { resolveGoldenItem } = await import("@/ask/golden-facts");
    const { packVocabulary } = await import("../../functions/_lib/pipeline");
    const { countModelCalls, suggestionItems, planGroqTokens, GROQ_BUDGET_SHARE, FIDELITY_GOLDEN } = await import("../../scripts/ask-eval");
    const { pack } = buildRepoPack();
    const deps = { pack, vocabulary: packVocabulary(pack) };
    const facts = loadDynamicFacts();
    const g = golden.items.map((i) => resolveGoldenItem(i as Parameters<typeof resolveGoldenItem>[0], facts));
    const pills = suggestionItems().map((i) => resolveGoldenItem(i, facts));
    let worst = 0;
    for (let d = 0; d < 84; d++) {
      const day = new Date(Date.UTC(2026, 9, 20 + d));
      const calls =
        (await countModelCalls(sliceItems(g, "day/3", day) as never, deps)) +
        (await countModelCalls(sliceItems(pills, "day/21", day) as never, deps)) +
        (await countModelCalls(sliceItems(redteam.items as never[], "day/4", day), deps));
      worst = Math.max(worst, calls);
    }
    expect(planGroqTokens(worst).share).toBeLessThanOrEqual(GROQ_BUDGET_SHARE);
    expect(planGroqTokens(await countModelCalls(redteam.items as never, deps)).share).toBeLessThanOrEqual(GROQ_BUDGET_SHARE);
    expect(planGroqTokens(await countModelCalls(golden.items.filter((i) => (FIDELITY_GOLDEN as readonly string[]).includes(i.id)) as never, deps)).share).toBeLessThanOrEqual(0.2);
  }, 180_000);
});

describe("owner-review samples (scripts/ask-samples.ts)", () => {
  it("holds the 10 agreed samples in EN and ID", async () => {
    const { SAMPLES } = await import("../../scripts/ask-samples");
    expect(SAMPLES).toHaveLength(10);
    const count = (kind: string) => SAMPLES.filter((s) => s.kind.startsWith(kind)).length;
    expect(count("Rover voice")).toBe(4);
    expect(count("Adjacent grounded")).toBe(3);
    expect(count("Adjacent unsupported")).toBe(1);
    expect(count("Decline")).toBe(2);
    expect(new Set(SAMPLES.map((s) => s.lang))).toEqual(new Set(["en", "id"]));
  });
});

describe("golden scoring on Groq slices", () => {
  it("keeps the full set's allowed misses for a slice", async () => {
    const { goldenThreshold } = await import("../../scripts/ask-eval");
    expect(goldenThreshold(91, 91, 88)).toBe(88);
    expect(goldenThreshold(46, 91, 88)).toBe(43);
    expect(goldenThreshold(2, 91, 88)).toBe(0);
    expect(goldenThreshold(10, 10)).toBe(10);
  });

  it("checks the language of Indonesian answers, not of short fragments", async () => {
    const { scoreGolden } = await import("../../scripts/ask-eval");
    const item = { id: "x", lang: "id" as const, q: "Di mana dia tinggal?", facts: [], expect: { any: ["jakarta"] } };
    expect(scoreGolden("Jakarta, Indonesia.", item).pass).toBe(true);
    expect(scoreGolden("He lives in Jakarta and works at Metrodata as a consultant.", item).notes).toContain("not Indonesian");
  });
});

describe("model-agnostic golden assertions (2026-10-20)", () => {
  it("does not flag a list of English product names as the wrong language", async () => {
    const { scoreGolden } = await import("../../scripts/ask-eval");
    const q05 = golden.items.find((i) => i.id === "q05") as never;
    const list = "Microsoft Certified: Azure AI Apps and Agents Developer Associate (AI-103) - 2026-09 Microsoft Certified: Azure AI Fundamentals (AI-901) - 2026-05 Microsoft Certified: Azure Fundamentals (AZ-900)";
    expect(scoreGolden(list, q05).pass).toBe(true);
    expect(scoreGolden("He has the AI-103 and AZ-900 certifications from Microsoft, which he earned this year.", q05).notes).toContain("not Indonesian");
  });

  it("accepts q03 with the relative drop or with the absolute rates", async () => {
    const { scoreGolden } = await import("../../scripts/ask-eval");
    const q03 = golden.items.find((i) => i.id === "q03") as never;
    expect(scoreGolden("Pada proyek itu, false positive rate turun dari 36,4% menjadi 9,1% di gold set.", q03).pass).toBe(true);
    expect(scoreGolden("Pada proyek itu, false positive turun 90,9% dari 36,4% di gold set.", q03).pass).toBe(true);
    expect(scoreGolden("Pada proyek itu, false positive turun banyak di gold set.", q03).pass).toBe(false);
  });
});
