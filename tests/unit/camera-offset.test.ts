import { describe, expect, it } from "vitest";
import { cameraOffsetScale, followEase, followOffsetScale } from "@/experience/camera/offset";

describe("camera offset", () => {
  it("pulls the camera back on narrow screens like the prototype", () => {
    expect(cameraOffsetScale(16 / 9)).toBe(1);
    expect(cameraOffsetScale(1)).toBe(1.35);
    expect(cameraOffsetScale(390 / 844)).toBe(1.75);
  });
  it("only scales beyond what the camera class already frames", () => {
    expect(followOffsetScale("desktop", 16 / 9)).toBe(1);
    expect(followOffsetScale("desktop", 1.05)).toBe(1.35);
    // Portrait screens use the mobile class, whose offset and FOV already pull back.
    expect(followOffsetScale("mobile", 390 / 844)).toBe(1);
  });
  it("eases toward the target with the prototype's exponential smoothing", () => {
    expect(followEase(0.1, false)).toBeCloseTo(1 - Math.exp(-0.4));
    expect(followEase(0.1, true)).toBeCloseTo(1 - Math.exp(-0.8));
  });
});
