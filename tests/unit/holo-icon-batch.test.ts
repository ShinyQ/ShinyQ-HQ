import { describe, expect, it } from "vitest";
import { Color } from "three";
import { DESK, deskSlots, faceRoad, STATION_HEIGHT } from "@/experience/floors/library/icons";
import type { LibraryStation } from "@/experience/floors/library/model";
import { instanced } from "@/experience/fx/HoloIcon";
import { CAREER_ICONS, iconMesh, LIBRARY_ICONS } from "@/experience/fx/holoIcons";

describe("batched HoloIcon geometry", () => {
  it("packs different icons, sizes and colors into one geometry", () => {
    const g = instanced(
      [
        { x: 1, y: 2, z: 3, face: 0 },
        { x: 4, y: 5, z: 6, face: 1, strokes: CAREER_ICONS.award, color: "#ff0000", size: 1 },
      ],
      CAREER_ICONS.job,
      "#00ff00",
      2,
      1.5,
    );
    const job = iconMesh(CAREER_ICONS.job, 1.5);
    const award = iconMesh(CAREER_ICONS.award, 1.5);
    const n = (job.positions.length + award.positions.length) / 3;
    expect(g.getAttribute("position").count).toBe(n);
    for (const name of ["aCenter", "aFace", "aPhase", "aColor"]) expect(g.getAttribute(name).count, name).toBe(n);
    expect(g.index!.count).toBe(job.indices.length + award.indices.length);
    expect(Math.max(...(g.index!.array as Uint32Array))).toBe(n - 1);

    const first = job.positions.length / 3;
    // Each instance scales the unit mesh to its size (the default 2, its own 1).
    expect(g.getAttribute("position").getX(0)).toBeCloseTo(job.positions[0] * 2);
    expect(g.getAttribute("position").getX(first)).toBeCloseTo(award.positions[0]);
    // Colors are linear (as `Color.set` gives them); the default for instances without their own.
    const green = new Color("#00ff00");
    const red = new Color("#ff0000");
    expect([g.getAttribute("aColor").getX(0), g.getAttribute("aColor").getY(0)]).toEqual([green.r, green.g]);
    expect(g.getAttribute("aColor").getX(first)).toBe(red.r);
    expect([g.getAttribute("aCenter").getX(first), g.getAttribute("aFace").getX(first)]).toEqual([4, 1]);
    g.dispose();
  });

  it("offsets the halo layer in z and keeps the attribute set of a single-icon batch", () => {
    const g = instanced([{ x: 0, y: 0, z: 0, face: 0 }], LIBRARY_ICONS.blog, "#ffffff", 2, 4, -0.02);
    expect(new Set(Array.from({ length: g.getAttribute("position").count }, (_, i) => g.getAttribute("position").getZ(i)))).toEqual(new Set([-0.02].map(Math.fround)));
    expect(Object.keys(g.attributes).sort()).toEqual(["aCenter", "aColor", "aFace", "aPhase", "position"]);
    g.dispose();
  });
});

describe("L4 desk item icons", () => {
  const desk = (facing: { x: number; z: number }): LibraryStation => ({
    room: "L4:talks",
    zone: "talks",
    rect: { minX: 60, maxX: 68, minZ: 7, maxZ: 13 },
    center: { x: 64, z: 10 },
    door: { x: 64, z: 6 },
    facing,
    from: { x: 64, z: 0 },
  });

  it("puts up to 4 items in one row across the desk, facing the road", () => {
    const s = desk({ x: 0, z: 1 });
    const slots = deskSlots(s, 4);
    expect(slots.map((p) => p.z)).toEqual([10, 10, 10, 10]);
    const xs = slots.map((p) => p.x);
    // Looking along +z (from the road into the desk) the right hand is -x: left to right as seen from the road.
    expect(xs[0] - xs[3]).toBeGreaterThan(5);
    expect(new Set(slots.map((p) => p.y))).toEqual(new Set([STATION_HEIGHT.talks + DESK.lift]));
    expect(Math.abs(faceRoad(s))).toBeCloseTo(Math.PI);
  });

  it("splits 5 or more items into two rows, the first nearer the road, inside the desk", () => {
    const s = desk({ x: 0, z: 1 });
    const slots = deskSlots(s, 6);
    expect(slots.slice(0, 3).every((p) => p.z < s.center.z)).toBe(true);
    expect(slots.slice(3).every((p) => p.z > s.center.z)).toBe(true);
    for (const p of slots) {
      expect(p.x).toBeGreaterThan(s.rect.minX);
      expect(p.x).toBeLessThan(s.rect.maxX);
      expect(p.z).toBeGreaterThan(s.rect.minZ);
      expect(p.z).toBeLessThan(s.rect.maxZ);
    }
    // Item positions are distinct.
    expect(new Set(slots.map((p) => `${p.x},${p.z}`)).size).toBe(6);
    // Six items (the Talks desk today) fit the narrowest desk (8 u along), icons included.
    const xs = slots.map((p) => p.x);
    expect(Math.max(...xs) - Math.min(...xs) + DESK.size).toBeLessThanOrEqual(s.rect.maxX - s.rect.minX);
  });
});
