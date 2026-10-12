import { describe, expect, it } from "vitest";
import {
  boxBuffers,
  boxEdgeBuffers,
  latticeSegments,
  mulberry32,
  ringPoints,
  roofDetail,
  scatter,
  SKYLINE_GROUND,
  skylineBoxes,
  skylineWindows,
  type Box,
} from "@/experience/floors/roof/solids";

const unit: Box = { x: 0, y: 0, z: 0, w: 2, h: 4, d: 6 };

describe("roof solids", () => {
  it("merges boxes into one indexed buffer with outward normals", () => {
    const { positions, normals, indices } = boxBuffers([unit, { x: 10, y: 1, z: 0, w: 1, h: 1, d: 1 }]);
    expect(positions.length).toBe(2 * 24 * 3);
    expect(normals.length).toBe(positions.length);
    expect(indices.length).toBe(2 * 36);
    expect(Math.max(...indices)).toBe(47);
    for (let v = 0; v < 24; v++) {
      const [x, y, z] = positions.slice(v * 3, v * 3 + 3);
      expect(x).toBeGreaterThanOrEqual(-1);
      expect(x).toBeLessThanOrEqual(1);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(4);
      expect(Math.abs(z)).toBeLessThanOrEqual(3);
      const [nx, ny, nz] = normals.slice(v * 3, v * 3 + 3);
      // Every vertex lies on the side its normal points out of.
      expect(x * nx + (y - 2) * ny + z * nz).toBeGreaterThan(0);
    }
  });

  it("winds every face counter-clockwise seen from outside", () => {
    const { positions, normals, indices } = boxBuffers([unit]);
    for (let t = 0; t < indices.length; t += 3) {
      const [a, b, c] = [indices[t], indices[t + 1], indices[t + 2]].map((i) => positions.slice(i * 3, i * 3 + 3));
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const cross = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
      const n = normals.slice(indices[t] * 3, indices[t] * 3 + 3);
      expect(cross[0] * n[0] + cross[1] * n[1] + cross[2] * n[2]).toBeGreaterThan(0);
    }
  });

  it("turns boxes by yaw", () => {
    const { positions } = boxBuffers([{ x: 0, y: 0, z: 0, w: 4, h: 1, d: 1, yaw: Math.PI / 2 }]);
    let maxX = 0;
    let maxZ = 0;
    for (let i = 0; i < positions.length; i += 3) {
      maxX = Math.max(maxX, Math.abs(positions[i]));
      maxZ = Math.max(maxZ, Math.abs(positions[i + 2]));
    }
    expect(maxX).toBeCloseTo(0.5);
    expect(maxZ).toBeCloseTo(2);
  });

  it("draws the 12 edges of every box", () => {
    expect(boxEdgeBuffers([unit, unit]).length).toBe(2 * 12 * 6);
  });

  it("tapers the lattice mast to its top", () => {
    const seg = latticeSegments(14, 1.6, 0.4, 7);
    expect(seg.length).toBe(7 * 72);
    let maxY = 0;
    for (let i = 1; i < seg.length; i += 3) maxY = Math.max(maxY, seg[i]);
    expect(maxY).toBeCloseTo(14);
    for (let i = 0; i < seg.length; i += 3) if (Math.abs(seg[i + 1] - 14) < 1e-6) expect(Math.abs(seg[i])).toBeCloseTo(0.4);
  });

  it("puts the skyline far outside the slab, below the roof's eye line, the same every time", () => {
    const boxes = skylineBoxes(32);
    expect(boxes).toHaveLength(34);
    for (const b of boxes) {
      expect(Math.hypot(b.x, b.z)).toBeGreaterThan(70);
      expect(b.y).toBeGreaterThanOrEqual(SKYLINE_GROUND);
      expect(b.y + b.h).toBeLessThan(12);
    }
    expect(skylineBoxes(32)).toEqual(boxes);
    expect(skylineWindows(boxes, 3)).toHaveLength(34 * 3 * 3);
  });

  it("scatters seeded points that respect the reject rule", () => {
    const area = { minX: 0, maxX: 10, minZ: 0, maxZ: 10 };
    const pts = scatter(40, area, (p) => p.x < 5);
    expect(pts.length).toBe(40);
    for (const p of pts) expect(p.x).toBeGreaterThanOrEqual(5);
    expect(scatter(40, area, (p) => p.x < 5)).toEqual(pts);
    expect(scatter(5, area, () => true)).toEqual([]);
  });

  it("places ring points and seeds a stable random sequence", () => {
    const ring = ringPoints({ x: 2, z: 0 }, 8, 4);
    expect(ring[0].x).toBeCloseTo(10);
    expect(ring[1].z).toBeCloseTo(8);
    const a = mulberry32(7);
    const b = mulberry32(7);
    expect([a(), a()]).toEqual([b(), b()]);
  });

  it("keeps the lite tier lighter than the full tier", () => {
    const full = roofDetail("full");
    const lite = roofDetail("lite");
    for (const key of Object.keys(full) as (keyof typeof full)[]) expect(lite[key]).toBeLessThanOrEqual(full[key]);
    expect(lite.flowers).toBeLessThan(full.flowers);
  });
});
