import type { Vec2 } from "../types";
import { inPlaza, ROAD, roadLength, sampleRoad, type Plaza, type RoadNetwork, type Spur } from "./road";

/**
 * Mesh data for `RoadMarkings.tsx`, as plain arrays so Vitest can check it in node. Coordinates
 * are floor-local x/z; the renderer lifts them a few millimetres above the slab.
 */

export interface Ribbon {
  /** x, z per vertex. */
  positions: number[];
  /** u (arc length) and v (0 left edge, 1 right edge) per vertex. */
  uvs: number[];
  indices: number[];
}

const MITER_LIMIT = 2;

/** Unit left normal (dir rotated +90 degrees around y in x/z). */
const left = (d: Vec2): Vec2 => ({ x: -d.z, z: d.x });

function unit(a: Vec2, b: Vec2): Vec2 {
  const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
  return { x: (b.x - a.x) / len, z: (b.z - a.z) / len };
}

/** Mitered offset normals for each vertex of a polyline (scale included, capped at MITER_LIMIT). */
export function miterNormals(points: readonly Vec2[], closed = false): Vec2[] {
  const n = points.length;
  return points.map((p, i) => {
    const prev = i > 0 ? points[i - 1] : closed ? points[n - 1] : null;
    const next = i < n - 1 ? points[i + 1] : closed ? points[0] : null;
    const d0 = prev ? unit(prev, p) : null;
    const d1 = next ? unit(p, next) : null;
    if (!d0 && !d1) return { x: 0, z: 1 };
    if (!d0) return left(d1!);
    if (!d1) return left(d0);
    const n0 = left(d0);
    const n1 = left(d1);
    const m = { x: n0.x + n1.x, z: n0.z + n1.z };
    const len = Math.hypot(m.x, m.z);
    if (len < 1e-6) return n0;
    const mu = { x: m.x / len, z: m.z / len };
    const cos = mu.x * n0.x + mu.z * n0.z;
    const scale = Math.min(MITER_LIMIT, 1 / Math.max(1e-3, cos));
    return { x: mu.x * scale, z: mu.z * scale };
  });
}

/** Offsets a polyline sideways by `offset` (positive is left of the forward direction). */
export function offsetLine(points: readonly Vec2[], offset: number, closed = false): Vec2[] {
  return miterNormals(points, closed).map((nrm, i) => ({ x: points[i].x + nrm.x * offset, z: points[i].z + nrm.z * offset }));
}

/** Triangle strip of `width` along a polyline. */
export function ribbon(points: readonly Vec2[], width: number, closed = false, out: Ribbon = { positions: [], uvs: [], indices: [] }): Ribbon {
  const pts = closed ? [...points, points[0]] : [...points];
  const normals = miterNormals(points, closed);
  if (closed) normals.push(normals[0]);
  const base = out.positions.length / 2;
  let s = 0;
  pts.forEach((p, i) => {
    if (i > 0) s += Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z);
    const n = normals[i];
    out.positions.push(p.x + (n.x * width) / 2, p.z + (n.z * width) / 2, p.x - (n.x * width) / 2, p.z - (n.z * width) / 2);
    out.uvs.push(s, 0, s, 1);
    if (i > 0) {
      const a = base + (i - 1) * 2;
      out.indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  });
  return out;
}

/** Plaza fill: a fan for round plazas, two triangles for rectangular ones. */
export function plazaFill(plaza: Plaza, out: Ribbon = { positions: [], uvs: [], indices: [] }, steps = 48): Ribbon {
  const base = out.positions.length / 2;
  const { x: cx, z: cz } = plaza.center;
  if (!plaza.round) {
    const hw = plaza.w / 2;
    const hd = plaza.d / 2;
    out.positions.push(cx - hw, cz - hd, cx + hw, cz - hd, cx + hw, cz + hd, cx - hw, cz + hd);
    out.uvs.push(0, 0.5, 0, 0.5, 0, 0.5, 0, 0.5);
    out.indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
    return out;
  }
  out.positions.push(cx, cz);
  out.uvs.push(0, 0.5);
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    out.positions.push(cx + (Math.cos(a) * plaza.w) / 2, cz + (Math.sin(a) * plaza.d) / 2);
    out.uvs.push(0, 0.5);
    out.indices.push(base, base + 1 + ((i + 1) % steps), base + 1 + i);
  }
  return out;
}

