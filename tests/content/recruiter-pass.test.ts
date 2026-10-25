import { describe, expect, it } from "vitest";
import data from "../../content/site-content.json";
import { SiteContentSchema, STAT_SHORT_MAX } from "@/content/schema";
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
