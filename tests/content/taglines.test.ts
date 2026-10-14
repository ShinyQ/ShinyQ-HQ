import { describe, expect, it } from "vitest";
import { getContent } from "@/content/load";
import { LOCALES } from "@/content/schema";
import { hasFirstPerson } from "@/lib/first-person";

/** Owner rule (round 5): mottos and taglines never speak in the first person, in either locale. */
describe("mottos and taglines", () => {
  const content = getContent();
  const entries = [
    { where: "profile.subheadline", text: content.profile.subheadline },
    ...content.floors.labs.pods.map((pod) => ({ where: `pods.${pod.slug}.tagline`, text: pod.tagline })),
  ];

  it("never use the first person", () => {
    const issues = entries.flatMap(({ where, text }) => LOCALES.filter((l) => hasFirstPerson(text[l], l)).map((l) => `${where}.${l}: ${text[l]}`));
    expect(issues).toEqual([]);
  });

  it("carry the owner's motto", () => {
    expect(content.profile.subheadline).toEqual({
      en: "Production-grade AI and software for banking, fintech and enterprise.",
      id: "AI dan software untuk kebutuhan production di perbankan, fintech, dan enterprise.",
    });
  });
});
