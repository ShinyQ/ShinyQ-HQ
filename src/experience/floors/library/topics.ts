import type { RoomId } from "@/content/schema";
import type { RoomTopics } from "@/content/room-views/types";
import type { TopicPick } from "@/store/useHQStore";
import { orbitXZ } from "../../fx/signLayout";
import type { LibraryTopic, Vec2 } from "../../types";
import type { LibraryLayout, LibraryStation } from "./model";

/**
 * L4 Topic Constellation (owner request 2026-10-14): pure helpers shared by the drawer, the deep link,
 * Cmd-K and the scene (orb layout, lit stations, road glow, count sign). No React or three.
 */

/** The store pick for a topic of the drawer view (deep link, drawer). */
export function topicPick(topic: RoomTopics["topics"][number]): TopicPick {
  return { slug: topic.slug, name: topic.label, count: topic.items.length, rooms: [...new Set(topic.items.map((i) => i.room))] };
}

/** The drawer's topic for a slug, as the store's pick; null when unknown. */
export function topicFromView(view: RoomTopics | undefined, slug: string): TopicPick | null {
  const topic = view?.topics.find((t) => t.slug === slug);
  return topic ? topicPick(topic) : null;
}

/** The 3D payload's topic as the store's pick (orb clicks). */
export function topicPickOf(topic: LibraryTopic): TopicPick {
  return { slug: topic.slug, name: topic.label, count: topic.count, rooms: [...topic.rooms] };
}

/** The stations a topic lights (docked posts and desks); archived posts light the archive board instead. */
export function litStations(stations: readonly LibraryStation[], rooms: readonly RoomId[]): LibraryStation[] {
  const set = new Set(rooms);
  return stations.filter((s) => set.has(s.room));
}

/** True when the topic has a post that is not docked (it sits on the archive board). */
export function litArchive(layout: Pick<LibraryLayout, "archive">, rooms: readonly RoomId[]): boolean {
  const archived = new Set(layout.archive.map((slug) => `L4:${slug}`));
  return rooms.some((r) => archived.has(r));
}

export interface GlowSegment {
  a: Vec2;
  b: Vec2;
  /** Spur (narrow) or road run (wide). */
  spur: boolean;
}

/**
 * Road to the lit stations, from the constellation out: the timeline from the ring stop back west to the
 * westmost lit spur, then every lit station's spur to its door. Never doubles a run.
 */
export function topicRoadGlow(layout: Pick<LibraryLayout, "end">, lit: readonly LibraryStation[]): GlowSegment[] {
  const end = layout.end;
  if (!end || !lit.length) return [];
  const z = end.ringStop.z;
  const west = Math.min(...lit.map((s) => s.from.x));
  const out: GlowSegment[] = [];
  if (end.ringStop.x > west) out.push({ a: { ...end.ringStop }, b: { x: west, z }, spur: false });
  for (const s of lit) out.push({ a: { ...s.from }, b: { ...s.door }, spur: true });
  return out;
}

/** Constellation geometry: orbit radii and heights of the topic orbs around the pedestal. */
export const CONSTELLATION = {
  /** Pedestal column height (the pick volume tops out here too). */
  pedestal: 2.6,
  /** Orbs orbit in two shells, alternating inner and outer. */
  radii: [3.8, 6.2],
  /** Orb heights rise along a gentle helix between these. */
  minY: 4,
  maxY: 10.2,
  /** Orb size: base plus a step per piece, capped. */
  orb: { base: 0.32, step: 0.06, max: 0.62 },
  /** Orbit speed (rad/s); still under reduced motion. */
  spin: 0.08,
  /** Height of the "N pieces on X" sign, above the cloud. */
  countY: 12.6,
  /** Label lift above an orb. */
  labelLift: 0.75,
} as const;

/** Orbit angle per second: 0 under reduced motion (owner rule: static). */
export function constellationSpin(reducedMotion: boolean): number {
  return reducedMotion ? 0 : CONSTELLATION.spin;
}

export interface OrbSlot {
  slug: string;
  /** Position relative to the plaza center at orbit angle 0. */
  x: number;
  y: number;
  z: number;
  /** Orb radius. */
  size: number;
}

/** Orb positions around the pedestal: evenly spread by angle, alternating shells, rising in height. */
export function orbSlots(topics: readonly Pick<LibraryTopic, "slug" | "count">[]): OrbSlot[] {
  const n = topics.length;
  const C = CONSTELLATION;
  return topics.map((t, i) => {
    const a = (i / Math.max(1, n)) * Math.PI * 2;
    const r = C.radii[i % C.radii.length];
    const y = n > 1 ? C.minY + ((C.maxY - C.minY) * i) / (n - 1) : (C.minY + C.maxY) / 2;
    const size = Math.min(C.orb.max, C.orb.base + C.orb.step * t.count);
    return { slug: t.slug, x: round(Math.sin(a) * r), y: round(y), z: round(-Math.cos(a) * r), size: round(size) };
  });
}

/** A slot turned by the orbit angle about the plaza center (y up; positive angle turns counterclockwise seen from above). */
export function orbitAt(slot: Pick<OrbSlot, "x" | "z">, angle: number): Vec2 {
  return orbitXZ(slot.x, slot.z, angle);
}

/** Pairs of topics that light a common station or desk (constellation lines), each pair once in topic order. */
export function topicLinks(topics: readonly Pick<LibraryTopic, "rooms">[]): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < topics.length; i++) {
    const a = new Set(topics[i].rooms);
    for (let j = i + 1; j < topics.length; j++) if (topics[j].rooms.some((r) => a.has(r))) out.push([i, j]);
  }
  return out;
}

const round = (v: number) => Math.round(v * 1e4) / 1e4;
