import { describe, expect, it } from "vitest";
import { boxCorners, inSlabShadow, type Box3Like, type SlabRect, type Vec3 } from "@/experience/tower/slabShadow";

// The L2 slab (y 14) over the Lobby (y 0): 40 x 20 u, top at 14, 0.4 u thick.
const SLAB: SlabRect = { minX: -20, maxX: 20, minZ: -10, maxZ: 10, top: 14, bottom: 13.6 };
const box = (min: Vec3, max: Vec3): Box3Like => ({ min, max });

describe("inSlabShadow", () => {
  it("covers a box right under the slab middle seen from above", () => {
    expect(inSlabShadow([0, 36, 0], SLAB, box([-2, 0, -2], [2, 5, 2]))).toBe(true);
  });

  it("covers a box under the slab seen from an eye outside its rectangle when every ray crosses the top face", () => {
    // Eye east of the slab, high up; the box sits well inside, near the west edge.
    expect(inSlabShadow([30, 60, 0], SLAB, box([-12, 0, -2], [-8, 4, 2]))).toBe(true);
  });

  it("does not cover a box under the slab edge seen from outside (rays pass under the edge)", () => {
    // Eye west of the slab, low: rays to the west end of the floor below pass outside the rectangle.
    expect(inSlabShadow([-40, 30, 0], SLAB, box([-19, 0, -2], [-15, 4, 2]))).toBe(false);
  });

  it("covers a box slightly outside the footprint (the shadow widens below the slab) but not one beyond the shadow", () => {
    // From (0, 36, 0), the ray to (25, 0, 0) crosses y = 14 at x = 15.3: on the slab.
    expect(inSlabShadow([0, 36, 0], SLAB, box([15, 0, -2], [25, 2, 2]))).toBe(true);
    // The ray to (60, 0, 0) crosses at x = 36.7: past the east edge.
    expect(inSlabShadow([0, 36, 0], SLAB, box([15, 0, -2], [60, 2, 2]))).toBe(false);
  });

  it("needs the eye above the slab top", () => {
    expect(inSlabShadow([0, 14, 0], SLAB, box([-2, 0, -2], [2, 5, 2]))).toBe(false);
    expect(inSlabShadow([0, 10, 0], SLAB, box([-2, 0, -2], [2, 5, 2]))).toBe(false);
  });

  it("needs the box entirely below the slab bottom", () => {
    expect(inSlabShadow([0, 36, 0], SLAB, box([-2, 0, -2], [2, 13.7, 2]))).toBe(false);
    expect(inSlabShadow([0, 36, 0], SLAB, box([-2, 0, -2], [2, 13.5, 2]))).toBe(true);
  });

  it("never covers an empty or unbounded box", () => {
    expect(inSlabShadow([0, 36, 0], SLAB, box([Infinity, Infinity, Infinity], [-Infinity, -Infinity, -Infinity]))).toBe(false);
    expect(inSlabShadow([0, 36, 0], SLAB, box([-Infinity, 0, -2], [2, 5, 2]))).toBe(false);
    expect(inSlabShadow([0, 36, 0], SLAB, box([3, 0, -2], [2, 5, 2]))).toBe(false);
  });

  it("keeps a margin inside the slab edges", () => {
    // The corner projects 0.3 u inside the east edge: inside the rectangle, but within the default margin.
    const eye: Vec3 = [0, 28, 0];
    // Ray from the eye to (x, 0, 0) crosses y = 14 at x / 2, so x = 39.4 lands at 19.7.
    const near = box([38, 0, -1], [39.4, 0, 1]);
    expect(inSlabShadow(eye, SLAB, near, 0)).toBe(true);
    expect(inSlabShadow(eye, SLAB, near)).toBe(false);
  });

  it("matches a brute-force ray test on sampled points", () => {
    const eye: Vec3 = [-30, 40, 25];
    const b = box([-10, 0, -6], [12, 6, 5]);
    const covered = inSlabShadow(eye, SLAB, b, 0);
    let allHit = true;
    for (let i = 0; i <= 10; i++)
      for (let j = 0; j <= 10; j++)
        for (let k = 0; k <= 4; k++) {
          const p: Vec3 = [b.min[0] + ((b.max[0] - b.min[0]) * i) / 10, b.min[1] + ((b.max[1] - b.min[1]) * k) / 4, b.min[2] + ((b.max[2] - b.min[2]) * j) / 10];
          const t = (eye[1] - SLAB.top) / (eye[1] - p[1]);
          const qx = eye[0] + (p[0] - eye[0]) * t;
          const qz = eye[2] + (p[2] - eye[2]) * t;
          if (qx < SLAB.minX || qx > SLAB.maxX || qz < SLAB.minZ || qz > SLAB.maxZ) allHit = false;
        }
    expect(covered).toBe(allHit);
  });
});

describe("boxCorners", () => {
  it("lists the 8 corners", () => {
    const corners = boxCorners(box([0, 1, 2], [3, 4, 5]));
    expect(corners).toHaveLength(8);
    expect(new Set(corners.map((c) => c.join(","))).size).toBe(8);
    expect(corners).toContainEqual([0, 1, 2]);
    expect(corners).toContainEqual([3, 4, 5]);
  });
});
