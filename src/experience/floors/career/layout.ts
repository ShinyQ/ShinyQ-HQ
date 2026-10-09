import type { RoomId } from "@/content/schema";
import type { CareerData, CareerLayoutInput, CareerType, DoorTrigger, Rect, Vec2 } from "../../types";

/** L2 Career Archive geometry (spec appendix 01 section 3). Pure: no React or three. */
export const CORRIDOR = {
  startX: -20,
  segment: 14,
  /** Corridor walkway is z from -4 to 4. */
  halfWidth: 4,
  /** Row 0 room centers sit at z = +-10; each extra row stacks 9 u further out. */
  roomZ: 10,
  rowPitch: 9,
  annexLength: 20,
  annexDepth: 16,
  /** Door zone edge length; its center sits half a zone in front of the door. */
  doorSize: 2,
  /** Hologram pedestal footprint (the only obstacle inside a room). */
  pedestal: 2,
  gatePost: 0.6,
  slabMargin: 2,
  minHalfDepth: 14,
  slabMinX: -24,
} as const;

export const ROOM_SIZE: Record<CareerType, { w: number; d: number }> = {
  job: { w: 9, d: 8 },
  freelance: { w: 9, d: 8 },
  education: { w: 9, d: 8 },
  milestone: { w: 9, d: 8 },
  award: { w: 6, d: 6 },
};

export const BENCH = { w: 2.4, d: 1, rows: [2.5, 5.5] } as const;
export const REPO_WALL = { thickness: 0.6, inset: 2, height: 5 } as const;

export interface CareerRoomLayout {
  id: RoomId;
  slug: string;
  type: CareerType;
  year: number;
  /** Position within the year (0 = oldest). */
  index: number;
  /** -1: north side (z < 0), +1: south side. */
  side: -1 | 1;
  /** 0 next to the corridor, growing outward. */
  row: number;
  center: Vec2;
  w: number;
  d: number;
  /** Middle of the corridor-facing edge. */
  door: Vec2;
  /** Door zone center (where missions drive). */
  at: Vec2;
}

export interface YearSegment {
  year: number;
  startX: number;
  endX: number;
  centerX: number;
  rooms: CareerRoomLayout[];
}

export interface CorridorLayout {
  segments: YearSegment[];
  rooms: CareerRoomLayout[];
  /** Corridor end, where the Workshop annex starts. */
  endX: number;
  annex: Rect;
  workshop: { at: Vec2; wall: Rect; benches: Vec2[] };
  /** Glass window at the far end, looking up at L3. */
  windowX: number;
  bounds: Rect;
  obstacles: Rect[];
  doors: DoorTrigger[];
  /** Scrub stops along x: segment centers, then the annex. */
  stops: number[];
}

export const WORKSHOP_ROOM: RoomId = "L2:workshop";

/** The layout-relevant slice of the locale-resolved career payload. */
export function careerLayoutInput(career: CareerData): CareerLayoutInput {
  return {
    years: career.years.map(({ year, entries }) => ({ year, entries: entries.map(({ slug, type }) => ({ slug, type })) })),
    benches: career.sideProjects.length,
  };
}

const rect = (c: Vec2, w: number, d: number): Rect => ({ minX: c.x - w / 2, maxX: c.x + w / 2, minZ: c.z - d / 2, maxZ: c.z + d / 2 });

/**
 * Lays out the corridor: one 14 u segment per year (ascending), rooms alternating sides within a
 * segment and stacking outward in rows, then the Workshop annex and the window.
 */
