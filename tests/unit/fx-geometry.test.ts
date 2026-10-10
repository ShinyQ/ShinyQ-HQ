import { describe, expect, it } from "vitest";
import { getGlassMaterial, glassSidesGeometry, laneRibbonGeometry, rimGeometry, rimThickness } from "@/experience/fx/geometry";
import { getGlassMaterial as fromPrimitives } from "@/experience/tower/primitives";

describe("fx geometry", () => {
  it("shares one glass material per color and opacity", () => {
    expect(getGlassMaterial("#a78bfa", 0.04)).toBe(getGlassMaterial("#a78bfa", 0.04));
    expect(getGlassMaterial("#a78bfa", 0.04)).not.toBe(getGlassMaterial("#f472b6", 0.04));
    expect(fromPrimitives("#a78bfa", 0.04)).toBe(getGlassMaterial("#a78bfa", 0.04));
  });
  it("glass sides are four quads with uv.y from base to top", () => {
    const g = glassSidesGeometry(4, 3, 2);
    expect(g.getIndex()!.count).toBe(24);
    const uv = g.getAttribute("uv");
    expect(uv.getY(0)).toBe(0);
    expect(uv.getY(2)).toBe(1);
  });
  it("rim bars are thin and merged", () => {
    expect(rimThickness(10, 4, 10)).toBe(0.045);
    expect(rimThickness(0.1, 4, 0.1)).toBeCloseTo(0.03);
    const g = rimGeometry(2, 2, 2, 0.05);
    g.computeBoundingBox();
    expect(g.boundingBox!.max.x).toBeCloseTo(1.025);
  });
  it("lane ribbons measure distance along the path in uv.x", () => {
    const g = laneRibbonGeometry([[[0, 0], [3, 0], [3, 4]]]);
    const uv = g.getAttribute("uv");
    expect(uv.count).toBe(8);
    expect(uv.getX(7)).toBeCloseTo(7);
  });
});