/** Outline of a plaza as a closed polyline. */
export function plazaOutline(plaza: Plaza, steps = 48): Vec2[] {
  const { x: cx, z: cz } = plaza.center;
  if (!plaza.round) {
    const hw = plaza.w / 2;
    const hd = plaza.d / 2;
    return [
      { x: cx - hw, z: cz - hd },
      { x: cx + hw, z: cz - hd },
      { x: cx + hw, z: cz + hd },
      { x: cx - hw, z: cz + hd },
    ];
  }
  return Array.from({ length: steps }, (_, i) => {
    const a = (i / steps) * Math.PI * 2;
    return { x: cx + (Math.cos(a) * plaza.w) / 2, z: cz + (Math.sin(a) * plaza.d) / 2 };
  });
}

/** Road, plaza and spur fills of a whole network in one ribbon (one draw call). */
export function networkFill(net: RoadNetwork): Ribbon {
  const out: Ribbon = { positions: [], uvs: [], indices: [] };
  for (const road of net.roads) ribbon(road.points, road.width, road.closed, out);
  for (const plaza of net.plazas) plazaFill(plaza, out);
  for (const spur of net.spurs) ribbon([spur.from, spur.to], spur.width ?? ROAD.spurWidth, false, out);
  return out;
}

export interface Chevron {
  x: number;
  z: number;
  /** Heading of the arrow (forward is (sin, cos)), like the rover. */
  angle: number;
  /** Arc length along its road (phase of the pulse). */
  s: number;
}

/**
 * Forward chevrons every `spacing` u along each road's centerline. Chevrons inside plazas are
 * skipped (plazas are open floor), and so is the first half spacing so arrows never sit on a junction.
 */
export function chevronMarks(net: RoadNetwork, spacing = 4): Chevron[] {
  const out: Chevron[] = [];
  for (const road of net.roads) {
    const total = roadLength(road);
    for (let s = spacing / 2; s < total - (road.closed ? 0 : spacing / 4); s += spacing) {
      const { point, dir } = sampleRoad(road, s);
      if (net.plazas.some((pl) => inPlaza(pl, point, -0.5))) continue;
      out.push({ x: point.x, z: point.z, angle: Math.atan2(dir.x, dir.z), s });
    }
  }
  return out;
}

/** Dashes [x1, z1, x2, z2] along a polyline: `dash` on, `gap` off. */
export function dashes(points: readonly Vec2[], dash: number, gap: number, closed = false): [number, number, number, number][] {
  const pts = closed ? [...points, points[0]] : [...points];
  const out: [number, number, number, number][] = [];
  let on = true;
  let remaining = dash;
  for (let i = 0; i < pts.length - 1; i++) {
    let a = pts[i];
    const b = pts[i + 1];
    let len = Math.hypot(b.x - a.x, b.z - a.z);
    const d = unit(a, b);
    while (len > 1e-6) {
      const step = Math.min(remaining, len);
      const next = { x: a.x + d.x * step, z: a.z + d.z * step };
      if (on) out.push([a.x, a.z, next.x, next.z]);
      a = next;
      len -= step;
      remaining -= step;
      if (remaining <= 1e-6) {
        on = !on;
        remaining = on ? dash : gap;
      }
    }
  }
  return out;
}

/** Dashed edge lines on both sides of every road (plazas get a dashed outline instead). */
export function roadEdges(net: RoadNetwork, dash = 1.2, gap = 0.8): [number, number, number, number][] {
  const out: [number, number, number, number][] = [];
  for (const road of net.roads) {
    for (const side of [1, -1]) {
      const edge = offsetLine(road.points, (side * road.width) / 2, road.closed);
      for (const seg of dashes(edge, dash, gap, road.closed)) {
        const mid = { x: (seg[0] + seg[2]) / 2, z: (seg[1] + seg[3]) / 2 };
        // Edges stop where a plaza opens the road up.
        if (!net.plazas.some((pl) => inPlaza(pl, mid, -0.2))) out.push(seg);
      }
    }
  }
  for (const plaza of net.plazas) out.push(...dashes(plazaOutline(plaza), dash, gap, true));
  return out;
}

/** Colored stub at the door end of a spur: the last `length` u, a bit wider than the spur. */
export function spurStub(spur: Spur, length = 2): { from: Vec2; to: Vec2; width: number } {
  const d = unit(spur.from, spur.to);
  const total = Math.hypot(spur.to.x - spur.from.x, spur.to.z - spur.from.z);
  const k = Math.min(length, total);
  return { from: { x: spur.to.x - d.x * k, z: spur.to.z - d.z * k }, to: spur.to, width: (spur.width ?? ROAD.spurWidth) + 0.4 };
}
