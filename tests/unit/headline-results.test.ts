import { describe, expect, it } from "vitest";
import rawData from "../../content/site-content.json";
import { HEADLINE_MAX, ResultSchema, SiteContentSchema } from "@/content/schema";
import { headlineResults } from "@/content/selectors";

const r = (value: string, headline?: boolean) => ({ value, ...(headline ? { headline } : {}) });

describe("headlineResults", () => {
  it("takes the first three when nothing is flagged", () => {
    expect(headlineResults([r("a"), r("b"), r("c"), r("d")]).map((x) => x.value)).toEqual(["a", "b", "c"]);
    expect(headlineResults([r("a")]).map((x) => x.value)).toEqual(["a"]);
  });
  it("takes the flagged results in dataset order", () => {
    expect(headlineResults([r("a"), r("b", true), r("c"), r("d", true)]).map((x) => x.value)).toEqual(["b", "d"]);
  });
  it("never returns more than HEADLINE_MAX", () => {
    expect(HEADLINE_MAX).toBe(3);
    const all = [r("a", true), r("b", true), r("c", true), r("d", true)];
    expect(headlineResults(all)).toHaveLength(HEADLINE_MAX);
  });
});

describe("Result.headline in the schema", () => {
  it("accepts the flag and rejects a non-boolean", () => {
    const base = { value: "1", label: { en: "x", id: "x" }, confidence: "verified" as const };
    expect(ResultSchema.safeParse({ ...base, headline: true }).success).toBe(true);
    expect(ResultSchema.safeParse({ ...base, headline: "yes" }).success).toBe(false);
  });
  it("rejects a pod with more than three headline results", () => {
    const data = structuredClone(rawData) as unknown as { floors: { labs: { pods: { results: Record<string, unknown>[] }[] } } };
    const pod = data.floors.labs.pods.find((p) => p.results.length === 4)!;
    pod.results.forEach((res) => (res.headline = true));
    const parsed = SiteContentSchema.safeParse(data);
    expect(parsed.success).toBe(false);
    expect(JSON.stringify(parsed.error?.issues)).toContain("headline");
  });
  it("the dataset passes", () => {
    expect(SiteContentSchema.safeParse(rawData).success).toBe(true);
  });
});
