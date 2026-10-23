import type { GpuTier } from "../../types";
import type { Box } from "../roof/solids";
import { ENGINE } from "./layout";
import { REACTOR, type ReactorLane } from "./reactor";

/**
 * Pure look of B1's reactor core (no React or three): the solids that join the floor's merged mesh, the four rings of
 * lane segments in the Agent Office tower's CI colors (running violet with a chase, done green, failed red, queued dim),
 * the sparks orbiting inside them, the open energy column (coolant shell, inner beam and crown ring) with the risers,
 * the glow pool on the plinth, the pulse and the deploy flash. Segments and tubes share the holo `core` mode. Instance positions are relative to the core's center
 * (the scene group stands there); `coreSolids` are floor-local.
 */
export const CORE_FX = {
  /** Top of the two-step plinth. */
  plinth: 0.8,
  /** The coolant shell around the energy column (holo `core`), up to the pipe ceiling. */
  shell: { r: 1, top: 7.4 },
  /** The bright inner beam (holo `core`), rising past the ceiling pipes so its bands read through the crown. */
  beam: { r: 0.42, top: 9.6 },
  /** The open crown ring at the column's top (a thin holo `core` tube, no cap), topping out at the core height. */
  crown: { r: 1.45, y0: 6.44 },
  /** The soft additive glow pool on the plinth under the column (holo `dot`, one instance): height and quad size. */
  pool: { y: 0.82, size: 5.6 },
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
  /** Instance matrix (and chase color) writes per second at most. */
  writeHz: 30,
} as const;

/** The Agent Office CI tower's lane colors (`crewFx.ts` `writeTower`): running violet, done green, failed red, queued slate. */
export const LANE_TONES: Record<ReactorLane, string> = { running: "#a78bfa", failed: "#f87171", done: "#34d399", queued: "#64748b" };
/** Every segment without lanes (offline, stale, reduced motion or a run without jobs). */
export const IDLE_TONE = "#b45309";
export const SPARK_TONE = "#e0f2fe";
export const COOLANT_TONE = "#22d3ee";

/**
 * Segment brightness (instance color gain) per lane state: kept near 1 so the additive holo `core` mode (up to about
 * 2.3 times the color in its bands) keeps the hue instead of washing out to white; queued stays dim, idle a calm amber.
 */
export const LANE_GAIN: Record<Exclude<ReactorLane, "running"> | "idle", number> = { done: 1, failed: 1.2, queued: 0.35, idle: 0.75 };
/** Running segments: `base` between waves, `peak` at the chase head, which runs `speed` turns a second around the ring and fades over `width` of a turn behind it. */
export const RUN_CHASE = { base: 0.7, peak: 2, speed: 0.6, width: 0.35 } as const;

/** Segments per ring; lite draws half and no sparks (24 segments still give each lane of a full run its own). */
export function coreDetail(tier: GpuTier): { perRing: number; segments: number; sparks: number } {
  const perRing = tier === "full" ? 12 : 6;
  return { perRing, segments: perRing * CORE_FX.rings.length, sparks: tier === "full" ? REACTOR.sparks : 0 };
}

/** The lane of each segment (null without lanes): each lane takes a contiguous run, in the lanes' order. */
export function segmentLanes(lanes: readonly ReactorLane[], count: number): (ReactorLane | null)[] {
  const n = lanes.length;
  return Array.from({ length: count }, (_, k) => (n === 0 ? null : lanes[Math.floor((k * n) / count)]));
}

/** The chase wave at slot `k` of a ring of `perRing` after `t` seconds of motion: 1 at the head, 0 past `RUN_CHASE.width` behind it. */
export function chaseLevel(k: number, perRing: number, t: number): number {
  const behind = (((t * RUN_CHASE.speed - k / perRing) % 1) + 1) % 1;
  return Math.max(0, 1 - behind / RUN_CHASE.width);
}

/** Brightness of a segment in slot `k` for its lane (null: idle) at motion time `t`: running segments ride the chase. */
export function segmentGain(lane: ReactorLane | null, k: number, perRing: number, t: number): number {
  if (lane !== "running") return LANE_GAIN[lane ?? "idle"];
  return RUN_CHASE.base + (RUN_CHASE.peak - RUN_CHASE.base) * chaseLevel(k, perRing, t);
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

/** The four coolant risers at the plinth's corners (holo `core` tubes), relative to the core's center; their clamps carry the top rails. */
export function coolantRisers(): { x: number; z: number; r: number; y0: number; y1: number }[] {
  return [-1, 1].flatMap((sx) => [-1, 1].map((sz) => ({ x: sx * 3.4, z: sz * 3.4, r: 0.2, y0: 0.7, y1: 6.2 })));
}

export interface CoolantPart {
  x: number;
  z: number;
  r: number;
  y0: number;
  y1: number;
  /** Instance color gain. */
  gain: number;
}

/**
 * The `core` tubes, relative to the core's center: the coolant shell, the bright inner beam (the energy column, open to
 * the top), the crown ring and the four dimmer risers. The bands rise along each tube.
 */
export function coolantParts(): CoolantPart[] {
  const { plinth, shell, beam, crown } = CORE_FX;
  return [
    { x: 0, z: 0, r: shell.r, y0: plinth, y1: shell.top, gain: 1 },
    { x: 0, z: 0, r: beam.r, y0: plinth, y1: beam.top, gain: 1.5 },
    { x: 0, z: 0, r: crown.r, y0: crown.y0, y1: ENGINE.reactor.h, gain: 1.5 },
    ...coolantRisers().map((p) => ({ ...p, gain: 0.4 })),
  ];
}

/**
 * The core's solids for the floor's merged mesh: a two-step plinth, the risers' feet and clamps, and two thin rails
 * along x over the clamps (north and south) topping out at the core height. No column, collar or cap: the energy
 * column stands open to the top.
 */
export function coreSolids(): Box[] {
  const { x, z, h } = ENGINE.reactor;
  const at = (w: number, y: number, top: number, dx = 0, dz = 0, d = w): Box => ({ x: x + dx, y, z: z + dz, w, h: top - y, d });
  const risers = coolantRisers();
  const clampTop = risers[0].y1 + 0.25;
  return [
    at(8, 0, 0.4),
    at(5.6, 0.4, CORE_FX.plinth),
    ...risers.flatMap((p) => [at(0.7, 0.4, p.y0, p.x, p.z), at(0.6, p.y1, clampTop, p.x, p.z)]),
    ...[-1, 1].map((sz) => at(7.4, clampTop, h, 0, sz * 3.4, 0.14)),
  ];
}
