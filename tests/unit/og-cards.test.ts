import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getContent, getProfile } from "@/content/load";
import { LOCALES } from "@/content/schema";
import { WING_ACCENT } from "@/lib/accent";
import { hasFirstPerson } from "@/lib/first-person";
import { allOgTargets, ogCard, ogSegments, parseOgSegments } from "@/lib/og-cards";
import { LEGIBLE_PRIMARY_MIN, LEGIBLE_SECONDARY_MIN, OG_EYEBROW_MAX, OG_FONT, OG_GLYPHS, OG_STILLS, clampText, ogText, resultSize, titleSize } from "@/lib/og-layout";
import { keyResult } from "@/lib/seo";
import { OG_PAGES, ogImagePath } from "@/lib/site";

const { floors } = getContent();
const hosted = floors.library.posts.filter((p) => !p.url);
const cards = allOgTargets().map((target) => ({ target, card: ogCard(target) }));
const texts = (card: ReturnType<typeof ogCard>) =>
  [card.eyebrow, card.title, card.subtitle, card.motto, card.result?.value, card.result?.label, card.cta, card.headline].filter((t): t is string => Boolean(t));
/**
 * Text the cards write themselves. The motto and pod taglines (project subtitles) come from content
 * owned by the landing workstream (R5 P1, tests/content/taglines.test.ts), and result labels are
 * case-study facts; the cards only choose and lay them out.
 */
const ownText = (card: ReturnType<typeof ogCard>) =>
  [card.eyebrow, card.title, card.layout === "project" ? undefined : card.subtitle, card.cta, card.headline].filter((t): t is string => Boolean(t));

describe("OG targets", () => {
  it("covers home, six section pages, every pod and every hosted post in both locales", () => {
    expect(allOgTargets()).toHaveLength(2 * (1 + OG_PAGES.length + floors.labs.pods.length + hosted.length));
    const paths = allOgTargets().map(ogImagePath);
    expect(paths.every((p) => /^\/og\/(en|id)(\/(page|labs|blog)\/[a-z0-9-]+)?\.jpg$/.test(p))).toBe(true);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("round-trips route segments", () => {
    for (const target of allOgTargets()) expect(parseOgSegments(ogSegments(target))).toEqual(target);
    expect(parseOgSegments(["xx.jpg"])).toBeUndefined();
  });
});

describe("OG cards", () => {
  it("picks the layout per kind and a committed still", () => {
    const layout = { default: "home", page: "page", labs: "project", blog: "post" } as const;
    for (const { target, card } of cards) {
      expect(card.layout).toBe(layout[target.kind]);
      expect(OG_STILLS).toContain(card.still);
    }
  });

  it("puts the name, the content headline and the motto on the home card", () => {
    const profile = getProfile();
    for (const locale of LOCALES) {
      expect(ogCard({ kind: "default", locale })).toMatchObject({ title: profile.name, subtitle: profile.headline[locale], motto: profile.subheadline[locale] });
    }
  });

  it("frames each pod's cover with its key result in the wing color", () => {
    for (const pod of floors.labs.pods) {
      const card = ogCard({ kind: "labs", locale: "en", slug: pod.slug });
      expect(card.shot).toBe(pod.assets[0]?.src);
      expect(card.accent).toBe(WING_ACCENT[pod.wing]);
      expect(card.result).toEqual({ value: ogText(keyResult(pod).value, "en"), label: ogText(keyResult(pod).label.en, "en") });
    }
  });

  it.each(LOCALES)("keeps measurement limits in standalone %s result cards", (locale) => {
    const label = (slug: string) => clampText(ogCard({ kind: "labs", locale, slug }).result!.label, 80);
    expect(label("voice-ai-contact-center")).toMatch(/n\s*=\s*4/i);
    expect(label("voice-ai-contact-center")).toMatch(/(?:per|each|tiap|setiap|\/)\s*(?:arm|jalur|kelompok)/i);
    expect(label("fraud-review-platform")).toMatch(/offline|development|pengembangan/i);
    expect(label("covid-herd-immunity-forecast")).toMatch(/in-sample/i);
    const cv = label("ai-cv-screening-platform");
    expect(cv).toMatch(/22/);
    expect(cv).toMatch(/rerun|uji ulang|pengujian ulang|diulang/i);
    expect(cv).toMatch(/\b(?:no|not|without|unrecorded|belum|tidak|tanpa)\b/i);
  });

  it("never speaks in the first person singular", () => {
    for (const { target, card } of cards) for (const text of ownText(card)) expect(hasFirstPerson(text, target.locale), text).toBe(false);
  });

  it("only uses glyphs the bundled Inter and JetBrains Mono subsets can draw", () => {
    for (const { card } of cards) for (const text of texts(card)) expect(OG_GLYPHS.test(text), text).toBe(true);
  });

  it("keeps primary text legible when the card is shown 300 px wide", () => {
    for (const { card } of cards) {
      expect(titleSize(card.layout, card.title)).toBeGreaterThanOrEqual(LEGIBLE_PRIMARY_MIN);
      if (card.result) expect(resultSize(card.result.value)).toBeGreaterThanOrEqual(LEGIBLE_PRIMARY_MIN);
    }
    for (const size of Object.values(OG_FONT)) expect(size).toBeGreaterThanOrEqual(LEGIBLE_SECONDARY_MIN);
  });

  it("keeps project eyebrows on one line", () => {
    for (const { card } of cards) {
      if (card.layout !== "project") continue;
      expect(card.eyebrow.length, card.eyebrow).toBeLessThanOrEqual(card.shot ? OG_EYEBROW_MAX.shot : OG_EYEBROW_MAX.wide);
    }
  });

  it("draws no edge stripes (owner decision 2026-10-13)", () => {
    const source = readFileSync("src/lib/og.tsx", "utf8");
    expect(source).not.toMatch(/border(Left|Right|Top|Bottom)/);
    expect(source).not.toMatch(/(top|bottom): 0, (bottom|top): 0, width: \d+/);
  });
});
