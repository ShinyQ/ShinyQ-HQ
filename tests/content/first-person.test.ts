import { describe, expect, it } from "vitest";
import { getContent } from "@/content/load";
import { LOCALES } from "@/content/schema";
import { hasFirstPerson } from "@/lib/first-person";

describe("hasFirstPerson", () => {
  it("finds the first person singular in English and Indonesian", () => {
    expect(hasFirstPerson("I build AI", "en")).toBe(true);
    expect(hasFirstPerson("My work", "en")).toBe(true);
    expect(hasFirstPerson("Built by me", "en")).toBe(true);
    expect(hasFirstPerson("saya kerjakan sendiri", "id")).toBe(true);
    expect(hasFirstPerson("Aku membangun", "id")).toBe(true);
  });

  it("ignores AI, plural voice and third person", () => {
    expect(hasFirstPerson("Pris.AI, MII's AI code security platform", "en")).toBe(false);
    expect(hasFirstPerson("How We Made a Voice Agent Interruptible", "en")).toBe(false);
    expect(hasFirstPerson("dikerjakan oleh satu engineer", "id")).toBe(false);
  });
});

/**
 * Owner rule (2026-10-13). The motto (`profile.subheadline`) and the pod taglines are owned by the
 * landing workstream (R5 P1, `tests/content/taglines.test.ts`); this file checks the headline and
 * every title. Page titles and share card text are checked in tests/unit/seo-copy.test.ts and
 * tests/unit/og-cards.test.ts.
 */
describe("first-person rule for headline and titles", () => {
  it("keeps the headline, pod titles and post titles out of the first person", () => {
    const { profile, floors } = getContent();
    const texts = [
      { at: "profile.headline", value: profile.headline },
      ...floors.labs.pods.map((p) => ({ at: `${p.slug}.title`, value: p.title })),
      ...floors.library.posts.map((p) => ({ at: `${p.slug}.title`, value: p.title })),
    ];
    const offenders = texts.flatMap(({ at, value }) => LOCALES.filter((l) => hasFirstPerson(value[l], l)).map((l) => `${at}.${l}: ${value[l]}`));
    expect(offenders).toEqual([]);
  });
});
