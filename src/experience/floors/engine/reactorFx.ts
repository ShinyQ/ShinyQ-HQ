import type { GpuTier } from "../../types";
import type { Box } from "../roof/solids";
import { ENGINE } from "./layout";
import { REACTOR, type ReactorLane } from "./reactor";

/**
 * Pure look of B1's reactor core (no React or three): the solids that join the floor's merged mesh, the four rings of
 * lane segments, the sparks orbiting inside them, the coolant shell and risers, the pulse and the deploy flash.
 * Instance positions are relative to the core's center (the scene group stands there); `coreSolids` are floor-local.
 */
export const CORE_FX = {
  /** Top of the two-step plinth. */
  plinth: 0.8,
  /** Bottom of the collar under the cap (the coolant shell's top). */
  capY: 5.9,
  /** The coolant shell around the column (holo `core`). */
  shell: { r: 1 },
  /** Lane rings, bottom up (y is the segment's center). */
  rings: [
    { y: 2.1, r: 2.2 },
    { y: 3.15, r: 2.8 },
    { y: 4.2, r: 2.8 },
    { y: 5.25, r: 2.2 },
  ],
  /** Segment band height and the share of each slot it fills. */
  segH: 0.44,
  fill: 0.8,
  /** Ring speed (rad/s), alternating per ring: under 0.34 u/s at the rim, calm at B1's 30 fps idle cadence. */
  speed: 0.12,
  /** Spark size (instance scale of the segment arc). */
  spark: 0.14,
  /** Instance matrix writes per second at most. */
  writeHz: 30,
} as const;

export const LANE_TONES: Record<ReactorLane, string> = { running: "#22d3ee", failed: "#f87171", done: "#34d399", queued: "#71717a" };
/** Every segment without lanes (offline, stale, reduced motion or a run without jobs). */
export const IDLE_TONE = "#b45309";
export const SPARK_TONE = "#e0f2fe";
export const COOLANT_TONE = "#22d3ee";

/** Segments per ring; lite draws half and no sparks (24 segments still give each lane of a full run its own). */
export function coreDetail(tier: GpuTier): { perRing: number; segments: number; sparks: number } {
  const perRing = tier === "full" ? 12 : 6;
  return { perRing, segments: perRing * CORE_FX.rings.length, sparks: tier === "full" ? REACTOR.sparks : 0 };
}

/** One color per segment: each lane takes a contiguous run (newest run's job order), all idle amber without lanes. */
export function segmentColors(lanes: readonly ReactorLane[], count: number): string[] {
  const n = lanes.length;
  return Array.from({ length: count }, (_, k) => (n === 0 ? IDLE_TONE : LANE_TONES[lanes[Math.floor((k * n) / count)]]));
}

/** Ring `i`'s turn after `t` seconds of motion: alternating directions, none under reduced motion. */
export function ringAngle(i: number, t: number, reducedMotion: boolean): number {
  return reducedMotion ? 0 : (i % 2 ? -1 : 1) * CORE_FX.speed * t;
}

/** Segment `k` of ring `i` (its slot plus the ring's turn): height, radius and yaw about the column. */
export function segmentPose(i: number, k: number, perRing: number, angle: number): { y: number; r: number; yaw: number } {
  const ring = CORE_FX.rings[i];
  return { y: ring.y, r: ring.r, yaw: (k / perRing) * Math.PI * 2 + angle };
}

/** Spark `j` at `t` seconds: an orbit between the coolant shell and the inner rings with a slow bob. */
export function sparkPos(j: number, t: number): { x: number; y: number; z: number } {
  const a = j * 2.39996 + (j % 2 ? -1 : 1) * (0.2 + 0.03 * (j % 3)) * t;
  const r = 1.4 + 0.1 * (j % 4);
  const y = 1.3 + ((j * 1.37) % 3.9) + 0.2 * Math.sin(t * 0.6 + j);
  return { x: Math.sin(a) * r, y, z: Math.cos(a) * r };
}

/** Coolant brightness at pulse phase `phase` (radians), 0.62 to 1; a steady 0.8 under reduced motion. */
export function pulseLevel(phase: number, reducedMotion: boolean): number {
  return reducedMotion ? 0.8 : 0.62 + 0.38 * (0.5 + 0.5 * Math.sin(phase));
}

export interface FlashMark {
  /** The newest deploy seen. */
  seen: number | null;
  /** When the flash starts (`flashLevel(at, now)`). */
  at: number | null;
}

/**
 * The deploy flash: a deploy seen first (on arrival) flashes only while it is fresh (`at` is the deploy itself), a newer
 * deploy that a later poll brings flashes from the moment it shows. No deploy (idle) keeps the mark.
 */
export function nextFlash(prev: FlashMark, deployAt: number | null, now: number): FlashMark {
  if (deployAt === null || (prev.seen !== null && deployAt <= prev.seen)) return prev;
  return { seen: deployAt, at: prev.seen === null ? deployAt : now };
}

/** The four coolant risers at the plinth's corners (holo `core` tubes), relative to the core's center. */
export function coolantRisers(): { x: number; z: number; r: number; y0: number; y1: number }[] {
  return [-1, 1].flatMap((sx) => [-1, 1].map((sz) => ({ x: sx * 3.4, z: sz * 3.4, r: 0.2, y0: 0.7, y1: 5.6 })));
}

/** The core's solids for the floor's merged mesh: a two-step plinth, the column, a collar and the cap, the risers' feet and clamps. */
export function coreSolids(): Box[] {
  const { x, z, h } = ENGINE.reactor;
  const at = (w: number, y: number, top: number, dx = 0, dz = 0): Box => ({ x: x + dx, y, z: z + dz, w, h: top - y, d: w });
  return [
    at(8, 0, 0.4),
    at(5.6, 0.4, CORE_FX.plinth),
    at(1.2, CORE_FX.plinth, CORE_FX.capY),
    at(2.4, CORE_FX.capY, 6.15),
    at(3.2, 6.15, h),
    ...coolantRisers().flatMap((p) => [at(0.7, 0.4, p.y0, p.x, p.z), at(0.6, p.y1, p.y1 + 0.25, p.x, p.z)]),
  ];
}
