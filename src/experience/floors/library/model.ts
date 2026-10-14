import type { RoomId } from "@/content/schema";
import { ROAD, type RoadNetwork } from "../../nav/road";
import type { ViewZone } from "../../camera/orbit";
import type { FloorLayout, LibraryData, Rect, Vec2 } from "../../types";

/**
 * Shared contract of the L4 Writing floor (walkable floors plan, part 3). Every concept builder
 * (`concepts/*.ts`) returns a `LibraryLayout`, so the floor, the walk, the camera zones and the decor
 * read the same stations whatever concept ships. Pure: no React or three.
 */

export type LibraryConcept = "atrium" | "newsroom" | "constellation";
export const LIBRARY_CONCEPTS: readonly LibraryConcept[] = ["atrium", "newsroom", "constellation"];

/** Category of a station; display names come from messages (`library.posts`, `library.research`, ...). */
export type LibraryZone = "blog" | "research" | "models" | "talks";
export const LIBRARY_ZONES: readonly LibraryZone[] = ["blog", "research", "models", "talks"];

/** What a layout needs from the payload (`libraryLayoutInput`). Posts keep `getPosts()` order (newest first). */
export interface LibraryLayoutInput {
  posts: { slug: string; date: string; tags: readonly string[]; external: boolean }[];
  research: number;
  models: number;
  talks: number;
  /** Research metrics are published (the end plaza's monument shows them). */
  metrics?: boolean;
}

export function libraryLayoutInput(library: LibraryData): LibraryLayoutInput {
  return {
    posts: library.posts.map((p) => ({ slug: p.slug, date: p.date, tags: [...p.tags], external: Boolean(p.url) })),
    research: library.research.length,
    models: library.models.length,
    talks: library.talks.length,
    metrics: Boolean(library.researchMetrics),
  };
}

export const LIBRARY_FLOOR = {
  door: { x: -24, z: 0 } as Vec2,
  approach: { x: -21, z: 0 } as Vec2,
  slabMinX: -24,
  accent: "#e5e7eb",
  road: ROAD.minWidth,
  margin: 6,
  /** Posts docked on the floor; older ones go to the archive board and the posts palette. */
  maxPosts: 12,
  /**
   * Kept free for the elevator call pad (parallel work: a pad in front of the elevator on every floor):
   * no obstacle, door pad, station or sign may touch it. The lead road may cross it.
   */
  padZone: { minX: -24, maxX: -15, minZ: -4.5, maxZ: 4.5 } as Rect,
} as const;

/** Docking sizes: `along` the road and `across` it (u). */
export const STATION_SIZE: Record<LibraryZone, { along: number; across: number }> = {
  blog: { along: 4, across: 4 },
  research: { along: 10, across: 6 },
  models: { along: 8, across: 6 },
  talks: { along: 8, across: 6 },
};

export const DOCK = {
  /** Clear floor between two stations on the same side of a road (space rules: at least 6 u). */
  gap: 6,
  /** Road edge to station front. */
  forecourt: 3,
  /** Station front to door pad center (the rover fits on the pad). */
  padInset: 1.1,
  spurWidth: 3,
} as const;

export interface LibraryStation {
  room: RoomId;
  zone: LibraryZone;
  rect: Rect;
  center: Vec2;
  /** Door pad center (`DoorTrigger.at`). */
  door: Vec2;
  /** Unit direction from the pad into the station. */
  facing: Vec2;
  /** Spur start on the road centerline. */
  from: Vec2;
}

export interface LibraryLayout {
  concept: LibraryConcept;
  floor: FloorLayout;
  network: RoadNetwork;
  /** Walk order: docked posts (newest first, the featured post first where a concept has one), then research, models, talks. */
  stations: LibraryStation[];
  /** Slugs of posts beyond `maxPosts` (archive board and the posts palette). */
  archive: string[];
  /** Archive board with the stop in front of it (null while every post is docked). */
  board: { rect: Rect; center: Vec2; stop: Vec2 } | null;
  /** Zone sign anchors (floor text and icon) with the direction the zone's road runs. */
  signs: Record<LibraryZone, { at: Vec2; heading: Vec2 }>;
  /** Concept centerpiece (atrium book, press stage screen, star core). */
  centerpiece: Vec2;
  /** Docked posts that share a tag (constellation lines; other concepts may ignore them). */
  links: [RoomId, RoomId][];
  /** Concept extras the decor reads (headline wall, year marks, nebulae). */
  extras: { wall?: Rect; years?: { year: string; at: Vec2 }[]; nebulae?: Record<LibraryZone, Vec2> };
  /** The end plaza (newsroom): Topic Constellation, research-metrics monument and Express Return pad. */
  end?: LibraryEnd | null;
}

