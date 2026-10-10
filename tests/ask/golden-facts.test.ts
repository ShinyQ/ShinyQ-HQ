import { describe, expect, it } from "vitest";
import { hardCodedFacts, resolveFactVariants, resolveFacts, resolveGoldenItem } from "@/ask/golden-facts";
import type { DynamicFacts } from "@/content/dynamic-facts";
import { scoreGolden, type GoldenItem } from "../../scripts/ask-eval";

const facts: DynamicFacts = {
  asOf: "2026-10-12",
  github: { login: "ShinyQ", contributionsLastYear: 7542, publicRepos: 171 },
  huggingface: { user: "ShinyQ", models: 3, downloads: 37 },
};

describe("live-fact placeholders in the golden and red-team sets", () => {
  it("resolves numbers to the site spelling and the plain form", () => {
    expect(resolveFacts("{{facts.github.contributionsLastYear}} contributions", facts)).toBe("7,542 contributions");
    expect(resolveFactVariants("{{facts.github.contributionsLastYear}}", facts)).toEqual(["7,542", "7542"]);
    expect(resolveFactVariants("{{facts.huggingface.models}} models", facts)).toEqual(["3 models"]);
    expect(resolveFactVariants("as of {{facts.asOf}}", facts)).toEqual(["as of 2026-10-12"]);
    expect(resolveFactVariants("no placeholder", facts)).toEqual(["no placeholder"]);
  });

  it("fails loudly on an unknown fact", () => {
    expect(() => resolveFacts("{{facts.github.stars}}", facts)).toThrow(/Unknown live fact/);
  });

  it("resolves a golden item so a refreshed value still scores", () => {
    const item = resolveGoldenItem(
      { id: "q29", lang: "en", q: "How many?", facts: ["{{facts.github.contributionsLastYear}}"], expect: { any: ["{{facts.github.contributionsLastYear}}"] } } as GoldenItem,
      facts,
    );
    expect(item.facts).toEqual(["7,542"]);
    expect(scoreGolden("As of 2026-10-12, Kurniadi made 7,542 contributions.", item).pass).toBe(true);
    expect(scoreGolden("He made 7542 contributions.", item).pass).toBe(true);
    expect(scoreGolden("He made 7,350 contributions.", item).pass).toBe(false);
  });

  it("finds literals that should be placeholders", () => {
    expect(hardCodedFacts('"facts": ["7,542"]', facts)).toEqual(["7,542"]);
    expect(hardCodedFacts("171 repos.", facts)).toEqual(["171"]);
    expect(hardCodedFacts("NIK 3171234567890123", facts)).toEqual([]);
    expect(hardCodedFacts("{{facts.github.contributionsLastYear}} and 2019", facts)).toEqual([]);
  });
});
