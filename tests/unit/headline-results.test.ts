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

describe("context-free portfolio metrics", () => {
  const pods = SiteContentSchema.parse(rawData).floors.labs.pods;
  const compact = (slug: string, locale: "en" | "id") =>
    headlineResults(pods.find((p) => p.slug === slug)!.results).map((r) => ({ value: r.value, label: r.label[locale] }));

  it.each(["en", "id"] as const)("keeps the original CV baseline and missing rerun visible in %s", (locale) => {
    const results = compact("ai-cv-screening-platform", locale);
    expect(results[0].value).toBe("~45%");
    expect(results[0].label).toMatch(/22/);
    expect(results[0].label).toMatch(/original|awal/);
    expect(results[0].label).toMatch(/no recorded rerun|belum ada rerun.*tercatat/);
    expect(results[0].label).not.toMatch(/eliminat|dihilangkan/i);
    expect(pods.find((p) => p.slug === "ai-cv-screening-platform")!.results[0].context?.en).toContain("7 regression tests");
  });

  it.each(["en", "id"] as const)("retains the controlled voice sample and offline fraud scope in %s", (locale) => {
    const voice = compact("voice-ai-contact-center", locale)[0];
    expect(voice.value).toBe("~2 s to ~0.2 s");
    expect(voice.label).toMatch(/n=4/);
    expect(voice.label).toMatch(/controlled|terkontrol/);
    const fraud = compact("fraud-review-platform", locale);
    expect(fraud.slice(0, 2).map((r) => r.value)).toEqual(["90.9% to 36.4%", "76.2% to 0%"]);
    for (const result of fraud.slice(0, 2)) expect(result.label).toMatch(/offline/i);
  });

  it.each(["en", "id"] as const)("does not present in-sample COVID fits as held-out prediction in %s", (locale) => {
    const results = compact("covid-herd-immunity-forecast", locale);
    expect(results.slice(0, 2).map((r) => r.value)).toEqual(["0.992", "0.9995"]);
    for (const result of results.slice(0, 2)) expect(result.label).toContain("in-sample");
  });
});
