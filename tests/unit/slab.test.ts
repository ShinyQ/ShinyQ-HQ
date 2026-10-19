import { describe, expect, it } from "vitest";
import { clampToSlab, inSlab, slabBox, slabCorners, slabEdges, slabInsetRects, slabRects, type SlabShape } from "@/experience/nav/slab";
import type { Rect, Vec2 } from "@/experience/types";

/** An L-shaped slab: the main rect plus a wing touching part of its south edge (x -2 to 6). */
const main: Rect = { minX: -10, maxX: 10, minZ: -10, maxZ: 10 };
const wing: Rect = { minX: -2, maxX: 6, minZ: 10, maxZ: 30 };
const L: SlabShape = { bounds: main, wings: [wing] };
const plain: SlabShape = { bounds: main };
const v = (x: number, z: number): Vec2 => ({ x, z });

describe("slab rects and box", () => {
  it("lists the main rect first, then the wings", () => {
    expect(slabRects(L)).toEqual([main, wing]);
    expect(slabRects(plain)).toEqual([main]);
    expect(slabRects({ bounds: main, wings: [] })).toEqual([main]);
  });

  it("boxes every rect", () => {
    expect(slabBox(L)).toEqual({ minX: -10, maxX: 10, minZ: -10, maxZ: 30 });
    expect(slabBox(plain)).toEqual(main);
  });
});

describe("inSlab", () => {
  it("is true inside both rects and on the shared joint, false in the missing corner", () => {
    expect(inSlab(v(0, 0), L)).toBe(true);
    expect(inSlab(v(0, 20), L)).toBe(true);
    expect(inSlab(v(0, 10), L)).toBe(true);
    expect(inSlab(v(8, 20), L)).toBe(false);
    expect(inSlab(v(-6, 12), L)).toBe(false);
    expect(inSlab(v(0, 31), L)).toBe(false);
  });

  it("with an inset, the joint is not a wall but every outer edge and the concave corners are", () => {
    expect(inSlab(v(0, 10), L, 1)).toBe(true);
    expect(inSlab(v(0, 10.5), L, 1)).toBe(true);
    expect(inSlab(v(0, 9.5), L, 1)).toBe(true);
    // Within 1 u of the concave corner (-2, 10) or of the wing's west edge.
    expect(inSlab(v(-1.5, 10), L, 1)).toBe(false);
    expect(inSlab(v(-1.5, 20), L, 1)).toBe(false);
    // Main slab's south edge outside the joint is still an edge.
    expect(inSlab(v(8, 9.5), L, 1)).toBe(false);
    expect(inSlab(v(8, 9), L, 1)).toBe(true);
    expect(inSlab(v(-9.5, 0), L, 1)).toBe(false);
    expect(inSlab(v(0, 29.5), L, 1)).toBe(false);
  });

  it("matches the plain rect test without wings", () => {
    for (let x = -12; x <= 12; x += 0.5)
      for (let z = -12; z <= 12; z += 0.5) {
        const r = 1.25;
        expect(inSlab(v(x, z), plain, r)).toBe(x >= main.minX + r && x <= main.maxX - r && z >= main.minZ + r && z <= main.maxZ - r);
      }
  });
});

describe("clampToSlab", () => {
  it("leaves a valid point where it is and writes into the out vector", () => {
    const out = v(99, 99);
    expect(clampToSlab(v(0, 10), L, 1, out)).toBe(out);
    expect(out).toEqual(v(0, 10));
  });

  it("moves a point to the nearest point of the inset union", () => {
    expect(clampToSlab(v(8, 20), L, 1, v(0, 0))).toEqual(v(5, 20));
    expect(clampToSlab(v(0, 40), L, 1, v(0, 0))).toEqual(v(0, 29));
    expect(clampToSlab(v(20, 0), L, 1, v(0, 0))).toEqual(v(9, 0));
    expect(clampToSlab(v(-5, 12), L, 1, v(0, 0))).toEqual(v(-5, 9));
    // From the missing corner next to the joint: the bridge across the joint is the nearest part.
    expect(clampToSlab(v(5.5, 10.2), L, 1, v(0, 0))).toEqual(v(5, 10.2));
  });

  it("may write into the point it reads", () => {
    const p = v(8, 20);
    clampToSlab(p, L, 1, p);
    expect(p).toEqual(v(5, 20));
  });

  it("is the plain rect clamp without wings", () => {
    const out = v(0, 0);
    for (const p of [v(50, -50), v(0, 0), v(-9.5, 3), v(3, 9.99)]) {
      clampToSlab(p, plain, 1, out);
      expect(out).toEqual(v(Math.max(-9, Math.min(9, p.x)), Math.max(-9, Math.min(9, p.z))));
    }
  });
});