/** The end of the timeline (owner request 2026-10-14): what fills the turnaround plaza. */
export interface LibraryEnd {
  /** Plaza center: the Topic Constellation stands here. */
  center: Vec2;
  /** The constellation's pedestal footprint (an obstacle the ring road drives around). */
  core: Rect;
  /** Where the timeline meets the ring road: the constellation stop (`stops["L4:topics"]`). */
  ringStop: Vec2;
  /** Research-metrics monument north of the plaza, with the stop in front of it; null without metrics. */
  monument: { rect: Rect; center: Vec2; stop: Vec2 } | null;
  /** Express Return pad (`FloorLayout.returnPad`). */
  returnPad: Vec2;
}

export const roomOfPost = (slug: string): RoomId => `L4:${slug}` as RoomId;
export const ZONE_ROOM: Record<Exclude<LibraryZone, "blog">, RoomId> = { research: "L4:research", models: "L4:publications", talks: "L4:talks" };

export interface DockItem {
  room: RoomId;
  zone: LibraryZone;
}

/** Axis-aligned road segment to dock along, from `a` toward `b`. */
export interface DockRun {
  a: Vec2;
  b: Vec2;
  /** +1 or -1: side of the road, along the normal (-u.z, u.x) of the travel direction u. */
  side: 1 | -1;
  /** Distance from `a` to the first station's near edge. */
  start: number;
  roadWidth?: number;
}

/**
 * Docks stations along one side of an axis-aligned road segment, in order, `DOCK.gap` apart, each
 * with a forecourt, a door pad facing the road and a spur from the road centerline. Returns the
 * stations and the distance from `a` past the last station's far edge.
 */
export function dockAlong(items: readonly DockItem[], run: DockRun): { stations: LibraryStation[]; end: number } {
  const len = Math.hypot(run.b.x - run.a.x, run.b.z - run.a.z) || 1;
  const u = { x: (run.b.x - run.a.x) / len, z: (run.b.z - run.a.z) / len };
  // `+ 0` turns -0 into 0, so facings compare equal in tests and logs.
  const n = { x: -u.z * run.side + 0, z: u.x * run.side + 0 };
  const half = (run.roadWidth ?? LIBRARY_FLOOR.road) / 2;
  let cursor = run.start;
  const stations = items.map((item) => {
    const { along, across } = STATION_SIZE[item.zone];
    const s = cursor + along / 2;
    cursor += along + DOCK.gap;
    const from = { x: run.a.x + u.x * s, z: run.a.z + u.z * s };
    const off = half + DOCK.forecourt + across / 2;
    const center = { x: from.x + n.x * off, z: from.z + n.z * off };
    const w = Math.abs(u.x) * along + Math.abs(n.x) * across;
    const d = Math.abs(u.z) * along + Math.abs(n.z) * across;
    const pad = half + DOCK.forecourt - DOCK.padInset;
    return {
      room: item.room,
      zone: item.zone,
      rect: { minX: center.x - w / 2, maxX: center.x + w / 2, minZ: center.z - d / 2, maxZ: center.z + d / 2 },
      center,
      door: { x: from.x + n.x * pad, z: from.z + n.z * pad },
      facing: { x: n.x, z: n.z },
      from,
    };
  });
  return { stations, end: cursor - DOCK.gap };
}

/** Docked posts (capped) and the archive, from the input (newest first). */
export function splitPosts(input: LibraryLayoutInput): { docked: DockItem[]; archive: string[] } {
  const docked = input.posts.slice(0, LIBRARY_FLOOR.maxPosts).map((p) => ({ room: roomOfPost(p.slug), zone: "blog" as const }));
  return { docked, archive: input.posts.slice(LIBRARY_FLOOR.maxPosts).map((p) => p.slug) };
}

/** The non-post stations that have content (an empty shelf gets no station). */
export function shelfItems(input: LibraryLayoutInput): DockItem[] {
  const out: DockItem[] = [];
  if (input.research) out.push({ room: ZONE_ROOM.research, zone: "research" });
  if (input.models) out.push({ room: ZONE_ROOM.models, zone: "models" });
  if (input.talks) out.push({ room: ZONE_ROOM.talks, zone: "talks" });
  return out;
}

/**
 * Zone name anchors: on the road edge in front of each zone's first station, reading along the road
 * east (+x) or north (-z), so the floor text is upright for the default follow camera (south-east of
 * the rover). Zones without a station sit at `fallback`.
 */
export function signsFor(stations: readonly LibraryStation[], fallback: Vec2): LibraryLayout["signs"] {
  const inset = LIBRARY_FLOOR.road / 2 - 1.4;
  const out = {} as LibraryLayout["signs"];
  for (const zone of LIBRARY_ZONES) {
    const s = stations.find((st) => st.zone === zone);
    if (!s) {
      out[zone] = { at: fallback, heading: { x: 1, z: 0 } };
      continue;
    }
    const along = Math.abs(s.facing.z) > 0.5 ? { x: 1, z: 0 } : { x: 0, z: -1 };
    out[zone] = { at: { x: s.from.x + s.facing.x * inset, z: s.from.z + s.facing.z * inset }, heading: along };
  }
  return out;
}

/**
 * Paper plates of the Research station: spread along its front, 0.15 u outside the glass (so a click
 * reaches the plate, not the station) and turned toward the road (`yaw` as in `HoloIcon` faces).
 */
