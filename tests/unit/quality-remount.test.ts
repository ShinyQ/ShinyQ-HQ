import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { canvasReplacedInCommit, isQualityRemount, markCanvasReplaced } from "@/experience/qualityRemount";

describe("isQualityRemount", () => {
  it("is false on the first session start", () => {
    expect(isQualityRemount(true, "lite", "full", true)).toBe(false);
    expect(isQualityRemount(true, "full", "full", true)).toBe(false);
  });

  it("is true when a later start swaps a live canvas between 3D tiers", () => {
    expect(isQualityRemount(false, "full", "lite", true)).toBe(true);
    expect(isQualityRemount(false, "lite", "full", true)).toBe(true);
  });

  it("is false for a crash recovery remount with the same tier", () => {
    expect(isQualityRemount(false, "full", "full", true)).toBe(false);
    expect(isQualityRemount(false, "lite", "lite", true)).toBe(false);
  });

  it("is false when re-entering 3D from the static tier", () => {
    expect(isQualityRemount(false, "static", "full", true)).toBe(false);
    expect(isQualityRemount(false, "static", "lite", true)).toBe(false);
  });

  it("is false for a tier change after a Page View round trip", () => {
    expect(isQualityRemount(false, "full", "lite", false)).toBe(false);
    expect(isQualityRemount(false, "lite", "full", false)).toBe(false);
  });
});

describe("markCanvasReplaced", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("is off until a canvas unmounts", () => {
    expect(canvasReplacedInCommit()).toBe(false);
  });

  it("stays set within the same commit and clears on the next task", () => {
    markCanvasReplaced();
    expect(canvasReplacedInCommit()).toBe(true);
    vi.runAllTimers();
    expect(canvasReplacedInCommit()).toBe(false);
  });
});
