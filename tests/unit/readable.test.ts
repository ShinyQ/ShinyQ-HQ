import { describe, expect, it } from "vitest";
import { monoWidth, readableFlip, READABLE_HYSTERESIS } from "@/experience/fx/readableFlip";

describe("readable signs", () => {
  const at = { x: 10, z: 0 };

  it("keeps a sign as it is while the camera is in front of it", () => {
    expect(readableFlip(false, 0, at, { x: 10, z: 30 })).toBe(false);
    expect(readableFlip(false, 0, at, { x: 40, z: 5 })).toBe(false);
  });

  it("turns it around once the camera is clearly behind it, and back", () => {
    expect(readableFlip(false, 0, at, { x: 10, z: -30 })).toBe(true);
    expect(readableFlip(true, 0, at, { x: 10, z: -30 })).toBe(true);
    expect(readableFlip(true, 0, at, { x: 10, z: 30 })).toBe(false);
  });

  it("does not flicker when the sign is seen edge-on", () => {
    const edge = { x: 40, z: -30 * Math.sin(READABLE_HYSTERESIS / 2) };
    expect(readableFlip(false, 0, at, edge)).toBe(false);
    expect(readableFlip(true, 0, at, edge)).toBe(true);
  });

  it("uses the sign's own facing", () => {
    // Facing +x: a camera at -x is behind it.
    expect(readableFlip(false, Math.PI / 2, at, { x: -20, z: 0 })).toBe(true);
    expect(readableFlip(false, Math.PI / 2, at, { x: 30, z: 0 })).toBe(false);
  });

  it("measures monospace lines", () => {
    expect(monoWidth("L3 Labs", 0.5, 0.1)).toBeCloseTo(7 * 0.5 * 0.7);
  });
});
