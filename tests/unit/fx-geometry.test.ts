import { describe, expect, it } from "vitest";
import { Mesh, PlaneGeometry, Vector3 } from "three";
import { getGlassMaterial, glassSidesGeometry, gridPlanesGeometry, laneRibbonGeometry, rimGeometry, rimThickness, type GridRect } from "@/experience/fx/geometry";
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
  it("grid planes draw every rect where one flat plane per rect drew it, in one geometry", () => {
    const rects: GridRect[] = [
      { w: 40, d: 30, center: [5, -3] },
      { w: 12, d: 8.5, center: [31, 10.25] },
    ];
    const y = 0.01;
    const merged = new Mesh(gridPlanesGeometry(rects));
    merged.rotation.x = -Math.PI / 2;
    merged.position.set(0, y, 0);
    merged.updateMatrixWorld();
    const pos = merged.geometry.getAttribute("position");
    const index = merged.geometry.getIndex()!;
    expect(pos.count).toBe(8);
    expect(index.count).toBe(12);
    const at = new Vector3();
    rects.forEach((r, k) => {
      const plane = new Mesh(new PlaneGeometry(r.w, r.d));
      plane.rotation.x = -Math.PI / 2;
      plane.position.set(r.center[0], y, r.center[1]);
      plane.updateMatrixWorld();
      const own = plane.geometry.getAttribute("position");
      for (let i = 0; i < own.count; i++) {
        const want = at.fromBufferAttribute(own, i).applyMatrix4(plane.matrixWorld).clone();
        const got = at.fromBufferAttribute(pos, k * 4 + i).applyMatrix4(merged.matrixWorld);
        expect(got.distanceTo(want)).toBeLessThan(1e-6);
      }
      // Same triangles in the same order and winding, so the planes still face up.
      const ownIndex = Array.from(plane.geometry.getIndex()!.array);
      expect(Array.from(index.array).slice(k * 6, k * 6 + 6)).toEqual(ownIndex.map((v) => v + k * 4));
    });
  });
});
