import type { Rect, Vec2 } from "../types";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Distance from a point to a rectangle (0 inside). */
export function distanceToRect(p: Vec2, r: Rect): number {
  const dx = Math.max(r.minX - p.x, 0, p.x - r.maxX);
  const dz = Math.max(r.minZ - p.z, 0, p.z - r.maxZ);
  return Math.hypot(dx, dz);
}

/**
 * Resolves a circle against inflated AABBs and the floor bounds by pushing it
 * out along the contact normal, which makes the rover slide along walls.
 */
export function resolveCircle(p: Vec2, radius: number, obstacles: readonly Rect[], bounds: Rect): Vec2 {
  let { x, z } = p;
  for (let pass = 0; pass < 3; pass++) {
    x = clamp(x, bounds.minX + radius, bounds.maxX - radius);
    z = clamp(z, bounds.minZ + radius, bounds.maxZ - radius);
    let moved = false;
    for (const o of obstacles) {
      const cx = clamp(x, o.minX, o.maxX);
      const cz = clamp(z, o.minZ, o.maxZ);
      const dx = x - cx;
      const dz = z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= radius * radius - 1e-9) continue;
      if (d2 > 1e-12) {
        const d = Math.sqrt(d2);
        x = cx + (dx / d) * radius;
        z = cz + (dz / d) * radius;
      } else {
        const pushes = [
          { d: x - o.minX, apply: () => (x = o.minX - radius) },
          { d: o.maxX - x, apply: () => (x = o.maxX + radius) },
          { d: z - o.minZ, apply: () => (z = o.minZ - radius) },
          { d: o.maxZ - z, apply: () => (z = o.maxZ + radius) },
        ];
        pushes.reduce((a, b) => (b.d < a.d ? b : a)).apply();
      }
      moved = true;
    }
    if (!moved) break;
  }
  return {
    x: clamp(x, bounds.minX + radius, bounds.maxX - radius),
    z: clamp(z, bounds.minZ + radius, bounds.maxZ - radius),
  };
}

export function collides(p: Vec2, radius: number, obstacles: readonly Rect[]): boolean {
  return obstacles.some((o) => distanceToRect(p, o) < radius - 1e-6);
}
