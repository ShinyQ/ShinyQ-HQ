import { describe, expect, it } from "vitest";
import { MAX_FRAME_DT } from "@/experience/rover/controller";
import { BOOST_TRAIL, rearCorners, TRAIL_JUMP, TrailBuffer, trailIndices, trailVertexCount, writeTrail, type TrailSample } from "@/experience/fx/boostTrail";

const sample = (x: number, z: number, t: number, y = 0): TrailSample => rearCorners(x, y, z, 0, t, { lx: 0, lz: 0, rx: 0, rz: 0, y: 0, t: 0 });
const cfg = { maxAge: 10, width: 0.14 };
const camera = { x: 0, y: 30, z: -30 };

function buffers(capacity: number) {
  const n = trailVertexCount(capacity);
  return { positions: new Float32Array(n * 3), colors: new Float32Array(n * 4) };
}

describe("trail ring buffer", () => {
  it("keeps the newest samples, newest first", () => {
    const buf = new TrailBuffer(4);
    for (let i = 0; i < 6; i++) buf.push(sample(0, i, i), 0.25);
    expect(buf.count).toBe(4);
    expect([0, 1, 2, 3].map((i) => buf.at(i).t)).toEqual([5, 4, 3, 2]);
  });

  it("skips samples closer than the spacing", () => {
    const buf = new TrailBuffer(8);
    expect(buf.push(sample(0, 0, 0), 0.25)).toBe(true);
    expect(buf.push(sample(0, 0.1, 0.1), 0.25)).toBe(false);
    expect(buf.push(sample(0, 0.3, 0.2), 0.25)).toBe(true);
    expect(buf.count).toBe(2);
  });

  it("starts over after a jump (teleport, elevator) or a floor change", () => {
    const buf = new TrailBuffer(8);
    buf.push(sample(0, 0, 0), 0.25);
    buf.push(sample(0, 1, 0.1), 0.25);
    buf.push(sample(0, 1 + TRAIL_JUMP + 0.5, 0.2), 0.25);
    expect(buf.count).toBe(1);
    buf.push(sample(0, 6, 0.3, 8), 0.25);
    expect(buf.count).toBe(1);
    expect(buf.at(0).y).toBeCloseTo(8 + BOOST_TRAIL.lampY);
  });

  it("never resets on a legitimate step: boost top speed over the longest frame", () => {
    expect(TRAIL_JUMP).toBeGreaterThan(18 * MAX_FRAME_DT);
  });

  it("places the two samples at the rear wheels, turned with the heading", () => {
    const s = rearCorners(10, 0, 5, Math.PI / 2, 0, { lx: 0, lz: 0, rx: 0, rz: 0, y: 0, t: 0 });
    // Facing +x: the rear is at smaller x, the wheels to either side in z.
    expect(s.lx).toBeCloseTo(10 + BOOST_TRAIL.rearZ);
    expect(s.rx).toBeCloseTo(10 + BOOST_TRAIL.rearZ);
    expect(Math.abs(s.lz - s.rz)).toBeCloseTo(2 * BOOST_TRAIL.rearX);
  });
});

describe("twin ribbon writer", () => {
  it("has static indices for both ribbons", () => {
    const idx = trailIndices(4);
    expect(idx.length).toBe(2 * 4 * 6);
    expect(Math.max(...idx)).toBe(trailVertexCount(4) - 1);
  });

  it("follows the driven path exactly, including curves", () => {
    const cap = 12;
    const buf = new TrailBuffer(cap);
    const path: TrailSample[] = [];
    // A quarter circle of radius 6, oldest first.
    for (let i = 0; i <= 10; i++) {
      const a = (i / 10) * (Math.PI / 2);
      const s = rearCorners(6 * Math.sin(a), 0, 6 - 6 * Math.cos(a), a, i * 0.05, { lx: 0, lz: 0, rx: 0, rz: 0, y: 0, t: 0 });
      path.push(s);
      buf.push(s, 0.25);
    }
    const head = { ...path[path.length - 1] };
    const { positions, colors } = buffers(cap);
    writeTrail(buf, head, camera, 1, 0.5, cfg, positions, colors);
    const K = cap + 1;
    // Ribbon 0 point k centerline is the midpoint of its two edge vertices.
    for (let k = 1; k <= 10; k++) {
      const a = 2 * k * 3;
      const mx = (positions[a] + positions[a + 3]) / 2;
      const mz = (positions[a + 2] + positions[a + 5]) / 2;
      const s = buf.at(k - 1);
      expect(mx).toBeCloseTo(s.lx, 5);
      expect(mz).toBeCloseTo(s.lz, 5);
      // Ribbon 1 follows the other wheel.
      const b = (2 * K + 2 * k) * 3;
      expect((positions[b] + positions[b + 3]) / 2).toBeCloseTo(s.rx, 5);
      expect((positions[b + 2] + positions[b + 5]) / 2).toBeCloseTo(s.rz, 5);
    }
  });

  it("fades with age and distance, and draws nothing at level 0", () => {
    const cap = 10;
    const buf = new TrailBuffer(cap);
    for (let i = 0; i < 10; i++) buf.push(sample(0, i * 0.5, i * 0.03), 0.25);
    const head = sample(0, 5, 0.3);
    const { positions, colors } = buffers(cap);
    const peak = writeTrail(buf, head, camera, 1, 0.3, { maxAge: 0.6, width: 0.14 }, positions, colors);
    expect(peak).toBeGreaterThan(0.5);
    const alphaAt = (k: number) => colors[2 * k * 4 + 3];
    for (let k = 1; k < 10; k++) expect(alphaAt(k)).toBeLessThanOrEqual(alphaAt(k - 1) + 1e-6);
    expect(alphaAt(10)).toBeLessThan(alphaAt(0));
    expect(writeTrail(buf, head, camera, 0, 0.3, cfg, positions, colors)).toBe(0);
    for (let i = 3; i < colors.length; i += 4) expect(colors[i]).toBe(0);
  });

  it("drops samples older than the max age and collapses unused points", () => {
    const cap = 6;
    const buf = new TrailBuffer(cap);
    for (let i = 0; i < 4; i++) buf.push(sample(0, i, i), 0.25);
    const head = sample(0, 4, 10);
    const { positions, colors } = buffers(cap);
    writeTrail(buf, head, camera, 1, 10, { maxAge: 0.5, width: 0.14 }, positions, colors);
    // Only the head is young enough: every other point has alpha 0.
    for (let k = 1; k <= cap; k++) expect(colors[2 * k * 4 + 3]).toBe(0);
  });
});
