import { describe, expect, it } from "vitest";
import { buildKnowledgePack } from "@/ask/pack";
import { getPostSource } from "@/content/blog";
import { getContent } from "@/content/load";
import { getPostDiagrams } from "@/content/post-diagrams";
import { resolveArchitecture } from "@/components/diagram/text";
import { seoFor } from "@/lib/seo";

const slugs = [
  "making-a-voice-agent-interruptible",
  "45-percent-of-our-llm-calls-failed",
  "why-the-better-fraud-engine-shipped-in-shadow-mode",
  "spec-driven-development-with-ai-coding-agents",
  "clearbox-inbox-cleanup-with-microsoft-decision-1",
] as const;
const content = getContent();
const posts = Object.fromEntries(slugs.map((slug) => [slug, {
  en: getPostSource(slug, "en")!.source,
  id: getPostSource(slug, "id")!.source,
}]));
const pack = buildKnowledgePack({ content, posts, products: [], contentDate: "2026-10-18" });
const caveats = [
  [/harness/i, /n=4/, /no improvement|belum menunjukkan perbaikan/],
  [/22/, /no rerun|run ulang.*tidak tercatat/],
  [/offline/i, /noisy-clean|bersih yang noisy/, /development/, /36[.,]4%/, /9[.,]1%/, /High-risk recall fell|recall High-risk turun/, /only in shadow mode|hanya dalam shadow mode/],
  [/skipped integration|integration tier yang di-skip/, /two sign-in bugs|dua bug login/, /not measured|belum diukur/],
  [/40 synthetic emails|40 email sintetis/, /not an inbox|bukan inbox nyata/],
];

describe("technical article discovery boundaries", () => {
  for (const locale of ["en", "id"] as const) {
    it.each(slugs.map((slug, index) => [slug, caveats[index]] as const))(
      "retains %s evidence limits in final " + locale + " SEO and one-paragraph Ask knowledge",
      (slug, qualifiers) => {
        const description = seoFor(locale, `/blog/${slug}`).description;
        const chunk = pack.chunks.find((c) => c.id === `post-${slug}`)!;
        const text = chunk[locale === "en" ? "text_en" : "text_id"];
        expect(description.length).toBeGreaterThanOrEqual(140);
        expect(description.length).toBeLessThanOrEqual(160);
        for (const qualifier of qualifiers) {
          expect(description).toMatch(qualifier);
          expect(text).toMatch(qualifier);
        }
      },
    );

    it("keeps technical frontmatter aligned with the " + locale + " registry", () => {
      for (const slug of slugs) {
        const post = content.floors.library.posts.find((p) => p.slug === slug)!;
        const source = posts[slug][locale];
        for (const [key, value] of Object.entries({ title: post.title[locale], excerpt: post.excerpt[locale], date: post.date })) {
          expect(source.match(new RegExp(`^${key}: "(.*)"$`, "m"))?.[1], `${slug}.${locale} ${key}`).toBe(value);
        }
      }
    });

    it("qualifies fraud percentages in the packed " + locale + " lead, not just its excerpt", () => {
      const slug = "why-the-better-fraud-engine-shipped-in-shadow-mode";
      const chunk = pack.chunks.find((c) => c.id === `post-${slug}`)!;
      const text = chunk[locale === "en" ? "text_en" : "text_id"];
      const excerpt = content.floors.library.posts.find((p) => p.slug === slug)!.excerpt[locale];
      expect(text).toContain(excerpt);
      const lead = text.slice(text.indexOf(excerpt) + excerpt.length).trim();
      expect(lead).toMatch(/36[.,]4%/);
      expect(lead).toMatch(/9[.,]1%/);
      expect(lead).toMatch(/noisy-clean|bersih yang noisy/);
      expect(lead).toMatch(/development/);
    });

    it("bounds Clearbox recovery and calibration without claiming numeric-output immunity in " + locale, () => {
      const source = posts["clearbox-inbox-cleanup-with-microsoft-decision-1"][locale];
      expect(source).not.toMatch(/30 days after that|setelah itu Gmail serta Outlook|stays reversible|tetap bisa dibatalkan/);
      expect(source).toMatch(/Undo.{0,65}24/);
      expect(source).toMatch(/Gmail.{0,100}30/);
      expect(source).toMatch(/Outlook.{0,100}(?:account policy|kebijakan akun)/);
      expect(source).not.toMatch(/cannot make it say or do anything|tidak bisa membuatnya mengatakan atau melakukan apa pun/);
      expect(source).toMatch(/may still influence|masih bisa memengaruhi/);
      expect(source).toMatch(/enough labels|labelnya cukup/);
      expect(source).not.toMatch(/dollar|dolar|one capacity unit is one request per minute|satu unit kapasitas setara satu request per menit/);
    });
  }

  it("keeps owner attribution within 60 characters in the final Indonesian Clearbox search title", () => {
    const { searchTitle } = seoFor("id", "/blog/clearbox-inbox-cleanup-with-microsoft-decision-1");
    expect(searchTitle).toContain("Kurniadi");
    expect(searchTitle.length).toBeLessThanOrEqual(60);
  });

  it("resolves useful native text in all three local figures while retaining product names", () => {
    const diagrams = getPostDiagrams();
    const delivery = resolveArchitecture(diagrams["spec-driven-development-with-ai-coding-agents"]["delivery-loop"], "id");
    const architecture = resolveArchitecture(diagrams["clearbox-inbox-cleanup-with-microsoft-decision-1"].architecture, "id");
    const pipeline = resolveArchitecture(diagrams["clearbox-inbox-cleanup-with-microsoft-decision-1"].pipeline, "id");
    expect(delivery.nodes.find((n) => n.id === "spec")?.label).toBe("Spec bernomor");
    expect(delivery.edges.find((e) => e.from === "engineer")?.label).toBe("menulis");
    expect(architecture.nodes.find((n) => n.id === "browser")?.label).toBe("Browser pemilik");
    expect(architecture.nodes.find((n) => n.id === "decision")?.label).toBe("Microsoft-Decision-1");
    expect(pipeline.nodes.find((n) => n.id === "suggestion")?.label).toBe("Saran");
    expect(pipeline.edges.find((e) => e.from === "decision")?.label).toBe("probabilitas");
  });
});
