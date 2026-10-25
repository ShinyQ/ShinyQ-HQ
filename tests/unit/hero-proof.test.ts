import { describe, expect, it } from "vitest";
import { heroProofStats } from "@/content/pageview";
import { getProfile, getStats } from "@/content/load";

describe("heroProofStats", () => {
  it("returns the proof stats in heroProof order", () => {
    expect(heroProofStats(getStats(), getProfile().heroProof).map((s) => s.id)).toEqual(["enterprise-clients", "prs-merged-2026", "microsoft-certifications"]);
  });
  it("skips an id with no stat instead of throwing", () => {
    expect(heroProofStats(getStats(), ["enterprise-clients", "missing"]).map((s) => s.id)).toEqual(["enterprise-clients"]);
  });
});
