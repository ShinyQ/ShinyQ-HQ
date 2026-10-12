import { describe, expect, it } from "vitest";
import { bookBuffers, PAGE_ANGLES, PAGE_SEGMENTS, STAGE_BOOK, stageBook, turnAngle } from "@/experience/floors/library/decor/flipBooks";
import { dockAlong, paperSlots } from "@/experience/floors/library/model";

describe("open-book holograms", () => {
  it("builds three pages per book in one buffer set", () => {
    const b = bookBuffers([
      { x: 0, y: 2, z: 0, face: 0, size: 1.6, phase: 0 },
      { x: 5, y: 2, z: 0, face: 1, size: 5, phase: 0.5 },
    ]);
    const perPage = (PAGE_SEGMENTS + 1) * 2;
    expect(b.positions.length / 3).toBe(2 * PAGE_ANGLES.length * perPage);
    expect(b.indices.length).toBe(2 * PAGE_ANGLES.length * PAGE_SEGMENTS * 6);
    expect(Math.max(...b.indices)).toBe(b.positions.length / 3 - 1);
    expect(new Set(b.angles)).toEqual(new Set(PAGE_ANGLES));
    expect(b.centers.slice(-3)).toEqual([5, 2, 0]);
  });

  it("turns a page over in the middle of each 8 s cycle and holds it half open under reduced motion", () => {
    expect(turnAngle(0, 0, false)).toBe(0);
    expect(turnAngle(4, 0, false)).toBeCloseTo(Math.PI / 2);
    expect(turnAngle(7, 0, false)).toBeCloseTo(Math.PI);
    expect(turnAngle(4, 0.25, false)).toBeCloseTo(Math.PI);
    for (const t of [0, 3, 6.5]) expect(turnAngle(t, 0.3, true)).toBe(Math.PI / 2);
  });
});

describe("the turning book on the Newsroom featured stage", () => {
  const [stage] = dockAlong([{ room: "L4:featured", zone: "blog" }], { a: { x: 0, z: 0 }, b: { x: 10, z: 0 }, side: 1, start: 2 }).stations;
  const top = 1.1;
  const book = stageBook(stage, top);

  it("floats centered over the stage, clear of the plinth", () => {
    expect(book).toMatchObject({ x: stage.center.x, z: stage.center.z, size: STAGE_BOOK.size });
    expect(book.y - book.size / 2).toBeGreaterThan(top);
  });

  it("opens toward the road and fits the stage footprint", () => {
    expect(Math.sin(book.face)).toBeCloseTo(-stage.facing.x);
    expect(Math.cos(book.face)).toBeCloseTo(-stage.facing.z);
    const halfWidth = 0.75 * book.size * Math.cos(PAGE_ANGLES[0]);
    const footprint = Math.min(stage.rect.maxX - stage.rect.minX, stage.rect.maxZ - stage.rect.minZ);
    expect(2 * halfWidth).toBeLessThan(footprint);
  });
});

describe("research paper plates", () => {
  const [station] = dockAlong([{ room: "L4:research", zone: "research" }], { a: { x: 0, z: 0 }, b: { x: 10, z: 0 }, side: -1, start: 0 }).stations;

  it("spread along the station front, just outside it, facing the road", () => {
    const slots = paperSlots(station, 4);
    expect(slots).toHaveLength(4);
    for (const s of slots) {
      expect(s.z).toBeCloseTo(station.rect.maxZ + 0.15);
      expect(s.x).toBeGreaterThan(station.rect.minX);
      expect(s.x).toBeLessThan(station.rect.maxX);
      expect(s.yaw).toBeCloseTo(0);
      expect(s.width).toBeGreaterThan(1);
    }
    const xs = slots.map((s) => s.x);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
    expect(xs[1] - xs[0]).toBeGreaterThan(slots[0].width);
  });
});
