import { describe, expect, it } from "vitest";
import { COVER_PAUSE, coveredFraction, isCovered } from "@/experience/scene/cover";

const box = (left: number, top: number, right: number, bottom: number) => ({ left, top, right, bottom });

describe("coveredFraction", () => {
  it("is the largest share of the viewport one panel hides, clipped to the viewport", () => {
    expect(coveredFraction(390, 844, [])).toBe(0);
    expect(coveredFraction(390, 844, [box(0, 0, 390, 844)])).toBe(1);
    expect(coveredFraction(100, 100, [box(-50, -50, 50, 50)])).toBe(0.25);
    expect(coveredFraction(100, 100, [box(0, 0, 10, 10), box(0, 0, 100, 50)])).toBe(0.5);
    expect(coveredFraction(0, 0, [box(0, 0, 10, 10)])).toBe(0);
  });

  it("pauses for the 92% sheet and full-screen panels, not for the 55% sheet or a desktop panel", () => {
    expect(COVER_PAUSE).toBe(0.9);
    expect(isCovered(390, 844, [box(0, 844 * 0.08, 390, 844)])).toBe(true);
    expect(isCovered(390, 844, [box(0, 844 * 0.45, 390, 844)])).toBe(false);
    expect(isCovered(1440, 900, [box(824, 76, 1424, 884)])).toBe(false);
    expect(isCovered(1440, 900, [box(400, 108, 1040, 700)])).toBe(false);
    expect(isCovered(1440, 900, [box(0, 0, 1440, 900)])).toBe(true);
  });
});
