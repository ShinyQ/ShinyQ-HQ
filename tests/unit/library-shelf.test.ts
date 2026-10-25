import { describe, expect, it } from "vitest";
import { SHELF, shelfSize, shelfSlots } from "@/experience/floors/library/shelf";

const bay = (along: number) => ({ center: { x: 0, z: -10 }, facing: { x: 0, z: -1 }, rect: { minX: -along / 2, maxX: along / 2, minZ: -13, maxZ: -7 } });
const posts = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`);
const overlap = (a: { minX: number; maxX: number; minZ: number; maxZ: number }, b: typeof a) => a.minX < b.maxX - 1e-6 && b.minX < a.maxX - 1e-6 && a.minZ < b.maxZ - 1e-6 && b.minZ < a.maxZ - 1e-6;

describe("shelf", () => {
  it("sizes rows and columns", () => {
    expect(shelfSize(1)).toMatchObject({ rows: 1, cols: 1, along: SHELF.minAlong });
    expect(shelfSize(14)).toMatchObject({ rows: 1, cols: 13 });
    expect(shelfSize(15)).toMatchObject({ rows: 2, cols: 7 });
    expect(shelfSize(40)).toMatchObject({ rows: 3, cols: 13 });
    expect(shelfSize(61)).toMatchObject({ rows: 3, cols: 20 });
  });
  it("places the lead first and every spine inside the bay without overlap per row", () => {
    for (const n of [1, 4, 14, 40, 61]) {
      const { along } = shelfSize(n);
      const b = bay(along);
      const slots = shelfSlots(b, posts(n));
      expect(slots).toHaveLength(n);
      expect(slots[0]).toMatchObject({ slug: "p0", lead: true });
      for (const s of slots) {
        expect(s.rect.minX).toBeGreaterThanOrEqual(b.rect.minX - 1e-6);
        expect(s.rect.maxX).toBeLessThanOrEqual(b.rect.maxX + 1e-6);
        expect(s.rect.minZ).toBeGreaterThanOrEqual(b.rect.minZ - 1e-6);
        expect(s.rect.maxZ).toBeLessThanOrEqual(b.rect.maxZ + 1e-6);
      }
      const byRow = new Map<number, typeof slots>();
      for (const s of slots.slice(1)) byRow.set(s.y, [...(byRow.get(s.y) ?? []), s]);
      for (const row of byRow.values()) for (let i = 0; i < row.length; i++) for (let j = i + 1; j < row.length; j++) expect(overlap(row[i].rect, row[j].rect)).toBe(false);
    }
  });
  it("puts the lead at the left end as seen from the road, spines to its right, row 0 at the bottom filled first", () => {
    // Facing north (into the bay from a road south of it): the viewer's left is west (-x).
    const slots = shelfSlots(bay(shelfSize(15).along), posts(15));
    const lead = slots[0];
    for (const s of slots.slice(1)) expect(s.at.x).toBeGreaterThan(lead.at.x);
    expect(slots.slice(1, 8).every((s) => s.y === 0)).toBe(true);
    expect(slots.slice(8).every((s) => s.y === SHELF.rowH)).toBe(true);
    expect(slots[2].at.x).toBeGreaterThan(slots[1].at.x);
    // Facing south (road north of the bay): the viewer's left is east (+x).
    const south = shelfSlots({ center: { x: 0, z: 10 }, facing: { x: 0, z: 1 }, rect: { minX: -4, maxX: 4, minZ: 7, maxZ: 13 } }, posts(3));
    expect(south[0].at.x).toBeGreaterThan(south[1].at.x);
    expect(south[1].at.x).toBeGreaterThan(south[2].at.x);
  });
  it("gives every spine a deterministic height within the spine range, the lead its own size", () => {
    const a = shelfSlots(bay(SHELF.minAlong), posts(4));
    const b = shelfSlots(bay(SHELF.minAlong), posts(4));
    expect(a).toEqual(b);
    expect(a[0]).toMatchObject({ w: SHELF.lead.w, d: SHELF.lead.d, h: SHELF.lead.h, y: 0 });
    for (const s of a.slice(1)) {
      expect(s.h).toBeLessThanOrEqual(SHELF.spine.h);
      expect(s.h).toBeGreaterThan(SHELF.spine.h - SHELF.spine.dh);
      expect(s).toMatchObject({ w: SHELF.spine.w, d: SHELF.spine.d, lead: false });
    }
  });
});
