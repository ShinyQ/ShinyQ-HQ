import type { RoomId } from "@/content/schema";
import { CAREER_TONE } from "../../fx/holoIcons";
import { DOOR_SIZE } from "../../nav/doors";
import { ROAD, type Plaza, type Road, type RoadNetwork, type Spur } from "../../nav/road";
import type { CareerData, CareerLayoutInput, CareerType, DoorTrigger, Rect, Vec2 } from "../../types";

/**
 * L2 Career Road (walkable floors plan, Part 2). Pure: no React or three. One road runs forward in
 * time from the elevator to the Workshop annex. Each year is an open plaza on the road whose length
 * scales with its entry count; rooms dock on both long edges of the plaza in one row (no room sits
 * behind another), doors facing the road through a spur and a 2 u apron. The meander shifts every
 * other plaza in z and joins them with S-curves while x keeps increasing, so the rail camera and
 * swipe scrubbing keep working. An arch with the year and a signpost stands on the link before each
 * plaza; the annex (benches, repo wall, the window to L3) closes the road.
 */

export type RoadStyle = "straight" | "meander";

export const CAREER_ROAD = {
  approach: { x: -21, z: 0 } as Vec2,
  /** Elevator door on the shaft face (same as every floor). */
  door: { x: -24, z: 0 } as Vec2,
  slabMinX: -24,
  width: ROAD.minWidth,
  /** Road from the elevator to the first plaza. */
  lead: 10,
  /** Road between two year plazas (the arch and signpost stand here). */
  link: 10,
  /** Plaza depth (z): open floor in the middle to drive around. */
  plazaDepth: 18,
  /** Room bay pitch along a plaza edge, and the stagger between the two sides. */
  pitch: 10,
  stagger: 5,
  /** Floor between a plaza's end and its first or last room. */
  plazaPad: 2,
  /** Space between the road-facing room edge and the plaza edge (the apron). */
  apron: 2,
  roomDepth: 8,
  /** Hologram pedestal footprint (the only obstacle inside a room). */
  pedestal: 2,
  /** Meander amplitude (z shift of every other plaza; owner pick: 7 u). */
  meander: 7,
  annex: { w: 22, d: 18 },
  archPost: 0.6,
  archHeight: 4.8,
  /** Slab margin behind the outermost room (keeps 6 u between pedestals and the slab edge). */
  margin: 3,
} as const;

export const ROOM_W: Record<CareerType, number> = { job: 9, freelance: 9, education: 9, milestone: 9, award: 6 };

/** Side-project benches in the annex: rows of touching benches (one long workbench), 6 u apart. */
export const BENCH = { w: 2.4, d: 1, rows: [7, 14] } as const;
export const REPO_WALL = { thickness: 0.6, inset: 3, height: 5 } as const;

export const WORKSHOP_ROOM: RoomId = "L2:workshop";

export interface CareerRoom {
  id: RoomId;
  slug: string;
  type: CareerType;
  year: number;
  /** Position within the year (0 = oldest). */
  index: number;
  /** -1: north edge of the plaza (z below the road), +1: south edge. */
  side: -1 | 1;
  center: Vec2;
  w: number;
  d: number;
  /** Middle of the road-facing edge (the doorway). */
  door: Vec2;
  /** Door pad center (spur end, where missions drive). */
  at: Vec2;
}

export interface CareerYear {
  year: number;
  plaza: Plaza;
  /** Arch center on the road just before the plaza, its two posts (across the road) and the road heading there. */
  arch: { center: Vec2; posts: [Vec2, Vec2]; angle: number };
  rooms: CareerRoom[];
}

export interface CareerRoadLayout {
  style: RoadStyle;
  bounds: Rect;
  network: RoadNetwork;
  years: CareerYear[];
  rooms: CareerRoom[];
  annex: Plaza;
  workshop: { room: RoomId; at: Vec2; wall: Rect; benches: Vec2[] };
  /** Glass window at the far end, looking up at L3. */
  windowX: number;
  obstacles: Rect[];
  doors: DoorTrigger[];
  /** Scrub stops along x: plaza centers, then the annex. */
  stops: number[];
  approach: Vec2;
  door: Vec2;
}

/** The layout-relevant slice of the locale-resolved career payload. */
export function careerLayoutInput(career: CareerData): CareerLayoutInput {
  return {
    years: career.years.map(({ year, entries }) => ({ year, entries: entries.map(({ slug, type }) => ({ slug, type })) })),
    benches: career.sideProjects.length,
  };
}

const rect = (c: Vec2, w: number, d: number): Rect => ({ minX: c.x - w / 2, maxX: c.x + w / 2, minZ: c.z - d / 2, maxZ: c.z + d / 2 });

