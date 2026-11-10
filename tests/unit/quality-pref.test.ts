import { describe, expect, it } from "vitest";
import { applyQualityPref } from "@/lib/gpu-tier";
import { isQualityPref } from "@/lib/quality-pref";

describe("graphics quality preference", () => {
  it("accepts only a choice from storage, never the static tier", () => {
    expect(["auto", "full", "lite"].every(isQualityPref)).toBe(true);
    expect(isQualityPref("static")).toBe(false);
  });
  it("auto keeps the detected tier; a choice wins over detection", () => {
    expect(applyQualityPref("full", "auto", false)).toBe("full");
    expect(applyQualityPref("lite", "full", false)).toBe("full");
    expect(applyQualityPref("full", "lite", false)).toBe("lite");
  });
  it("never lifts a static device and never beats ?tier=", () => {
    expect(applyQualityPref("static", "full", false)).toBe("static");
    expect(applyQualityPref("lite", "full", true)).toBe("lite");
  });
});
