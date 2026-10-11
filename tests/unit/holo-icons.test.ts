import { describe, expect, it } from "vitest";
import { arc, CAREER_ICONS, hexFrame, ICON_TONES, iconMesh, iconPath } from "@/experience/fx/holoIcons";

describe("career type icons", () => {
  it("has line art for every type inside the 24 x 24 grid", () => {
    for (const strokes of Object.values(CAREER_ICONS)) {
      expect(strokes.length).toBeGreaterThan(1);
      for (const s of strokes) for (const [x, y] of s.points) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(24);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(24);
      }
    }
  });

  it("has a tone per type for every direction", () => {
    for (const tones of Object.values(ICON_TONES)) expect(Object.keys(tones).sort()).toEqual(["award", "education", "freelance", "job", "milestone"]);
    // The spectrum gives every type its own hue.
    expect(new Set(Object.values(ICON_TONES.line).map((t) => t.stroke)).size).toBe(5);
  });

  it("writes SVG paths and arcs", () => {
    expect(iconPath([{ points: [[0, 0], [1, 2]], closed: true }])).toBe("M0 0 L1 2 Z");
    const a = arc(0, 0, 1, 0, Math.PI, 2);
    expect(a[1][0]).toBeCloseTo(0);
    expect(a[1][1]).toBeCloseTo(1);
    expect(hexFrame().points).toHaveLength(6);
  });

  it("builds flat and extruded ribbons scaled to the icon size", () => {
    const flat = iconMesh(CAREER_ICONS.job, { size: 2 });
    const solid = iconMesh(CAREER_ICONS.job, { size: 2, depth: 0.2 });
    expect(flat.indices.length % 3).toBe(0);
    expect(Math.max(...flat.indices)).toBe(flat.positions.length / 3 - 1);
    expect(solid.positions.length).toBe(flat.positions.length * 2);
    expect(solid.indices.length).toBe(flat.indices.length * 4);
    const xs = flat.positions.filter((_, i) => i % 3 === 0);
    expect(Math.max(...xs.map(Math.abs))).toBeLessThan(1.2);
    expect(new Set(flat.positions.filter((_, i) => i % 3 === 2))).toEqual(new Set([0]));
  });
});
