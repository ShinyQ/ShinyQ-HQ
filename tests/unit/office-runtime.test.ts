import { describe, expect, it } from "vitest";
import { OFFICE_CHIP_FAR, nextChipFar } from "@/experience/floors/lobby/office/runtime";

describe("nextChipFar", () => {
  it("switches to far only past the upper edge of the band and back to near only below the lower edge", () => {
    expect(nextChipFar(false, OFFICE_CHIP_FAR + 0.9)).toBe(false);
    expect(nextChipFar(false, OFFICE_CHIP_FAR + 1.1)).toBe(true);
    expect(nextChipFar(true, OFFICE_CHIP_FAR - 0.9)).toBe(true);
    expect(nextChipFar(true, OFFICE_CHIP_FAR - 1.1)).toBe(false);
  });

  it("holds its value while the camera hovers at the threshold", () => {
    let far = false;
    for (const d of [27.5, 28.5, 27.6, 28.4, 28.9].map((x) => x - 28 + OFFICE_CHIP_FAR)) far = nextChipFar(far, d);
    expect(far).toBe(false);
    far = true;
    for (const d of [28.5, 27.5, 28.4, 27.2].map((x) => x - 28 + OFFICE_CHIP_FAR)) far = nextChipFar(far, d);
    expect(far).toBe(true);
  });
});
