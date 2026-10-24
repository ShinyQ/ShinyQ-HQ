import { describe, expect, it } from "vitest";
import { hardCodedFacts, resolveFactVariants, resolveFacts, resolveGoldenItem } from "@/ask/golden-facts";
import type { DynamicFacts } from "@/content/dynamic-facts";
import { getContent } from "@/content/load";
import { scoreGolden, type GoldenItem } from "../../scripts/ask-eval";
import golden from "./golden.json";

const facts: DynamicFacts = {
  asOf: "2026-10-12",
  github: { login: "ShinyQ", contributionsLastYear: 7542, publicRepos: 171 },
  huggingface: { user: "ShinyQ", models: 3, downloads: 37 },
};

describe("live-fact placeholders in the golden and red-team sets", () => {
  it("scores the current latest technical post rather than older posts", () => {
    const latest = golden.items.find((item) => item.id === "q20") as GoldenItem;
    const newest = [...getContent().floors.library.posts].sort((a, b) => b.date.localeCompare(a.date))[0];
    expect(latest.facts).toEqual([newest.title.en, newest.date]);
    expect(scoreGolden(`The latest post, "${newest.title.en}" (${newest.date}), covers an audit and isolated workers.`, latest).pass).toBe(true);
    expect(scoreGolden("The latest post explains Clearbox and Microsoft-Decision-1, published on 2026-10-16.", latest).pass).toBe(false);
    expect(scoreGolden("The latest post is about voice agents and interruption latency.", latest).pass).toBe(false);
  });

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
