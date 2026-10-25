import { describe, expect, it } from "vitest";
import data from "../../content/site-content.json";
import { SiteContentSchema, STAT_SHORT_MAX, STORY_SLUGS } from "@/content/schema";
import { hasFirstPerson } from "@/lib/first-person";

const content = SiteContentSchema.parse(data);

describe("landing proof strip data (owner decision 2026-10-25)", () => {
  it("names exactly three distinct stats, each with a short label in both locales", () => {
    expect(content.profile.heroProof).toEqual(["enterprise-clients", "prs-merged-2026", "microsoft-certifications"]);
    for (const id of content.profile.heroProof) {
      const stat = content.stats.find((s) => s.id === id);
      expect(stat, id).toBeDefined();
      for (const locale of ["en", "id"] as const) {
        const short = stat!.short?.[locale] ?? "";
        expect(short.length, `${id} ${locale}`).toBeGreaterThan(0);
        expect(short.length, `${id} ${locale}`).toBeLessThanOrEqual(STAT_SHORT_MAX);
        expect(hasFirstPerson(short, locale), `${id} ${locale}`).toBe(false);
      }
    }
  });

  it("keeps six stats: 12+ enterprise clients in, building since 2019 out", () => {
    expect(content.stats).toHaveLength(6);
    expect(content.stats.map((s) => s.id)).not.toContain("shipping-since-2019");
    expect(content.stats.find((s) => s.id === "enterprise-clients")).toMatchObject({ value: "12+", confidence: "self-reported" });
  });

  it("rejects a proof id that is not a stat, and a proof stat without a short label", () => {
    const unknown = structuredClone(data);
    unknown.profile.heroProof = ["enterprise-clients", "prs-merged-2026", "no-such-stat"];
    expect(SiteContentSchema.safeParse(unknown).success).toBe(false);
    const bare = structuredClone(data) as typeof data & { stats: { id: string; short?: unknown }[] };
    delete bare.stats.find((s) => s.id === "prs-merged-2026")!.short;
    expect(SiteContentSchema.safeParse(bare).success).toBe(false);
  });
});

describe("case study stories (owner decision 2026-10-25)", () => {
  const pods = content.floors.labs.pods;
  it("the six featured slugs carry a story with 2 to 4 decisions", () => {
    expect([...STORY_SLUGS].sort()).toEqual(["ai-code-security-platform", "ai-solutions-assistant", "digital-banking-integrations", "fabric-forecasting-dashboard", "fraud-review-platform", "voice-ai-contact-center"]);
    for (const slug of STORY_SLUGS) {
      const story = pods.find((p) => p.slug === slug)?.story;
      expect(story, slug).toBeDefined();
      expect(story!.decisions.length, slug).toBeGreaterThanOrEqual(2);
      expect(story!.decisions.length, slug).toBeLessThanOrEqual(4);
    }
  });
  it("decision titles have no first person and stay one line", () => {
    for (const pod of pods) for (const d of pod.story?.decisions ?? []) for (const locale of ["en", "id"] as const) {
      expect(hasFirstPerson(d.title[locale], locale), `${pod.slug}: ${d.title[locale]}`).toBe(false);
      expect(d.title[locale].length, `${pod.slug}: ${d.title[locale]}`).toBeLessThanOrEqual(90);
    }
  });
  it("adds no new numbers: every number in a story already appears in the pod's own text", () => {
    const numbers = (s: string) => s.match(/\d[\d.,]*/g) ?? [];
    for (const pod of pods) {
      if (!pod.story) continue;
      for (const locale of ["en", "id"] as const) {
        const known = [pod.tagline[locale], pod.problem[locale], ...pod.approach.map((a) => a[locale]), ...pod.results.flatMap((r) => [r.value, r.label[locale], r.context?.[locale] ?? ""]), pod.role[locale]].join(" ");
        const story = [pod.story.situation[locale], ...pod.story.decisions.flatMap((d) => [d.title[locale], d.why[locale]])].join(" ");
        for (const n of numbers(story)) expect(known, `${pod.slug} ${locale}: "${n}"`).toContain(n);
      }
    }
  });
  it("rejects a featured pod without a story", () => {
    const bare = structuredClone(data) as typeof data & { floors: { labs: { pods: { slug: string; story?: unknown }[] } } };
    delete bare.floors.labs.pods.find((p) => p.slug === "fraud-review-platform")!.story;
    expect(SiteContentSchema.safeParse(bare).success).toBe(false);
  });
});
