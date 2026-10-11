import type { RoomId } from "@/content/schema";
import { DOOR_SIZE } from "../nav/doors";
import { ROAD, type Plaza, type Road, type RoadNetwork, type Spur } from "../nav/road";
import type { CareerLayoutInput, CareerType, DoorTrigger, Rect, Vec2 } from "../types";

/**
 * Prototype of the L2 Career Road (design check, not wired into the tower). One road runs forward
 * in time from the elevator to the Workshop annex. Each year is an open plaza on the road whose
 * length scales with its entry count; rooms dock on both long edges of the plaza (all in one row,
 * doors facing the road through a spur and a 2 u apron). `meander` shifts every other plaza in z
 * and joins them with S-curves while x keeps increasing, so the rail camera and scrubbing still work.
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
  pedestal: 2,
  /** Meander amplitude (z shift of every other plaza). */
  meander: 7,
  annex: { w: 22, d: 18 },
  archPost: 0.6,
  /** Slab margin behind the outermost room (keeps 6 u between pedestals and the slab edge). */
  margin: 3,
} as const;

export const ROOM_W: Record<CareerType, number> = { job: 9, freelance: 9, education: 9, milestone: 9, award: 6 };

/** Room type tints (appendix 05 accents), shared by spur stubs and room floors. */
export const TYPE_COLOR: Record<CareerType, string> = {
  job: "#22d3ee",
  freelance: "#34d399",
  education: "#60a5fa",
  award: "#fbbf24",
  milestone: "#a78bfa",
};

export interface CareerRoadRoom {
  id: RoomId;
  slug: string;
  type: CareerType;
  year: number;
  side: -1 | 1;
  center: Vec2;
  w: number;
  d: number;
  /** Door pad center (spur end). */
  at: Vec2;
}

export interface CareerRoadYear {
  year: number;
  plaza: Plaza;
  /** Arch center on the road just before the plaza, its two posts (across the road) and the road heading there. */
  arch: { center: Vec2; posts: [Vec2, Vec2]; angle: number };
  rooms: CareerRoadRoom[];
}

export interface CareerRoadLayout {
  style: RoadStyle;
  bounds: Rect;
  network: RoadNetwork;
  years: CareerRoadYear[];
  rooms: CareerRoadRoom[];
  annex: Plaza;
  workshop: { room: RoomId; at: Vec2; wall: Rect };
  obstacles: Rect[];
  doors: DoorTrigger[];
  /** Scrub stops: plaza centers, then the annex. */
  stops: number[];
  approach: Vec2;
  door: Vec2;
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
function archAt(x0: number, z0: number, x1: number, z1: number): CareerRoadYear["arch"] {
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

export function buildCareerRoad(input: CareerLayoutInput, style: RoadStyle = "meander"): CareerRoadLayout {
  const C = CAREER_ROAD;
  const half = C.plazaDepth / 2;
  const points: Vec2[] = [C.approach];
  const years: CareerRoadYear[] = [];
  const rooms: CareerRoadRoom[] = [];
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

    const list = entries.map(({ slug, type }, index): CareerRoadRoom => {
      const side = (index % 2 === 0 ? -1 : 1) as -1 | 1;
      const slot = Math.floor(index / 2);
      const cx = x + C.plazaPad + (side === 1 ? C.stagger : 0) + slot * C.pitch + C.pitch / 2;
      const front = zc + side * (half + C.apron);
      return {
        id: `L2:${slug}`,
        slug,
        type,
        year,
        side,
        center: { x: cx, z: front + (side * C.roomDepth) / 2 },
        w: ROOM_W[type],
        d: C.roomDepth,
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
  const wall: Rect = { minX: annexStart + 3, maxX: annexStart + C.annex.w, minZ: wallZ - 0.6, maxZ: wallZ };
  const workshop = { room: "L2:workshop" as RoomId, at: { x: annexX, z: wallZ + DOOR_SIZE / 2 + 0.2 }, wall };

  const plazaOf = new Map(years.map((y) => [y.year, y.plaza]));
  const spurs: Spur[] = [
    ...rooms.map((r) => ({ room: r.id, from: { x: r.at.x, z: plazaOf.get(r.year)!.center.z }, to: r.at, color: TYPE_COLOR[r.type] })),
    { room: workshop.room, from: { x: annexX, z: 0 }, to: workshop.at, color: "#fbbf24" },
  ];
  const road: Road = { id: "career", points, width: C.width };

  const archPosts: Rect[] = years.flatMap((y) => y.arch.posts.map((p) => rect(p, C.archPost, C.archPost)));
  const obstacles: Rect[] = [...rooms.map((r) => rect(r.center, C.pedestal, C.pedestal)), ...archPosts, wall];

  const outer = Math.max(Math.abs(wallZ) + 0.6 + 6, ...rooms.map((r) => Math.abs(r.center.z) + r.d / 2 + C.margin));
  const bounds: Rect = { minX: C.slabMinX, maxX: annexStart + C.annex.w, minZ: -outer, maxZ: outer };
  const doors: DoorTrigger[] = [
    ...rooms.map((r) => ({ room: r.id, at: r.at, facing: { x: 0, z: r.side } })),
    { room: workshop.room, at: workshop.at, facing: { x: 0, z: -1 } },
  ];

  return {
    style,
    bounds,
    network: { roads: [road], plazas: [...years.map((y) => y.plaza), annex], spurs },
    years,
    rooms,
    annex,
    workshop,
    obstacles,
    doors,
    stops: [...years.map((y) => y.plaza.center.x), annexX],
    approach: C.approach,
    door: C.door,
  };
}
