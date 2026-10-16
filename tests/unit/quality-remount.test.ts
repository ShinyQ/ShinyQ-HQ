import { describe, expect, it } from "vitest";
import { isQualityRemount } from "@/experience/qualityRemount";

describe("isQualityRemount", () => {
  it("is false on the first session start", () => {
    expect(isQualityRemount(true, "lite", "full")).toBe(false);
    expect(isQualityRemount(true, "full", "full")).toBe(false);
  });

  it("is true when a later start moves between 3D tiers", () => {
    expect(isQualityRemount(false, "full", "lite")).toBe(true);
    expect(isQualityRemount(false, "lite", "full")).toBe(true);
  });

  it("is false for a crash recovery remount with the same tier", () => {
    expect(isQualityRemount(false, "full", "full")).toBe(false);
    expect(isQualityRemount(false, "lite", "lite")).toBe(false);
  });

  it("is false when re-entering 3D from the static tier", () => {
    expect(isQualityRemount(false, "static", "full")).toBe(false);
    expect(isQualityRemount(false, "static", "lite")).toBe(false);
  });
});
