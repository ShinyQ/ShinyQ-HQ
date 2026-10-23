import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { arcPoints, arcSteps, DOT, pathStrokes, strokeSegments, svgToStrokes, tidy } from "@/lib/svg-strokes";

const svg = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">${body}</svg>`;
const ICONS = path.join(process.cwd(), "assets", "icons", "lucide");

describe("SVG path parsing", () => {
  it("reads absolute and relative lines, H, V and Z", () => {
    expect(pathStrokes("M2 2L10 2H20V12h-4v4l-2 2Z")).toEqual([
      {
        points: [
          [2, 2],
          [10, 2],
          [20, 2],
          [20, 12],
          [16, 12],
          [16, 16],
          [14, 18],
        ],
        closed: true,
      },
    ]);
  });

  it("starts a new subpath on every M and treats extra M pairs as lines", () => {
    const strokes = pathStrokes("M1 1 2 2 3 3M10 10l1 0m2 0 1 1");
    expect(strokes.map((s) => s.points)).toEqual([
      [
        [1, 1],
        [2, 2],
        [3, 3],
      ],
      [
        [10, 10],
        [11, 10],
      ],
      [
        [13, 10],
        [14, 11],
      ],
    ]);
  });

  it("reads packed numbers and packed arc flags", () => {
    // "a2 2 0 012 2": rx 2, ry 2, rotation 0, large 0, sweep 1, to (+2, +2); ".5.5" is two numbers.
    const [s] = pathStrokes("M10 10a2 2 0 012 2l.5.5");
    const end = s.points[s.points.length - 2];
    expect(end[0]).toBeCloseTo(12);
    expect(end[1]).toBeCloseTo(12);
    expect(s.points[s.points.length - 1]).toEqual([12.5, 12.5]);
  });

  it("flattens cubic, smooth cubic, quadratic and smooth quadratic curves through their end points", () => {
    for (const d of ["M2 12C2 2 22 2 22 12", "M2 12c0-10 20-10 20 0s-20 10-20 0", "M2 12Q12 2 22 12", "M2 12q10-10 20 0t20 0"]) {
      const [s] = pathStrokes(d);
      expect(s.points.length).toBeGreaterThan(3);
      expect(s.points.length).toBeLessThanOrEqual(1 + 2 * 10);
    }
    const [c] = pathStrokes("M2 12C2 2 22 2 22 12");
    expect(c.points[c.points.length - 1]).toEqual([22, 12]);
    // The middle of the symmetric cubic is at t = 0.5: y = 12 - 0.75 * 10.
    expect(Math.min(...c.points.map((p) => p[1]))).toBeCloseTo(4.5, 0);
  });

  it("flattens arcs on their circle, in the sweep direction", () => {
    const pts = arcPoints([2, 12], 10, 10, 0, 0, 1, [22, 12]);
    expect(pts[pts.length - 1]).toEqual([22, 12]);
    for (const [x, y] of pts) expect(Math.hypot(x - 12, y - 12)).toBeCloseTo(10, 5);
    // Sweep 1 from (2, 12) to (22, 12) around (12, 12) passes through the top (y = 2) in SVG coordinates.
    expect(Math.min(...pts.map((p) => p[1]))).toBeCloseTo(2, 0);
    // Radii too small for the chord are scaled up (SVG rule).
    const small = arcPoints([0, 0], 1, 1, 0, 0, 1, [10, 0]);
    expect(small[small.length - 1]).toEqual([10, 0]);
    expect(arcPoints([0, 0], 0, 5, 0, 0, 1, [4, 4])).toEqual([[4, 4]]);
  });

  it("uses about 16 segments for a full 10 u circle and 2 for a small corner", () => {
    expect(arcSteps(2 * Math.PI, 10)).toBe(16);
    expect(arcSteps(Math.PI / 2, 2)).toBe(2);
  });

  it("rejects unknown commands, transforms and other view boxes", () => {
    expect(() => pathStrokes("M0 0X1 1")).toThrow(/Unsupported path command/);
    expect(() => svgToStrokes(svg('<path d="M0 0L1 1" transform="scale(2)"/>'))).toThrow(/Transforms/);
    expect(() => svgToStrokes('<svg viewBox="0 0 48 48"><path d="M0 0L1 1"/></svg>')).toThrow(/viewBox/);
  });
});