/** Plaza length for `n` rooms docked on both edges (staggered), at least the minimum plaza size. */
export function plazaLength(n: number): number {
  const C = CAREER_ROAD;
  const perSide = Math.ceil(n / 2);
  return Math.max(ROAD.minPlaza, perSide * C.pitch + (n > 1 ? C.stagger : 0) + 2 * C.plazaPad);
}

/** S-curve samples from `a` to `b`, excluding `a` (cosine ease in z, linear in x). */
function sCurve(a: Vec2, b: Vec2, steps = 8): Vec2[] {
  return Array.from({ length: steps }, (_, i) => {
    const t = (i + 1) / steps;
    return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * (0.5 - 0.5 * Math.cos(Math.PI * t)) };
  });
}

/** Arch at the middle of a link from (x0, z0) to (x1, z1): the S-curve's midpoint and its heading. */
function archAt(x0: number, z0: number, x1: number, z1: number): CareerYear["arch"] {
  const center = { x: (x0 + x1) / 2, z: (z0 + z1) / 2 };
  // Slope of the cosine ease at t = 0.5.
  const dir = { x: x1 - x0, z: (Math.PI / 2) * (z1 - z0) };
  const len = Math.hypot(dir.x, dir.z) || 1;
  const n = { x: -dir.z / len, z: dir.x / len };
  const off = CAREER_ROAD.width / 2 + 1;
  return {
    center,
    posts: [
      { x: center.x - n.x * off, z: center.z - n.z * off },
      { x: center.x + n.x * off, z: center.z + n.z * off },
    ],
    angle: Math.atan2(dir.x, dir.z),
  };
}

/** Lays out the Career Road: plazas per year (ascending), docked rooms, arches, the annex and the window. */
export function buildCareerRoad(input: CareerLayoutInput, style: RoadStyle = "meander"): CareerRoadLayout {
  const C = CAREER_ROAD;
  const half = C.plazaDepth / 2;
  const points: Vec2[] = [C.approach];
  const years: CareerYear[] = [];
  const rooms: CareerRoom[] = [];
  let x = C.approach.x + C.lead;

  input.years.forEach(({ year, entries }, i) => {
    const zc = style === "meander" ? [0, C.meander, 0, -C.meander][i % 4] : 0;
    const length = plazaLength(entries.length);
    const last = points[points.length - 1];
    const arch = archAt(last.x, last.z, x, zc);
    // Road into the plaza (an S-curve when the plaza shifts), then straight through it.
    if (Math.abs(zc - last.z) > 1e-6) points.push(...sCurve(last, { x, z: zc }));
    else points.push({ x, z: zc });
    points.push({ x: x + length, z: zc });
    const plaza: Plaza = { id: `year-${year}`, center: { x: x + length / 2, z: zc }, w: length, d: C.plazaDepth };

    const list = entries.map(({ slug, type }, index): CareerRoom => {
      const side = (index % 2 === 0 ? -1 : 1) as -1 | 1;
      const slot = Math.floor(index / 2);
      const cx = x + C.plazaPad + (side === 1 ? C.stagger : 0) + slot * C.pitch + C.pitch / 2;
      const front = zc + side * (half + C.apron);
      return {
        id: `L2:${slug}`,
        slug,
        type,
        year,
        index,
        side,
        center: { x: cx, z: front + (side * C.roomDepth) / 2 },
        w: ROOM_W[type],
        d: C.roomDepth,
        door: { x: cx, z: front },
        at: { x: cx, z: front - (side * DOOR_SIZE) / 2 },
      };
    });
    rooms.push(...list);
    years.push({ year, plaza, arch, rooms: list });
    x += length + C.link;
  });

  // Annex at the road's end, back on the center line; the Workshop door on its north edge.
  const annexStart = x;
  const annexX = annexStart + C.annex.w / 2;
  const tail = points[points.length - 1];
  if (Math.abs(tail.z) > 1e-6) points.push(...sCurve(tail, { x: annexStart, z: 0 }));
  else points.push({ x: annexStart, z: 0 });
  points.push({ x: annexStart + C.annex.w - 4, z: 0 });
  const annex: Plaza = { id: "annex", center: { x: annexX, z: 0 }, w: C.annex.w, d: C.annex.d };
  const wallZ = -C.annex.d / 2 - C.apron;
  const wall: Rect = { minX: annexStart + REPO_WALL.inset, maxX: annexStart + C.annex.w, minZ: wallZ - REPO_WALL.thickness, maxZ: wallZ };
  const workshopAt: Vec2 = { x: annexX, z: wallZ + DOOR_SIZE / 2 + 0.2 };

  // Benches south of the road: rows of touching benches (obstacles touch or keep 6 u apart).
  const count = Math.max(0, input.benches);
  const cols = Math.max(1, Math.ceil(count / BENCH.rows.length));
  // Centered in the annex, but at least 6 u clear of the window end of the slab.
  const benchX = Math.min(annexX, annexStart + C.annex.w - ROAD.minClear - (cols * BENCH.w) / 2);
  const benches: Vec2[] = Array.from({ length: count }, (_, i) => ({
    x: benchX + ((i % cols) - (cols - 1) / 2) * BENCH.w,
    z: BENCH.rows[Math.floor(i / cols)],
  }));
  const benchRows: Rect[] = BENCH.rows
    .map((z, row) => {
      const n = Math.min(cols, Math.max(0, count - row * cols));
      return n > 0 ? rect({ x: benchX - ((cols - n) * BENCH.w) / 2, z }, n * BENCH.w, BENCH.d) : null;
    })
    .filter((r): r is Rect => r !== null);

  const plazaOf = new Map(years.map((y) => [y.year, y.plaza]));
  const spurs: Spur[] = [
    ...rooms.map((r) => ({ room: r.id, from: { x: r.at.x, z: plazaOf.get(r.year)!.center.z }, to: r.at, color: CAREER_TONE[r.type] })),
    { room: WORKSHOP_ROOM, from: { x: annexX, z: 0 }, to: workshopAt, color: CAREER_TONE.award },
  ];
  const road: Road = { id: "career", points, width: C.width };

  const archPosts: Rect[] = years.flatMap((y) => y.arch.posts.map((p) => rect(p, C.archPost, C.archPost)));
  const obstacles: Rect[] = [...rooms.map((r) => rect(r.center, C.pedestal, C.pedestal)), ...archPosts, wall, ...benchRows];

  const benchEdge = benchRows.reduce((m, r) => Math.max(m, r.maxZ + ROAD.minClear), 0);
  const outer = Math.max(Math.abs(wall.minZ) + ROAD.minClear, benchEdge, ...rooms.map((r) => Math.abs(r.center.z) + r.d / 2 + C.margin));
  const bounds: Rect = { minX: C.slabMinX, maxX: annexStart + C.annex.w, minZ: -outer, maxZ: outer };
  const doors: DoorTrigger[] = [
    ...rooms.map((r) => ({ room: r.id, at: r.at, facing: { x: 0, z: r.side } })),
    { room: WORKSHOP_ROOM, at: workshopAt, facing: { x: 0, z: -1 } },
  ];

  return {
    style,
    bounds,
    network: { roads: [road], plazas: [...years.map((y) => y.plaza), annex], spurs },
    years,
    rooms,
    annex,
    workshop: { room: WORKSHOP_ROOM, at: workshopAt, wall, benches },
    windowX: bounds.maxX,
    obstacles,
    doors,
    stops: [...years.map((y) => y.plaza.center.x), annexX],
    approach: C.approach,
    door: C.door,
  };
}

