import { describe, expect, it } from "vitest";
import { formatIntentReport, intentQuery, sourceQuery } from "../../scripts/intent-report";

describe("intent report (private)", () => {
  it("reads only intent and visit points of the current protocol version", () => {
    expect(intentQuery(30)).toContain("blob2 = 'intent'");
    expect(sourceQuery(7)).toContain("blob2 = 'visit'");
    for (const q of [intentQuery(30), sourceQuery(7)]) expect(q).toContain("blob1 = '1'");
  });

  it("lists every intent and channel, zeros and untagged visits included", () => {
    const text = formatIntentReport(30, [{ key: "cv", n: 4 }], [{ key: "", n: 10 }, { key: "li", n: 3 }]);
    expect(text).toContain("| cv | 4 |");
    expect(text).toContain("| email | 0 |");
    expect(text).toContain("| li | 3 |");
    expect(text).toContain("| gh | 0 |");
    expect(text).toContain("| untagged | 10 |");
    expect(text).toContain("| all | 13 |");
  });
});
