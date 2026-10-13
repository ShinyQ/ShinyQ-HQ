import type { Accent } from "@/content/schema";
import type { RoomReactor } from "@/content/room-views/types";
import type { ReactorTech } from "@/store/useHQStore";
import type { ReactorRingId } from "@/content/tech-rings";
import type { Vec2 } from "../../types";
import type { LabsLayout, PlacedPod } from "./layout";
import { REACTOR } from "./reactor";

/**
 * L3 Tech Reactor (design 2026-10-14, section 2): the Reactor core turned into a project filter. Six
 * tech rings (the CV skill groups) orbit the column, DevOps at the bottom up to AI at the top; a ring
 * click opens the "Tech Reactor" drawer on that ring, a tech pick lights the pods that use it and the
 * roads to them. Pure (no React or three): Vitest runs it in node.
 */
export { REACTOR_ROOM, TECH_HASH, techFromHash, techHash } from "./techHash";

export interface TechRing {
  id: ReactorRingId;
  /** Height of the ring (and its label) above the floor. */
  y: number;
  /** Ring radius. */
  r: number;
  /** Tilt (rad); alternating so stacked rings read apart. */
  tilt: number;
  color: string;
  /** Drawer accent (the static class maps in `src/lib/accent.ts`). */
  accent: Accent;
}

/** Bottom to top: infrastructure under the stack, AI on top. */
export const TECH_RINGS: readonly TechRing[] = [
  { id: "devops", y: 2.6, r: 2.9, tilt: 0.12, color: "#34d399", accent: "green" },
  { id: "data", y: 4.2, r: 2.5, tilt: -0.12, color: "#fbbf24", accent: "amber" },
  { id: "backend", y: 5.8, r: 2.9, tilt: 0.12, color: "#22d3ee", accent: "cyan" },
  { id: "frontend", y: 7.4, r: 2.5, tilt: -0.12, color: "#f472b6", accent: "pink" },
  { id: "azure", y: 9, r: 2.9, tilt: 0.12, color: "#60a5fa", accent: "blue" },
  { id: "ai", y: 10.6, r: 2.5, tilt: -0.12, color: "#a78bfa", accent: "violet" },
];

export const ringById = (id: ReactorRingId): TechRing => TECH_RINGS.find((r) => r.id === id)!;

/** Surprise me: the rings spin this many times faster for `ms` (still under reduced motion). */
export const SURPRISE_SPIN = { boost: 6, ms: 1200 } as const;
/** Height of the "N projects use X" sign (plate middle), above the top ring and under the L4 slab. */
export const COUNT_SIGN_Y = 12.6;
/**
 * Pod highlights: a low glow curtain around each lit pod (`glow` tall, `inset` outside its walls, full
 * tier only) and a thin beacon rising from it (`radius`, `full` or `lite` tall), both in one instanced draw.
 */
export const BEACON = { full: 11, lite: 7, radius: 0.55, glow: 3.2, inset: 0.6 } as const;

/** Where the rover parks for the reactor: the ring road's east point, looking west over the core to both wings. */
export function reactorStop(center: Vec2): Vec2 {
  return { x: center.x + REACTOR.ring, z: center.z };
}

/** Pick volume y range per ring (`Interactable.base` to `height`): contiguous bands, the bottom one from the floor. */
export function ringBands(): { id: ReactorRingId; base: number; top: number }[] {
  return TECH_RINGS.map((ring, i) => {
    const below = TECH_RINGS[i - 1];
    const above = TECH_RINGS[i + 1];
    const base = below ? round((below.y + ring.y) / 2) : 0;
    const top = above ? round((ring.y + above.y) / 2) : round(ring.y + (ring.y - TECH_RINGS[i - 1].y) / 2);
    return { id: ring.id, base, top };
  });
}

/** The docked pods among `slugs` (listed pods live on the directory and have nothing to light). */
export function litPods(placed: readonly PlacedPod[], slugs: readonly string[]): PlacedPod[] {
  const set = new Set(slugs);
  return placed.filter((p) => set.has(p.pod.slug));
}

export interface GlowSegment {
  a: Vec2;
  b: Vec2;
}

/**
 * Road to the lit pods, from the reactor out: per wing with a lit pod, the leg from the ring road to the
 * wing road's turn, the wing road back to the westmost lit spur, then every lit pod's spur to its door.
 * Overlaps never double (one run per wing).
 */
export function roadGlow(layout: LabsLayout, lit: readonly PlacedPod[]): GlowSegment[] {
  const out: GlowSegment[] = [];
  for (const wing of ["software", "ai"] as const) {
    const pods = lit.filter((p) => p.pod.wing === wing);
    if (!pods.length) continue;
    const road = layout.network.roads.find((r) => r.id === wing);
    if (!road || road.points.length < 4) continue;
    const [, start, turn, entry] = road.points;
    const z = turn.z;
    const west = Math.max(start.x, Math.min(...pods.map((p) => p.door.x)));
    out.push({ a: { ...entry }, b: { ...turn } });
    if (turn.x > west) out.push({ a: { ...turn }, b: { x: west, z } });
    for (const p of pods) out.push({ a: { x: p.door.x, z }, b: { ...p.door } });
  }
  return out;
}

/**
 * Surprise me: a random pod from `preferred` (the selected tech's docked pods), or from `all` when the
 * selection has no other pod, never `current` (the pod the rover is at). Null when nothing is left.
 */
export function surprisePod(all: readonly string[], preferred: readonly string[], current: string | null, rand: () => number): string | null {
  const pick = (list: readonly string[]) => {
    const pool = list.filter((s) => s !== current);
    return pool.length ? pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))] : null;
  };
  return pick(preferred) ?? pick(all);
}

/** The pod the rover is at: inside its room or within 3 u of its door pad. */
export function podAt(placed: readonly PlacedPod[], at: Vec2): string | null {
  for (const p of placed) {
    const { rect } = p;
    if (at.x >= rect.minX && at.x <= rect.maxX && at.z >= rect.minZ && at.z <= rect.maxZ) return p.pod.slug;
    if (Math.hypot(at.x - p.door.x, at.z - p.door.z) <= 3) return p.pod.slug;
  }
  return null;
}

/** The drawer's tech entry for a slug, as the store's pick (deep link, Cmd-K); null when unknown. */
export function techFromView(reactor: RoomReactor | undefined, slug: string): ReactorTech | null {
  for (const ring of reactor?.rings ?? []) {
    const tech = ring.techs.find((t) => t.slug === slug);
    if (tech) return { slug: tech.slug, name: tech.name, ring: ring.id, count: tech.pods.length, pods: tech.pods };
  }
  return null;
}

const round = (v: number) => Math.round(v * 1e6) / 1e6;