describe("SVG elements", () => {
  it("reads line, polyline, polygon, circle, ellipse and rect", () => {
    const strokes = svgToStrokes(
      svg(
        '<line x1="2" y1="2" x2="22" y2="2"/><polyline points="2 6 12 10 22 6"/><polygon points="2,14 6,18 2,22"/>' +
          '<circle cx="12" cy="12" r="10"/><ellipse cx="12" cy="12" rx="6" ry="3"/><rect x="4" y="4" width="16" height="16" rx="2"/><rect x="8" y="8" width="8" height="8"/>',
      ),
    );
    expect(strokes).toHaveLength(7);
    const [line, poly, gon, circle, ellipse, round, square] = strokes;
    expect(line).toEqual({ points: [[2, 2], [22, 2]] });
    expect(poly.closed).toBeUndefined();
    expect(gon.closed).toBe(true);
    expect(circle.closed).toBe(true);
    expect(circle.points.length).toBeGreaterThanOrEqual(12);
    for (const [x, y] of circle.points) expect(Math.hypot(x - 12, y - 12)).toBeCloseTo(10, 1);
    expect(Math.max(...ellipse.points.map((p) => p[0]))).toBeCloseTo(18, 1);
    expect(Math.max(...ellipse.points.map((p) => p[1]))).toBeCloseTo(15, 1);
    expect(round.closed).toBe(true);
    expect(round.points.length).toBeGreaterThan(8);
    expect(square).toEqual({ points: [[8, 8], [16, 8], [16, 16], [8, 16]], closed: true });
  });

  it("turns tiny subpaths (Lucide dots) into small closed diamonds", () => {
    const [dot] = svgToStrokes(svg('<path d="M9 9h.01"/>'));
    expect(dot.closed).toBe(true);
    expect(dot.points).toHaveLength(4);
    const xs = dot.points.map((p) => p[0]);
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(1);
    expect(tidy({ points: [[0, 0], [DOT / 2, 0]] }).closed).toBe(true);
  });

  it("simplifies collinear runs and rounds to 0.01", () => {
    const s = tidy({ points: [[0, 0], [1, 0.001], [2, 0], [3.33333, 0]] });
    expect(s.points).toEqual([[0, 0], [3.33, 0]]);
    expect(strokeSegments([s, { points: [[0, 0], [1, 0], [1, 1]], closed: true }])).toBe(4);
  });
});

describe("vendored Lucide icons", () => {
  const files = readdirSync(ICONS).filter((f) => f.endsWith(".svg"));

  it("ships the ISC licence and an attribution note next to the icons", () => {
    expect(readFileSync(path.join(ICONS, "LICENSE"), "utf8")).toMatch(/ISC License/);
    expect(readFileSync(path.join(ICONS, "README.md"), "utf8")).toMatch(/Lucide/);
  });

  it("converts every icon into the 24 x 24 grid with a modest segment count", () => {
    expect(files.length).toBeGreaterThan(20);
    for (const f of files) {
      const strokes = svgToStrokes(readFileSync(path.join(ICONS, f), "utf8"));
      expect(strokes.length, f).toBeGreaterThan(0);
      for (const s of strokes) {
        for (const [x, y] of s.points) {
          expect(x, f).toBeGreaterThanOrEqual(0.5);
          expect(x, f).toBeLessThanOrEqual(23.5);
          expect(y, f).toBeGreaterThanOrEqual(0.5);
          expect(y, f).toBeLessThanOrEqual(23.5);
        }
      }
      // Ribbons cost 2 triangles a segment per layer: keep each icon near the old hand-drawn ones (20 to 40).
      expect(strokeSegments(strokes), f).toBeLessThanOrEqual(60);
    }
  });
});