export function buildCorridor(input: CareerLayoutInput): CorridorLayout {
  const C = CORRIDOR;
  const rooms: CareerRoomLayout[] = [];
  const segments: YearSegment[] = input.years.map(({ year, entries }, i) => {
    const startX = C.startX + C.segment * i;
    const centerX = startX + C.segment / 2;
    const list = entries.map(({ slug, type }, index): CareerRoomLayout => {
      const side = index % 2 === 0 ? -1 : 1;
      const row = Math.floor(index / 2);
      const { w, d } = ROOM_SIZE[type];
      const offset = C.roomZ + C.rowPitch * row;
      const inner = offset - d / 2;
      return {
        id: `L2:${slug}`,
        slug,
        type,
        year,
        index,
        side,
        row,
        center: { x: centerX, z: side * offset },
        w,
        d,
        door: { x: centerX, z: side * inner },
        at: { x: centerX, z: side * (inner - C.doorSize / 2) },
      };
    });
    rooms.push(...list);
    return { year, startX, endX: startX + C.segment, centerX, rooms: list };
  });

  const endX = C.startX + C.segment * Math.max(1, segments.length);
  const annex: Rect = { minX: endX, maxX: endX + C.annexLength, minZ: -C.annexDepth / 2, maxZ: C.annexDepth / 2 };
  const annexX = (annex.minX + annex.maxX) / 2;
  const wall: Rect = {
    minX: annex.minX + REPO_WALL.inset,
    maxX: annex.maxX - REPO_WALL.inset,
    minZ: annex.minZ,
    maxZ: annex.minZ + REPO_WALL.thickness,
  };

  const count = Math.max(0, input.benches);
  const cols = Math.max(1, Math.ceil(count / BENCH.rows.length));
  const spacing = (C.annexLength - 2 * REPO_WALL.inset) / cols;
  const benches: Vec2[] = Array.from({ length: count }, (_, i) => ({
    x: annex.minX + REPO_WALL.inset + spacing * ((i % cols) + 0.5),
    z: BENCH.rows[Math.floor(i / cols)],
  }));

  const obstacles: Rect[] = [
    ...rooms.map((r) => rect(r.center, C.pedestal, C.pedestal)),
    ...segments.flatMap((s) => [-1, 1].map((side) => rect({ x: s.startX, z: side * (C.halfWidth + C.gatePost) }, C.gatePost, C.gatePost))),
    wall,
    ...benches.map((b) => rect(b, BENCH.w, BENCH.d)),
  ];

  const outer = rooms.reduce((m, r) => Math.max(m, Math.abs(r.center.z) + r.d / 2), 0);
  const halfDepth = Math.max(C.minHalfDepth, outer + C.slabMargin, C.annexDepth / 2 + C.slabMargin);
  const bounds: Rect = { minX: C.slabMinX, maxX: annex.maxX, minZ: -halfDepth, maxZ: halfDepth };

  const workshopAt: Vec2 = { x: annexX, z: wall.maxZ + 1.5 };
  const doors: DoorTrigger[] = [...rooms.map((r) => ({ room: r.id, at: r.at })), { room: WORKSHOP_ROOM, at: workshopAt }];

  return {
    segments,
    rooms,
    endX,
    annex,
    workshop: { at: workshopAt, wall, benches },
    windowX: annex.maxX,
    bounds,
    obstacles,
    doors,
    stops: [...segments.map((s) => s.centerX), annexX],
  };
}

/** Fraction of the screen width one scrub step needs. */
export const SCRUB_STEP = 0.3;

/**
 * Maps a horizontal swipe (dx in px) to a corridor x. Swiping left moves forward in time. Each
 * `SCRUB_STEP` of the screen width is one stop, and a swipe always moves at least one stop.
 */
export function scrubTarget(x: number, dx: number, width: number, stops: readonly number[]): number {
  if (stops.length === 0 || dx === 0) return x;
  const steps = Math.max(1, Math.round(Math.abs(dx) / (SCRUB_STEP * Math.max(1, width))));
  const eps = 0.5;
  if (dx < 0) {
    const first = stops.findIndex((s) => s > x + eps);
    if (first < 0) return stops[stops.length - 1];
    return stops[Math.min(stops.length - 1, first + steps - 1)];
  }
  let last = -1;
  stops.forEach((s, i) => {
    if (s < x - eps) last = i;
  });
  if (last < 0) return stops[0];
  return stops[Math.max(0, last - steps + 1)];
}
