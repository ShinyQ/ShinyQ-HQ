import type { CareerRoadLayout } from "./layout";
import type { Rect, Vec2 } from "../../types";

/**
 * L2 floor ends (spectacle round, owner pick 2026-10-13). East, the "Horizon": a light bridge runs off
 * the slab beyond the annex window toward a holographic skyline far below and beyond the tower, with a
 * sunrise glow over it, and glow strips in the empty north-east and south-east corners lead the eye to
 * the bridge. West, the "Origin": a light pillar rising beside the start of the road. Pure decor (no
 * obstacles, no new content). Pure module (no React or three): Vitest runs it in node. All numbers are
 * floor-relative (the L2 floor at y 0).
 */
export const HORIZON = {
  bridge: { length: 80, width: 4, dashes: 30 },
  /** Skyline towers on an arc around the window end: angle from +x (rad, -z is north), radius from the window. */
  skyline: { count: 36, liteCount: 20, from: -1.45, to: 1.0, near: 200, far: 400, base: -80, top: [-55, -8] as const, tallest: 10, width: [12, 30] as const },
  /** Sunrise glow: a plane facing the tower, its horizon band at `y`. */
  glow: { distance: 430, y: -130, w: 560, h: 260 },
  /** Corner strips: width, and their z rows in the north-east and south-east corners. */
  strips: { width: 0.45, ne: [-26.5, -22.5, -18.5], se: [18.5, 22.5, 26.5], liteRows: 2, inset: 1 },
  /** Origin light pillar west of the first plaza. */
  pillar: { radius: 1.6, height: 12, at: { x: -15, z: -19 } as Vec2 },
} as const;

export interface SkylineTower {
  x: number;
  z: number;
  w: number;
  d: number;
  /** Top height (floor-relative); every tower starts at `HORIZON.skyline.base`. */
  top: number;
}

export interface Strip {
  from: Vec2;
  to: Vec2;
  width: number;
}

export interface HorizonLayout {
  /** The light bridge, from the window (minX) running east off the slab. */
  bridge: Rect;
  towers: SkylineTower[];
  glow: { x: number; y: number; z: number; w: number; h: number };
  /** North-east and south-east corner strips, running east to the slab edge. */
  strips: Strip[];
  pillar: { at: Vec2; radius: number; height: number };
}

/** Deterministic 0..1 noise (the skyline is the same on every load and in tests). */
function rand(i: number, k: number): number {
  const s = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Lays out the Horizon and the Origin from the Career Road layout (the window and the annex move with the content). */
export function buildHorizon(layout: Pick<CareerRoadLayout, "windowX" | "forecourt" | "bounds">, lite = false): HorizonLayout {
  const H = HORIZON;
  const wx = layout.windowX;
  const half = H.bridge.width / 2;
  const sky = H.skyline;
  const count = lite ? sky.liteCount : sky.count;
  const towers: SkylineTower[] = Array.from({ length: count }, (_, i) => {
    // Spread evenly over the arc with a little jitter, alternating near and far rows.
    const t = (i + 0.5 + (rand(i, 1) - 0.5) * 0.8) / count;
    const a = sky.from + (sky.to - sky.from) * t;
    const r = sky.near + (sky.far - sky.near) * (i % 2 ? 0.25 + 0.75 * rand(i, 2) : rand(i, 3) * 0.6);
    const w = sky.width[0] + (sky.width[1] - sky.width[0]) * rand(i, 4);
    const tallest = i % 5 === 2;
    const top = tallest ? sky.tallest : sky.top[0] + (sky.top[1] - sky.top[0]) * rand(i, 5);
    return { x: wx + Math.cos(a) * r, z: Math.sin(a) * r, w, d: w * (0.7 + 0.3 * rand(i, 6)), top };
  });
  const strip = (rows: readonly number[], fromX: number): Strip[] =>
    rows.slice(0, lite ? H.strips.liteRows : rows.length).map((z) => ({ from: { x: fromX, z }, to: { x: wx - H.strips.inset, z }, width: H.strips.width }));
  const forecourtMinX = layout.forecourt.center.x - layout.forecourt.w / 2;
  return {
    bridge: { minX: wx, maxX: wx + H.bridge.length, minZ: -half, maxZ: half },
    towers,
    glow: { x: wx + H.glow.distance, y: H.glow.y, z: 0, w: H.glow.w, h: H.glow.h },
    // From the forecourt on, beyond the time console and the repo skyline (north-east) and the workbenches (south-east).
    strips: [...strip(H.strips.ne, forecourtMinX), ...strip(H.strips.se, forecourtMinX)],
    pillar: { at: H.pillar.at, radius: H.pillar.radius, height: H.pillar.height },
  };
}

/** A strip's footprint on the floor. */
export function stripRect(s: Strip): Rect {
  return { minX: Math.min(s.from.x, s.to.x), maxX: Math.max(s.from.x, s.to.x), minZ: s.from.z - s.width / 2, maxZ: s.from.z + s.width / 2 };
}
