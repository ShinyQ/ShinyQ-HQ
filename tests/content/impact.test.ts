import { describe, expect, it } from "vitest";
import rawData from "../../content/site-content.json";
import { ResultSchema, SiteContentSchema, StatSchema } from "@/content/schema";
import { headlineResults, leadResult, leadStats, scaleStats } from "@/content/selectors";
import { beforeAfterResults } from "@/content/highlights";
import { keyResult } from "@/lib/seo";

const base = { label: { en: "x", id: "x" }, confidence: "verified" as const };
type Data = { floors: { labs: { pods: { slug: string; results: Record<string, unknown>[] }[] } } };

describe("impact and scale results in the schema (owner decision 2026-11-13)", () => {
  it("accepts a delta that the value reads before to after, in either arrow or 'to' form", () => {
    expect(ResultSchema.safeParse({ ...base, value: "~2 s to ~0.2 s", delta: { before: "~2 s", after: "~0.2 s" } }).success).toBe(true);
    expect(ResultSchema.safeParse({ ...base, value: "11.7 MB → 156 KB", delta: { before: "11.7 MB", after: "156 KB" } }).success).toBe(true);
  });
  it("rejects a delta the value does not read, or reads backwards", () => {
    expect(ResultSchema.safeParse({ ...base, value: "10x", delta: { before: "2 s", after: "0.2 s" } }).success).toBe(false);
    expect(ResultSchema.safeParse({ ...base, value: "0.2 s to 2 s", delta: { before: "2 s", after: "0.2 s" } }).success).toBe(false);
  });
  it("rejects a delta or a headline on a scale result", () => {
    expect(ResultSchema.safeParse({ ...base, value: "1 to 2", kind: "scale", delta: { before: "1", after: "2" } }).success).toBe(false);
    const headline = ResultSchema.safeParse({ ...base, value: "28 PRs", kind: "scale", headline: true });
    expect(headline.success).toBe(false);
    expect(JSON.stringify(headline.error?.issues)).toContain("headline result must be an impact result");
    expect(StatSchema.safeParse({ ...base, id: "x", value: "1 to 2", source: "s", kind: "scale", delta: { before: "1", after: "2" } }).success).toBe(false);
  });
  it("fails a pod with only scale results, naming it", () => {
    const data = structuredClone(rawData) as unknown as Data;
    const pod = data.floors.labs.pods.find((p) => p.slug === "voice-ai-contact-center")!;
    pod.results.forEach((r) => {
      r.kind = "scale";
      delete r.delta;
      delete r.headline;
    });
    const parsed = SiteContentSchema.safeParse(data);
    expect(parsed.success).toBe(false);
    expect(JSON.stringify(parsed.error?.issues)).toContain('Pod \\"voice-ai-contact-center\\" needs at least one impact result');
  });
  it("caps scale stats at two, each with a short label", () => {
    const data = structuredClone(rawData) as unknown as { stats: Record<string, unknown>[] };
    data.stats.find((s) => s.id === "competition-placings")!.kind = "scale";
    expect(SiteContentSchema.safeParse(data).success).toBe(false);
    const bare = structuredClone(rawData) as unknown as { stats: Record<string, unknown>[] };
    delete bare.stats.find((s) => s.id === "prs-merged-2026")!.short;
    expect(SiteContentSchema.safeParse(bare).success).toBe(false);
  });
});

describe("impact-first selectors", () => {
  const r = (value: string, extra: Record<string, unknown> = {}) => ({ value, ...extra }) as { value: string; kind?: "impact" | "scale"; headline?: boolean; delta?: { before: string; after: string } };

  it("never puts a scale result in the strip, and falls back to the first impact results", () => {
    const results = [r("28 PRs", { kind: "scale" }), r("a"), r("6 weeks", { kind: "scale" }), r("b")];
    expect(headlineResults(results).map((x) => x.value)).toEqual(["a", "b"]);
  });
  it("leads rows and cards with a headline before and after", () => {
    const results = [r("a", { headline: true }), r("1 to 2", { headline: true, delta: { before: "1", after: "2" } }), r("c")];
    expect(leadResult(results)?.value).toBe("1 to 2");
    expect(leadResult([r("9 PRs", { kind: "scale" }), r("x")])?.value).toBe("x");
  });
  it("splits the stats row from the footnote", () => {
    const stats = [r("12+"), r("1,190+", { kind: "scale" }), r("6")];
    expect(leadStats(stats).map((s) => s.value)).toEqual(["12+", "6"]);
    expect(scaleStats(stats).map((s) => s.value)).toEqual(["1,190+"]);
  });
});

describe("the dataset", () => {
  const content = SiteContentSchema.parse(rawData);
  const pods = content.floors.labs.pods;

  it("matches every homepage before and after with a verified case study result", () => {
    const deltas = content.stats.filter((s) => s.delta);
    expect(deltas.length).toBeGreaterThanOrEqual(3);
    for (const stat of deltas) {
      const match = pods.flatMap((p) => p.results).find((res) => res.delta?.before === stat.delta!.before && res.delta?.after === stat.delta!.after);
      expect(match, stat.id).toBeDefined();
      expect(match!.confidence, stat.id).toBe("verified");
    }
  });
  it("feeds the Highlights Hall results station from impact deltas only", () => {
    for (const { result } of beforeAfterResults(pods)) {
      expect(result.delta).toBeDefined();
      expect(result.kind).not.toBe("scale");
    }
  });
  it("never leads a share card or description with a scale result when an impact result exists", () => {
    for (const pod of pods) expect(keyResult(pod).kind, pod.slug).not.toBe("scale");
  });
});
