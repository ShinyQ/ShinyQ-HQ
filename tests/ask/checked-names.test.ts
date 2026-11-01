import { describe, expect, it } from "vitest";
import { checkedNames, CHECKED_NAMES_MAX } from "../../functions/_lib/handler";

describe("checkedNames (blob17)", () => {
  it("logs the names an entity or employer check failed on, deduplicated", () => {
    expect(checkedNames("entity", ["Snyk", "Trivy", "Snyk"], "What does the AI code security platform do?")).toBe("Snyk,Trivy");
    expect(checkedNames("employer", ["Gojek"], "Where has he worked?")).toBe("Gojek");
  });

  it("never logs a name that shares a word with the visitor's question", () => {
    expect(checkedNames("entity", ["Budi Santoso", "Snyk"], "Did budi work with him?")).toBe("Snyk");
    expect(checkedNames("employer", ["Gojek"], "Did he work at Gojek?")).toBe("");
  });

  it("is empty for other reasons, no detail, and capped", () => {
    expect(checkedNames("numeric", ["42"], "q")).toBe("");
    expect(checkedNames("entity", [], "q")).toBe("");
    expect(checkedNames(undefined, ["Snyk"], "q")).toBe("");
    const long = checkedNames("entity", Array.from({ length: 40 }, (_, i) => `Name${i}`), "q");
    expect(long.length).toBeLessThanOrEqual(CHECKED_NAMES_MAX);
  });
});
