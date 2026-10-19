import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { estimateNeurons, NEURONS_PER_CALL, PRIMARY_NEURON_BUDGET, sliceItems, SMOKE_GOLDEN, SMOKE_REDTEAM } from "../../scripts/ask-eval";
import golden from "../ask/golden.json";
import redteam from "../ask/redteam.json";

/** Eval neuron budget (owner decision 2026-10-19): evals use under 20% of the 10,000 free daily Workers AI neurons. */

describe("eval neuron budget", () => {
  it("keeps the smoke set at 20 existing items, inside the primary budget", () => {
    expect(SMOKE_GOLDEN.length + SMOKE_REDTEAM.length).toBe(20);
    for (const id of SMOKE_GOLDEN) expect(golden.items.some((i) => i.id === id), id).toBe(true);
    for (const id of SMOKE_REDTEAM) expect(redteam.items.some((i) => i.id === id), id).toBe(true);
    expect(estimateNeurons(20).neurons).toBeLessThanOrEqual(PRIMARY_NEURON_BUDGET);
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

  it("runs the nightly sets on the Groq backup models of wrangler.toml and only the smoke set on Workers AI", () => {
    const workflow = readFileSync(".github/workflows/ask-eval.yml", "utf8");
    const models = /ASK_BACKUP_MODELS = "([^"]+)"/.exec(readFileSync("wrangler.toml", "utf8"))![1].split(",");
    expect(workflow).toContain(`EVAL_GROQ_FIRST: ${models[0]}`);
    expect(workflow).toContain(`EVAL_GROQ_SECOND: ${models[1]}`);
    const runs = [...workflow.matchAll(/run: bun scripts\/ask-eval\.ts (.+)/g)].map((m) => m[1]);
    expect(runs).toEqual(["smoke", 'golden --groq "$EVAL_GROQ_FIRST"', 'suggestions --groq "$EVAL_GROQ_SECOND" --slice day/7', 'redteam --groq "$EVAL_GROQ_SECOND"']);
  });
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
