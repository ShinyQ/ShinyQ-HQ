import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { expandSculpture, expandSculptures, SCULPTURE_MAX_BOXES, sculptureIssues, sculptureSignature, type SculptureFile } from "@/content/sculptures";

const file = JSON.parse(readFileSync(path.join(process.cwd(), "content", "sculptures.json"), "utf8")) as SculptureFile;

describe("sculpture recipes", () => {
  it("expands boxes with roll (degrees to radians), pulse and brightness", () => {
    expect(expandSculpture([[0, 0.5, 0, 1, 0.2, 0.1, { r: 90, p: 1.5, k: 0.4 }], [1, 0, 0, 0.1, 0.1, 0.1]])).toEqual([
      { x: 0, y: 0.5, z: 0, w: 1, h: 0.2, d: 0.1, pulse: 1.5, r: 1.571, k: 0.4 },
      { x: 1, y: 0, z: 0, w: 0.1, h: 0.1, d: 0.1 },
    ]);
  });

  it("expands rings (full or an arc, tangent segments) and bottom-aligned bars", () => {
    const ring = expandSculpture([{ ring: [0, 0, 0, 1, 4, 0.1], plane: "xz" }]);
    expect(ring.map((p) => [p.x, p.z])).toEqual([
      [1, 0],
      [0, 1],
      [-1, 0],
      [0, -1],
    ]);
    const arc = expandSculpture([{ ring: [0, 0, 0, 1, 3, 0.1], plane: "xy", arc: [180, 0], seg: 0.3 }]);
    expect(arc.map((p) => [p.x, p.y])).toEqual([
      [-1, 0],
      [0, 1],
      [1, 0],
    ]);
    expect(arc[0].w).toBe(0.3);
    expect(arc[1].r).toBeCloseTo(Math.PI);
    const bars = expandSculpture([{ bars: [-0.5, -0.5, 0, 0.5, 0.1, 0.1], h: [0.2, 0.4], pulse: true }]);
    expect(bars.map((p) => [p.x, p.y, p.h, p.pulse])).toEqual([
      [-0.5, -0.4, 0.2, 0],
      [0, -0.3, 0.4, 0.7],
    ]);
  });

  it("flags too many boxes and boxes outside the bounds (roll included)", () => {
    const many = Array.from({ length: SCULPTURE_MAX_BOXES + 1 }, (_, i) => ({ x: 0, y: i * 0.01, z: 0, w: 0.1, h: 0.1, d: 0.1 }));
    expect(sculptureIssues("many", many)).toEqual([`sculpture "many" has 17 boxes (at most 16)`]);
    expect(sculptureIssues("wide", [{ x: 1.2, y: 0, z: 0, w: 0.2, h: 0.1, d: 0.1 }])).toHaveLength(1);
    // A 1 u tall bar rolled 90 degrees spans 1 u along x.
    expect(sculptureIssues("rolled", [{ x: 0.8, y: 0, z: 0, w: 0.05, h: 1, d: 0.05, r: Math.PI / 2 }])).toHaveLength(1);
    expect(sculptureIssues("ok", [{ x: 0.8, y: 0, z: 0, w: 0.05, h: 1, d: 0.05 }])).toEqual([]);
  });

  it("keeps every shipped sculpture within its cap and bounds, and no two alike", () => {
    const all = expandSculptures(file);
    expect(Object.keys(all).length).toBeGreaterThanOrEqual(39);
    const seen = new Set<string>();
    for (const [id, parts] of Object.entries(all)) {
      expect(sculptureIssues(id, parts), id).toEqual([]);
      const sig = sculptureSignature(parts);
      expect(seen.has(sig), id).toBe(false);
      seen.add(sig);
    }
    // 39 pods at the cap stay far under the 30k triangle frame budget (12 triangles a box).
    expect(Object.values(all).reduce((n, p) => n + p.length, 0) * 12).toBeLessThan(39 * SCULPTURE_MAX_BOXES * 12);
  });
});
