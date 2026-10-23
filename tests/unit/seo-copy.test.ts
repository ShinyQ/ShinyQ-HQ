import { describe, expect, it } from "vitest";
import { getContent, getPod, getProfile } from "@/content/load";
import { LOCALES } from "@/content/schema";
import { hasFirstPerson } from "@/lib/first-person";
import { allOgTargets } from "@/lib/og-cards";
import { allPagePaths } from "@/lib/routes";
import { DESCRIPTION_MAX, DESCRIPTION_MIN, DYNAMIC_TITLE_MAX, HOME_TITLE_MAX, SEARCH_TITLE_MAX, TITLE_MAX, fitDescription, fitTitle, keyResult, periodLabel, seoFor, seoMetadata, shortenLead } from "@/lib/seo";
import { ogImagePath } from "@/lib/site";

const name = getProfile().name;
const ogPaths = new Set(allOgTargets().map(ogImagePath));

describe("shortenLead", () => {
  it("keeps short text and ends it with a full stop", () => {
    expect(shortenLead("Fast payments")).toBe("Fast payments.");
  });

  it("cuts at a sentence boundary first", () => {
    expect(shortenLead(`${"a".repeat(90)}. ${"b".repeat(90)}.`, 160)).toBe(`${"a".repeat(90)}.`);
  });

  it("falls back to a clause boundary, then a word boundary with an ellipsis", () => {
    const head = "word ".repeat(15).trim();
    expect(shortenLead(`${head}, ${"more ".repeat(30).trim()}`, 100)).toBe(`${head}.`);
    const words = shortenLead("word ".repeat(40).trim(), 100);
    expect(words).toMatch(/^word( word)*…$/);
    expect(words.length).toBeLessThanOrEqual(100);
  });
});

describe("fitDescription", () => {
  const lead = `${"x".repeat(100)}.`;

  it("adds the earliest groups that fit within the limits", () => {
    expect(fitDescription(lead, [["Result: 2 s to 0.2 s (latency)."], ["Built with Go."]], 120, 160)).toBe(`${lead} Result: 2 s to 0.2 s (latency). Built with Go.`);
  });

  it("prefers an earlier option over a later one in the same group", () => {
    expect(fitDescription(lead, [["By Someone Long Name.", "By S."]], 110, 160)).toBe(`${lead} By Someone Long Name.`);
  });

  it("skips options that overflow and returns the longest fit when nothing reaches the minimum", () => {
    expect(fitDescription(lead, [["y".repeat(80)]], 140, 160)).toBe(lead);
  });
});

describe("content helpers", () => {
  it("leads with a numeric result whose label is not first person", () => {
    const result = keyResult(getPod("ticket-marketplace-backend")!);
    expect(result.value).toMatch(/\d/);
    expect(hasFirstPerson(result.label.en, "en")).toBe(false);
  });

  it("writes periods with words, never dashes", () => {
    expect(periodLabel("2022-02", "2023-05", "en")).toBe("2022 to 2023");
    expect(periodLabel("2026-02", "present", "id")).toBe("2026 hingga sekarang");
    expect(periodLabel("2021-03", "2021-08", "en")).toBe("2021");
  });
});

