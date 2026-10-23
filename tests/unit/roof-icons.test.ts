import { describe, expect, it } from "vitest";
import { iconMesh, iconPath, ROOF_ICONS } from "@/experience/fx/holoIcons";

describe("roof station icons", () => {
  it("has line art for email, CV, about and signal inside the 24 x 24 grid", () => {
    expect(Object.keys(ROOF_ICONS).sort()).toEqual(["about", "cv", "email", "signal"]);
    for (const strokes of Object.values(ROOF_ICONS)) {
      expect(strokes.length).toBeGreaterThan(1);
      for (const s of strokes)
        for (const [x, y] of s.points) {
          expect(x).toBeGreaterThanOrEqual(0);
          expect(x).toBeLessThanOrEqual(24);
          expect(y).toBeGreaterThanOrEqual(0);
          expect(y).toBeLessThanOrEqual(24);
        }
    }
  });

  it("turns into ribbons and SVG paths like the career icons", () => {
    for (const strokes of Object.values(ROOF_ICONS)) {
      expect(iconMesh(strokes).indices.length).toBeGreaterThan(0);
      expect(iconPath(strokes)).toMatch(/^M/);
    }
  });
});
