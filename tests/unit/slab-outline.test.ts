import { describe, expect, it } from "vitest";
import { BoxGeometry, EdgesGeometry, type BufferGeometry } from "three";
import { SLAB_THICKNESS } from "@/experience/config";
import { slabOutline } from "@/experience/tower/slabOutline";
import { realLayouts } from "../helpers/real-layouts";

/** Segments as sorted endpoint keys (direction and order free), offset by `at`. */
function segments(g: BufferGeometry, at: [number, number, number] = [0, 0, 0]): string[] {
  const a = g.getAttribute("position");
  const key = (i: number) => [a.getX(i) + at[0], a.getY(i) + at[1], a.getZ(i) + at[2]].map((v) => (Math.round(v * 1e4) / 1e4 + 0).toFixed(4)).join(",");
  const out: string[] = [];
  for (let i = 0; i < a.count; i += 2) out.push([key(i), key(i + 1)].sort().join(" "));
  return out.sort();
}

describe("slab outline", () => {
  it("draws exactly the 12 box edges the old EdgesGeometry drew for every floor without wings", () => {
    for (const [id, layout] of Object.entries(realLayouts())) {
      const b = layout.bounds;
      const old = new EdgesGeometry(new BoxGeometry(b.maxX - b.minX, SLAB_THICKNESS, b.maxZ - b.minZ));
      const now = slabOutline(layout, SLAB_THICKNESS);
      expect(segments(now), id).toEqual(segments(old, [(b.minX + b.maxX) / 2, -SLAB_THICKNESS / 2, (b.minZ + b.maxZ) / 2]));
      expect(now.getAttribute("position").count, id).toBe(24);
    }
  });

  it("leaves the joint of an L-shaped slab out and stands a vertical edge on every turn", () => {
    const g = slabOutline({ bounds: { minX: -10, maxX: 10, minZ: -10, maxZ: 10 }, wings: [{ minX: -2, maxX: 6, minZ: 10, maxZ: 30 }] }, 1);
    const s = segments(g);
    // 8 outer edges at the top and the bottom, plus 8 turns.
    expect(s).toHaveLength(24);
    const onJoint = s.filter((k) => {
      const [p, q] = k.split(" ").map((e) => e.split(",").map(Number));
      return p[2] === 10 && q[2] === 10 && Math.min(p[0], q[0]) < 6 && Math.max(p[0], q[0]) > -2;
    });
    expect(onJoint).toEqual([]);
    expect(s).toContain("-2.0000,-1.0000,10.0000 -2.0000,0.0000,10.0000");
  });
});