describe("every page's title and description", () => {
  for (const locale of LOCALES) {
    for (const path of allPagePaths()) {
      it(`${locale} ${path}`, () => {
        const seo = seoFor(locale, path);
        const isHome = path === "/";
        const isSection = !isHome && path.split("/").length === 2;
        expect(seo.title).toContain(name);
        expect(seo.title.length).toBeLessThanOrEqual(isHome ? HOME_TITLE_MAX : isSection ? TITLE_MAX : DYNAMIC_TITLE_MAX);
        expect(hasFirstPerson(seo.title, locale)).toBe(false);
        expect(seo.description.length, seo.description).toBeGreaterThanOrEqual(DESCRIPTION_MIN);
        expect(seo.description.length, seo.description).toBeLessThanOrEqual(DESCRIPTION_MAX);
        expect(ogPaths.has(ogImagePath(seo.image))).toBe(true);
        expect(seo.imageAlt).toBe(seo.title);
      });
    }
  }

  it("titles home, projects and posts with the name and value", () => {
    const { headline } = getProfile();
    expect(seoFor("en", "/").title).toBe(`${name}: ${headline.en} building production AI platforms`);
    expect(seoFor("id", "/").title).toBe(`${name}: ${headline.id} yang membangun platform AI production`);
    const pod = getContent().floors.labs.pods[0];
    expect(seoFor("en", `/labs/${pod.slug}`).title).toBe(`${pod.title.en} by ${name}`);
    expect(seoFor("id", `/labs/${pod.slug}`).title).toBe(`${pod.title.id} oleh ${name}`);
    const post = getContent().floors.library.posts.find((p) => !p.url)!;
    expect(seoFor("en", `/blog/${post.slug}`).title).toBe(`${post.title.en} by ${name}`);
  });

  it("keeps every <title> within the search result width, unique per locale and attributed", () => {
    const first = name.split(" ")[0];
    for (const locale of LOCALES) {
      const titles = allPagePaths().map((path) => {
        const { title, searchTitle } = seoFor(locale, path);
        const [, section, slug] = path.split("/");
        const bare =
          section === "labs" && slug
            ? getPod(slug)!.title[locale]
            : section === "blog"
              ? getContent().floors.library.posts.find((p) => p.slug === slug)!.title[locale]
              : section === "journey" && slug
                ? getContent().floors.careerArchive.entries.find((e) => e.slug === slug)!.role[locale]
                : undefined;
        // Journey entries prefer the organization (two entries can share a role); others keep a fitting share title.
        if (title.length <= SEARCH_TITLE_MAX && section !== "journey") expect(searchTitle, path).toBe(title);
        // A content title longer than the budget stays whole (never cut mid-title); everything else fits.
        if (!bare || bare.length <= SEARCH_TITLE_MAX) expect(searchTitle.length, `${path}: ${searchTitle}`).toBeLessThanOrEqual(SEARCH_TITLE_MAX);
        expect(hasFirstPerson(searchTitle, locale), path).toBe(false);
        return searchTitle;
      });
      expect(new Set(titles).size, locale).toBe(titles.length);
      const shareTitles = allPagePaths().map((path) => seoFor(locale, path).title);
      expect(new Set(shareTitles).size, `${locale} share titles`).toBe(shareTitles.length);
      expect(titles.filter((t) => t.includes(first)).length / titles.length, locale).toBeGreaterThan(0.6);
    }
    // The city stays in the home description: with the headline it would pass SEARCH_TITLE_MAX.
    expect(seoFor("en", "/").searchTitle).toBe(`${name}: ${getProfile().headline.en}`);
    expect(seoFor("id", "/").searchTitle).toBe(`${name}: ${getProfile().headline.id}`);
    expect(fitTitle(["a".repeat(70), "b".repeat(50)])).toBe("b".repeat(50));
    expect(fitTitle(["a".repeat(70), "b".repeat(65)])).toBe("b".repeat(65));
  });

  it("uses the motto in the home description", () => {
    for (const locale of LOCALES) expect(seoFor(locale, "/").description).toContain(getProfile().subheadline[locale]);
  });

  it.each(LOCALES)("keeps experimental scope in context-free %s project descriptions", (locale) => {
    const description = (slug: string) => seoFor(locale, `/labs/${slug}`).description;
    expect(description("voice-ai-contact-center")).toMatch(/n\s*=\s*4/i);
    expect(description("fraud-review-platform")).toMatch(/offline|development|pengembangan/i);
    expect(description("covid-herd-immunity-forecast")).toMatch(/in-sample/i);
    const cv = description("ai-cv-screening-platform");
    expect(cv).toMatch(/22/);
    expect(cv).toMatch(/rerun|uji ulang|pengujian ulang|diulang/i);
    expect(cv).toMatch(/\b(?:no|not|without|unrecorded|belum|tidak|tanpa)\b/i);
  });

  it("marks projects and posts as articles and journey entries with the journey card", () => {
    const pod = getContent().floors.labs.pods[0];
    expect(seoFor("en", `/labs/${pod.slug}`)).toMatchObject({ type: "article", tags: pod.stack, image: { kind: "labs", slug: pod.slug } });
    const entry = getContent().floors.careerArchive.entries[0];
    expect(seoFor("en", `/journey/${entry.slug}`).image).toEqual({ kind: "page", locale: "en", page: "journey" });
  });

  it("refuses unknown paths", () => {
    expect(() => seoFor("en", "/nope")).toThrow(/No search metadata/);
  });
});

describe("every page's Next metadata", () => {
  for (const locale of LOCALES) {
    for (const path of allPagePaths()) {
      it(`${locale} ${path} has a title, description, canonical, hreflang and a JPEG share card`, () => {
        const seo = seoFor(locale, path);
        const meta = seoMetadata(locale, path);
        expect(meta.title).toEqual({ absolute: seo.searchTitle });
        expect(meta.description).toBe(seo.description);
        expect(meta.alternates?.canonical).toBe(path === "/" ? `/${locale}` : `/${locale}${path}`);
        expect(Object.keys(meta.alternates?.languages ?? {}).sort()).toEqual(["en", "id", "x-default"]);
        const images = meta.openGraph?.images as { url: string; width: number; height: number; type: string; alt: string }[];
        expect(images).toHaveLength(1);
        expect(images[0]).toMatchObject({ width: 1200, height: 630, type: "image/jpeg", alt: seo.title });
        expect(ogPaths.has(images[0].url)).toBe(true);
        expect(meta.openGraph).toMatchObject({ title: seo.title, description: seo.description, url: meta.alternates?.canonical });
        expect(meta.twitter).toMatchObject({ card: "summary_large_image", title: seo.title, description: seo.description });
      });
    }
  }
});
