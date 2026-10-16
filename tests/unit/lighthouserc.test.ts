import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

type Assertion = [string, { maxNumericValue?: number; minScore?: number }];
const rc = JSON.parse(readFileSync("lighthouserc.json", "utf8")) as {
  ci: { collect: { url: string[] }; assert: { assertions?: unknown; assertMatrix: { matchingUrlPattern: string; assertions: Record<string, Assertion> }[] } };
};

describe("lighthouserc", () => {
  const urls = rc.ci.collect.url;
  const matrix = rc.ci.assert.assertMatrix;

  it("warms up first and never asserts on the warm-up URL", () => {
    expect(urls[0]).toBe("http://127.0.0.1:4320/en?lhci-warmup=1");
    expect(rc.ci.assert.assertions).toBeUndefined();
    expect(matrix).toHaveLength(2);
    for (const entry of matrix) expect(new RegExp(entry.matchingUrlPattern).test(urls[0])).toBe(false);
    expect(urls.slice(1)).toEqual([
      "http://127.0.0.1:4320/en",
      "http://127.0.0.1:4320/id",
      "http://127.0.0.1:4320/en/quick",
      "http://127.0.0.1:4320/en/journey",
      "http://127.0.0.1:4320/en/labs/voice-ai-contact-center",
      "http://127.0.0.1:4320/en/blog/making-a-voice-agent-interruptible",
      "http://127.0.0.1:4320/en/contact",
      "http://127.0.0.1:4320/en/cv",
    ]);
  });

  it("asserts every route except /en/cv, which only warns (owner decision 15, until the CV image patch proves its gain)", () => {
    const [asserted, cvOnly] = matrix.map((entry) => new RegExp(entry.matchingUrlPattern));
    for (const url of urls.slice(1)) {
      const cv = url.endsWith("/en/cv");
      expect(asserted.test(url), url).toBe(!cv);
      expect(cvOnly.test(url), url).toBe(cv);
    }
    expect(Object.values(matrix[1].assertions).every(([level]) => level === "warn")).toBe(true);
    expect(Object.keys(matrix[1].assertions).sort()).toEqual(Object.keys(matrix[0].assertions).sort());
  });

  it("keeps the CI budgets", () => {
    const a = matrix[0].assertions;
    expect(a["largest-contentful-paint"][1].maxNumericValue).toBe(2000);
    expect(a["cumulative-layout-shift"][1].maxNumericValue).toBe(0.01);
    expect(a["total-blocking-time"][1].maxNumericValue).toBe(200);
    expect(a["resource-summary:font:size"][1].maxNumericValue).toBe(61440);
    expect(a["resource-summary:document:size"][1].maxNumericValue).toBe(81920);
    expect(a["resource-summary:stylesheet:size"][1].maxNumericValue).toBe(20480);
    expect(a["resource-summary:script:size"][1].maxNumericValue).toBe(245760);
  });
});
