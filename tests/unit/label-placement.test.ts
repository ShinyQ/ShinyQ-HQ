import { describe, expect, it } from "vitest";
import { boxesOverlap, overlapArea, placeLabels, polygonArea, polygonOverlap, type Quad, type ScreenBox } from "@/experience/fx/labelPlacement";

const box = (x: number, y: number, w = 100, h = 20): ScreenBox => ({ x0: x, y0: y, x1: x + w, y1: y + h });

describe("screen-space label placement", () => {
  it("shows fixed signs first, then the highest priority labels that overlap nothing", () => {
    const shown = placeLabels(
      [
        { box: box(0, 0), priority: 1 },
        { box: box(50, 10), priority: 5 },
        { box: box(300, 0), priority: 2 },
        { box: box(40, 5), priority: 0, fixed: true },
      ],
      10,
    );
    // The fixed sign wins its spot; both labels that collide with it hide.
    expect(shown).toEqual([false, false, true, true]);
  });

  it("caps the free labels at `max`, highest priority first, and skips labels without a box", () => {
    const items = [0, 1, 2, 3, 4].map((i) => ({ box: box(i * 200, 0), priority: i }));
    expect(placeLabels(items, 2)).toEqual([false, false, false, true, true]);
    expect(placeLabels([{ box: null, priority: 9 }, { box: box(0, 0), priority: 1 }], 5)).toEqual([false, true]);
  });

  it("never leaves two shown boxes overlapping, whatever the input", () => {
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let run = 0; run < 50; run++) {
      const items = Array.from({ length: 20 }, () => ({ box: box(rand() * 800, rand() * 500, 60 + rand() * 120, 18 + rand() * 10), priority: rand() * 10, fixed: rand() < 0.1 }));
      const shown = placeLabels(items, 8);
      const free = items.filter((it, i) => shown[i] && !it.fixed);
      expect(free.length).toBeLessThanOrEqual(8);
      const boxes = items.filter((_, i) => shown[i]);
      for (let a = 0; a < boxes.length; a++)
        for (let b = a + 1; b < boxes.length; b++) {
          if (boxes[a].fixed && boxes[b].fixed) continue;
          expect(overlapArea(boxes[a].box, boxes[b].box)).toBe(0);
        }
    }
  });

  it("measures overlap", () => {
    expect(boxesOverlap(box(0, 0), box(99, 19))).toBe(true);
    expect(boxesOverlap(box(0, 0), box(102, 0))).toBe(false);
    expect(boxesOverlap(box(0, 0), box(102, 0), 4)).toBe(true);
    expect(overlapArea(box(0, 0), box(50, 10))).toBe(500);
  });

  it("measures the overlap of rotated quads exactly (the projected plates)", () => {
    const square = (x: number, y: number, s = 10): Quad => [[x, y], [x + s, y], [x + s, y + s], [x, y + s]];
    expect(polygonOverlap(square(0, 0), square(5, 5))).toBeCloseTo(25);
    expect(polygonOverlap(square(0, 0), [...square(5, 5)].reverse())).toBeCloseTo(25);
    expect(polygonOverlap(square(0, 0), square(20, 0))).toBe(0);
    // Two tilted plates stacked with a gap: their bounding boxes overlap, the plates do not.
    const tilt = (y: number): Quad => [[0, y], [100, y + 20], [100, y + 40], [0, y + 20]];
    expect(polygonOverlap(tilt(0), tilt(22))).toBe(0);
    expect(overlapArea({ x0: 0, y0: 0, x1: 100, y1: 40 }, { x0: 0, y0: 22, x1: 100, y1: 62 })).toBeGreaterThan(0);
    expect(polygonArea(square(0, 0, 4))).toBe(16);
  });
});