export function paperSlots(station: LibraryStation, count: number): (Vec2 & { yaw: number; width: number })[] {
  const along = { x: Math.abs(station.facing.z), z: Math.abs(station.facing.x) };
  const w = station.rect.maxX - station.rect.minX;
  const d = station.rect.maxZ - station.rect.minZ;
  const span = along.x * w + along.z * d;
  const front = Math.abs(station.facing.x) * (w / 2) + Math.abs(station.facing.z) * (d / 2) + 0.15;
  const step = (span - 1) / Math.max(1, count);
  const yaw = Math.atan2(-station.facing.x, -station.facing.z);
  return Array.from({ length: count }, (_, i) => {
    const t = -span / 2 + 0.5 + step * (i + 0.5);
    return { x: station.center.x + along.x * t - station.facing.x * front, z: station.center.z + along.z * t - station.facing.z * front, yaw, width: Math.min(1.8, step - 0.3) };
  });
}

/** Follow-camera yaw that looks at a station from its road (see `ViewZone.yaw` in camera/orbit.ts). */
export function stationYaw(facing: Vec2): number {
  if (facing.z < -0.5) return 0;
  if (facing.z > 0.5) return Math.PI / 2;
  if (facing.x < -0.5) return Math.PI / 4;
  return -Math.PI / 2;
}

/** A camera zone around every door pad that turns the follow camera toward its station. */
export function stationViewZones(stations: readonly LibraryStation[]): ViewZone[] {
  return stations.map((s) => {
    const r = 2.2;
    return { id: s.room, area: { minX: s.door.x - r, maxX: s.door.x + r, minZ: s.door.z - r, maxZ: s.door.z + r }, yaw: stationYaw(s.facing) };
  });
}

/** Pairs of docked posts that share at least one tag (each pair once, newer post first). */
export function tagLinks(input: LibraryLayoutInput): [RoomId, RoomId][] {
  const posts = input.posts.slice(0, LIBRARY_FLOOR.maxPosts);
  const out: [RoomId, RoomId][] = [];
  for (let i = 0; i < posts.length; i++)
    for (let j = i + 1; j < posts.length; j++) if (posts[i].tags.some((t) => posts[j].tags.includes(t))) out.push([roomOfPost(posts[i].slug), roomOfPost(posts[j].slug)]);
  return out;
}

const bare = ({ minX, maxX, minZ, maxZ }: Rect): Rect => ({ minX, maxX, minZ, maxZ });

/** Slab bounds around everything on the floor, with the shaft side fixed at `slabMinX`. */
export function floorBounds(rects: readonly Rect[], points: readonly Vec2[], pad: number): Rect {
  const xs = [...rects.flatMap((r) => [r.minX, r.maxX]), ...points.map((p) => p.x)];
  const zs = [...rects.flatMap((r) => [r.minZ, r.maxZ]), ...points.map((p) => p.z)];
  return {
    minX: LIBRARY_FLOOR.slabMinX,
    maxX: Math.max(...xs) + pad,
    minZ: Math.min(...zs) - pad,
    maxZ: Math.max(...zs) + pad,
  };
}

/** The `FloorLayout` every concept shares: doors from stations, obstacles, road, camera zones. */
export function libraryFloor(args: {
  bounds: Rect;
  stations: readonly LibraryStation[];
  extraObstacles: readonly Rect[];
  network: RoadNetwork;
  spawn: Vec2;
  viewZones?: ViewZone[];
  returnPad?: Vec2;
  stops?: FloorLayout["stops"];
  tall?: FloorLayout["tall"];
}): FloorLayout {
  return {
    id: "L4",
    bounds: args.bounds,
    door: LIBRARY_FLOOR.door,
    approach: LIBRARY_FLOOR.approach,
    obstacles: [...args.stations.map((s) => bare(s.rect)), ...args.extraObstacles.map(bare)],
    spawn: args.spawn,
    arrival: args.spawn,
    accent: LIBRARY_FLOOR.accent,
    doors: args.stations.map((s) => ({ room: s.room, at: s.door, facing: s.facing })),
    road: args.network,
    viewZones: [...stationViewZones(args.stations), ...(args.viewZones ?? [])],
    ...(args.returnPad ? { returnPad: args.returnPad } : {}),
    ...(args.stops ? { stops: args.stops } : {}),
    ...(args.tall ? { tall: args.tall } : {}),
  };
}

/** Spurs for the stations (one per door, ending on its pad). */
export function stationSpurs(stations: readonly LibraryStation[], color: (zone: LibraryZone) => string) {
  return stations.map((s) => ({ room: s.room, from: s.from, to: s.door, width: DOCK.spurWidth, color: color(s.zone) }));
}

/** Zone colors (one hue per category, shared by spurs, icons and Page View markers if they ever need one). */
export const ZONE_TONE: Record<LibraryZone, string> = {
  blog: "#22d3ee",
  research: "#fbbf24",
  models: "#a78bfa",
  talks: "#f472b6",
};
