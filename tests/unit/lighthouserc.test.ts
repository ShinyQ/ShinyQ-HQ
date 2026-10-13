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
    expect(matrix).toHaveLength(1);
    const re = new RegExp(matrix[0].matchingUrlPattern);
    expect(re.test(urls[0])).toBe(false);
    expect(urls.slice(1)).toEqual([
      "http://127.0.0.1:4320/en",
      "http://127.0.0.1:4320/en/quick",
      "http://127.0.0.1:4320/en/journey",
      "http://127.0.0.1:4320/en/labs/voice-ai-contact-center",
    ]);
    for (const url of urls.slice(1)) expect(re.test(url), url).toBe(true);
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
