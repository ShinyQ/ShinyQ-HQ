import type { Rect, Vec2 } from "../../types";

/**
 * L3 "Reactor core" (spectacle round, owner pick 2026-10-13): a tall spinning core with orbiting rings
 * in the middle of the east plaza, fed by the packet-lane spine, plus data waterfalls pouring off the
 * four slab corners. The wing roads no longer meet at the plaza center: they end on a closed ring road
 * around the core, so the floor stays one loop and every route (point-and-go, missions, walks) drives
 * around it. Pure (no React or three): Vitest runs it in node.
 */
export const REACTOR = {
  /** Half side of the core's square footprint (the obstacle). */
  half: 1.6,
  /** Centerline radius of the ring road around the core (8 u wide: inner edge about 2.4 u). */
  ring: 6.5,
  /** Ring road vertices; vertex 0 is due north (-z), vertex `segments / 2` due south. */
  segments: 16,
  /** Height of the core column (below the L4 slab 14 u up). */
  height: 11,
  /** Radius of the glowing column. */
  radius: 1.25,
  /** Orbit rings: height, radius, tilt (rad); all above the rover and the follow camera's usual height. */
  rings: [
    { y: 4.2, r: 2.9, tilt: 0.3 },
    { y: 6.4, r: 3.6, tilt: -0.22 },
    { y: 8.8, r: 2.4, tilt: 0.45 },
  ],
  /** Rings shown on the lite tier. */
  liteRings: 2,
  /** Ring spin (rad/s); 0 under reduced motion (owner rule: never above 0.2 rad/s when motion is reduced). */
  spin: 0.6,
} as const;

/** Spin speed of the reactor rings: still under reduced motion. */
export function reactorSpin(reducedMotion: boolean): number {
  return reducedMotion ? 0 : REACTOR.spin;
}

/** The core's footprint (an obstacle for the navgrid and the camera). */
export function reactorRect(center: Vec2): Rect {
  return { minX: center.x - REACTOR.half, maxX: center.x + REACTOR.half, minZ: center.z - REACTOR.half, maxZ: center.z + REACTOR.half };
}

/** Closed ring road around the core: `segments` points, vertex 0 due north (-z), clockwise seen from above. */
export function ringPoints(center: Vec2): Vec2[] {
  return Array.from({ length: REACTOR.segments }, (_, k) => {
    const a = (k / REACTOR.segments) * Math.PI * 2;
    return { x: round(center.x + Math.sin(a) * REACTOR.ring), z: round(center.z - Math.cos(a) * REACTOR.ring) };
  });
}

/** Where a road coming from `from` meets the ring: on the ring circle toward `from` (due north or south for a road along x = center.x). */
export function ringEntry(center: Vec2, from: Vec2): Vec2 {
  const dx = from.x - center.x;
  const dz = from.z - center.z;
  const len = Math.hypot(dx, dz) || 1;
  return { x: round(center.x + (dx / len) * REACTOR.ring), z: round(center.z + (dz / len) * REACTOR.ring) };
}

const round = (v: number) => Math.round(v * 1e6) / 1e6;

/** A waterfall panel hanging under a slab edge: its top edge runs from `a` to `b` on the slab rim; it falls `drop` u. */
export interface WaterfallPanel {
  a: Vec2;
  b: Vec2;
  /** Unit direction out of the slab (the panel sits just outside the rim). */
  out: Vec2;
}

/** Waterfalls (spectacle round): length of each panel along the rim, how far it falls, and the gap outside the slab. */
export const WATERFALL = { length: 9, drop: 12, gap: 0.15, liteLength: 9 } as const;

/**
 * Two panels at each slab corner, one along each edge, starting at the corner (8 in all, one instanced
 * draw). Lite keeps one panel per corner (along x).
 */
export function waterfallPanels(bounds: Rect, lite = false): WaterfallPanel[] {
  const out: WaterfallPanel[] = [];
  const L = WATERFALL.length;
  for (const sx of [-1, 1] as const) {
    for (const sz of [-1, 1] as const) {
      const cx = sx < 0 ? bounds.minX : bounds.maxX;
      const cz = sz < 0 ? bounds.minZ : bounds.maxZ;
      const g = WATERFALL.gap;
      // Along x (on the north or south edge), running inward from the corner.
      out.push({ a: { x: cx, z: cz + sz * g }, b: { x: cx - sx * L, z: cz + sz * g }, out: { x: 0, z: sz } });
      if (!lite) out.push({ a: { x: cx + sx * g, z: cz }, b: { x: cx + sx * g, z: cz - sz * L }, out: { x: sx, z: 0 } });
    }
  }
  return out;
}