/** Where the rover is along the road, for the "You are here" chip: a year (from its arch on), or the annex. */
export function placeAt(layout: Pick<CareerRoadLayout, "years" | "annex">, x: number): number | "workshop" | null {
  if (layout.years.length === 0) return null;
  if (x >= layout.annex.center.x - layout.annex.w / 2 - CAREER_ROAD.link / 2) return "workshop";
  let year = layout.years[0].year;
  for (const y of layout.years) if (x >= y.arch.center.x) year = y.year;
  return year;
}

/** Labels fade out between these distances (u) from the rover along x, so far rooms do not crowd the rail view. */
export const LABEL_FADE = { near: 20, far: 30 } as const;

/** Label opacity for a label `dx` u away from the rover along the road (1 near, 0 beyond `LABEL_FADE.far`). */
export function labelFade(dx: number): number {
  const d = Math.abs(dx);
  if (d <= LABEL_FADE.near) return 1;
  if (d >= LABEL_FADE.far) return 0;
  return 1 - (d - LABEL_FADE.near) / (LABEL_FADE.far - LABEL_FADE.near);
}

/** z of a road whose x increases monotonically (the Career Road) at `x`, clamped to its ends; 0 without points. */
export function roadZAt(points: readonly Vec2[], x: number): number {
  if (points.length === 0) return 0;
  if (x <= points[0].x) return points[0].z;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (x <= b.x) return b.x - a.x < 1e-9 ? b.z : a.z + ((b.z - a.z) * (x - a.x)) / (b.x - a.x);
  }
  return points[points.length - 1].z;
}

/** Fraction of the screen width one scrub step needs. */
export const SCRUB_STEP = 0.3;

/**
 * Maps a horizontal swipe (dx in px) to a road x. Swiping left moves forward in time. Each
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
