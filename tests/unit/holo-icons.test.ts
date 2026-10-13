import { describe, expect, it } from "vitest";
import { arc, CAREER_ICONS, CAREER_TONE, iconMesh, iconPath, LIBRARY_ICONS, PAD_ICONS, PAD_TONE } from "@/experience/fx/holoIcons";

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

  it("gives every type its own neon color", () => {
    expect(Object.keys(CAREER_TONE).sort()).toEqual(["award", "education", "freelance", "job", "milestone"]);
    expect(new Set(Object.values(CAREER_TONE)).size).toBe(5);
  });

  it("writes SVG paths and arcs", () => {
    expect(iconPath([{ points: [[0, 0], [1, 2]], closed: true }])).toBe("M0 0 L1 2 Z");
    const a = arc(0, 0, 1, 0, Math.PI, 2);
    expect(a[1][0]).toBeCloseTo(0);
    expect(a[1][1]).toBeCloseTo(1);
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

  it("has pad icons (elevator, teleporter, Return) inside the 24 x 24 grid, each with its own tone", () => {
    expect(Object.keys(PAD_ICONS).sort()).toEqual(["elevator", "return", "teleport"]);
    for (const strokes of Object.values(PAD_ICONS)) {
      expect(strokes.length).toBeGreaterThan(1);
      for (const s of strokes)
        for (const [x, y] of s.points) {
          expect(x).toBeGreaterThanOrEqual(0);
          expect(x).toBeLessThanOrEqual(24);
          expect(y).toBeGreaterThanOrEqual(0);
          expect(y).toBeLessThanOrEqual(24);
        }
    }
    expect(PAD_TONE).toEqual({ elevator: "#22d3ee", teleport: "#f472b6", return: "#34d399" });
    expect(new Set(Object.values(PAD_TONE)).size).toBe(Object.keys(PAD_TONE).length);
    expect(iconMesh(PAD_ICONS.teleport, { size: 1.4 }).positions.length).toBeGreaterThan(0);
  });
});

describe("library zone icons", () => {
  it("draws every zone inside the 24 x 24 grid with at least three strokes", () => {
    expect(Object.keys(LIBRARY_ICONS).sort()).toEqual(["blog", "models", "research", "talks"]);
    for (const strokes of Object.values(LIBRARY_ICONS)) {
      expect(strokes.length).toBeGreaterThanOrEqual(3);
      for (const s of strokes) for (const [x, y] of s.points) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(24);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(24);
      }
      const mesh = iconMesh(strokes, { size: 2 });
      expect(mesh.indices.length % 3).toBe(0);
    }
  });
});