describe("inset rects", () => {
  it("shrinks every rect and bridges each joint", () => {
    expect(slabInsetRects(plain, 1)).toEqual([{ minX: -9, maxX: 9, minZ: -9, maxZ: 9 }]);
    expect(slabInsetRects(L, 1)).toEqual([
      { minX: -9, maxX: 9, minZ: -9, maxZ: 9 },
      { minX: -1, maxX: 5, minZ: 11, maxZ: 29 },
      { minX: -1, maxX: 5, minZ: 9, maxZ: 11 },
    ]);
  });

  it("bridges joints on the x axis too, whichever rect comes first", () => {
    const east: SlabShape = { bounds: main, wings: [{ minX: 10, maxX: 20, minZ: -4, maxZ: 4 }] };
    expect(slabInsetRects(east, 1)[2]).toEqual({ minX: 9, maxX: 11, minZ: -3, maxZ: 3 });
    const west: SlabShape = { bounds: { minX: 10, maxX: 20, minZ: -4, maxZ: 4 }, wings: [main] };
    expect(slabInsetRects(west, 1)[2]).toEqual({ minX: 9, maxX: 11, minZ: -3, maxZ: 3 });
  });

  it("caches per wings array and inset", () => {
    expect(slabInsetRects(L, 1)).toBe(slabInsetRects(L, 1));
    expect(slabInsetRects(L, 2)).not.toBe(slabInsetRects(L, 1));
  });
});

describe("slab outline", () => {
  it("is the four sides of a plain slab", () => {
    expect(slabEdges(plain)).toEqual([
      { minX: -10, maxX: -10, minZ: -10, maxZ: 10 },
      { minX: 10, maxX: 10, minZ: -10, maxZ: 10 },
      { minX: -10, maxX: 10, minZ: -10, maxZ: -10 },
      { minX: -10, maxX: 10, minZ: 10, maxZ: 10 },
    ]);
    expect(slabCorners(plain)).toHaveLength(4);
  });

  it("drops the shared joint and keeps every outer edge", () => {
    const edges = slabEdges(L);
    expect(edges).toHaveLength(8);
    // Nothing runs along the joint (z 10, x -2 to 6).
    expect(edges.some((e) => e.minZ === 10 && e.maxZ === 10 && e.minX < 6 && e.maxX > -2)).toBe(false);
    expect(edges).toEqual(
      expect.arrayContaining([
        { minX: -10, maxX: -2, minZ: 10, maxZ: 10 },
        { minX: 6, maxX: 10, minZ: 10, maxZ: 10 },
        { minX: -2, maxX: -2, minZ: 10, maxZ: 30 },
        { minX: 6, maxX: 6, minZ: 10, maxZ: 30 },
        { minX: -2, maxX: 6, minZ: 30, maxZ: 30 },
      ]),
    );
    const total = edges.reduce((s, e) => s + (e.maxX - e.minX) + (e.maxZ - e.minZ), 0);
    expect(total).toBe(80 - 8 + 2 * 20 + 8);
  });

  it("puts a corner where the outline turns, none where two sides run on in line", () => {
    const corners = slabCorners(L).map((c) => `${c.x},${c.z}`).sort();
    expect(corners).toEqual(["-10,-10", "-10,10", "-2,10", "-2,30", "10,-10", "10,10", "6,10", "6,30"].sort());
    // A wing as wide as the slab continues its sides: no corner at the joint.
    const flush: SlabShape = { bounds: main, wings: [{ minX: -10, maxX: 10, minZ: 10, maxZ: 20 }] };
    expect(slabEdges(flush)).toHaveLength(6);
    expect(slabCorners(flush).map((c) => `${c.x},${c.z}`).sort()).toEqual(["-10,-10", "-10,20", "10,-10", "10,20"]);
  });
});
