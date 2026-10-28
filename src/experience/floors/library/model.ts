import type { RoomId } from "@/content/schema";
import { ROAD, type RoadNetwork } from "../../nav/road";
import type { ViewZone } from "../../camera/orbit";
import type { FloorLayout, LibraryData, Rect, Vec2 } from "../../types";
import { SHELF, SHELF_VIEW } from "./shelf";

/**
 * Shared contract of the L4 Writing floor (walkable floors plan, part 3). The concept builder
 * (`concepts/newsroom.ts`) returns a `LibraryLayout`, so the floor, the camera zones and the decor
 * read the same stations. Pure: no React or three.
 */

/** The shipped L4 concept (owner pick: newsroom). */
export type LibraryConcept = "newsroom";

/**
 * Category of a station; display names come from messages (`library.posts`, `library.research`, ...). A `track` is a
 * reader track bay (its name comes from content), so it has no section sign of its own.
 */
export type LibraryZone = "blog" | "research" | "models" | "talks" | "track";
/** The zones with a section sign (every zone but the track bays). */
export type LibrarySection = Exclude<LibraryZone, "track">;
export const LIBRARY_ZONES: readonly LibrarySection[] = ["blog", "research", "models", "talks"];

/** What a layout needs from the payload (`libraryLayoutInput`). Posts keep `getPosts()` order (newest first). */
export interface LibraryLayoutInput {
  posts: { slug: string; date: string; tags: readonly string[]; external: boolean }[];
  /** Reader tracks in dataset order, posts lead first then newest first; tracks without posts are dropped. */
  tracks: { slug: string; posts: string[] }[];
  research: number;
  models: number;
  talks: number;
  /** Research metrics are published (the end plaza's monument shows them). */
  metrics?: boolean;
  /** Certification study guides in file order: the Study Vault's books (none: no vault). */
  guides?: readonly LibraryGuideInput[];
}

/** One study guide as the layout needs it (the book's spine sign and its point-and-go label read these). */
export interface LibraryGuideInput {
  slug: string;
  spine: string;
  issuer: string;
  code: string | null;
}

export function libraryLayoutInput(library: Omit<LibraryData, "shapes">): LibraryLayoutInput {
  return {
    posts: library.posts.map((p) => ({ slug: p.slug, date: p.date, tags: [...p.tags], external: Boolean(p.url) })),
    tracks: library.tracks,
    research: library.research.length,
    models: library.models.length,
    talks: library.talks.length,
    metrics: Boolean(library.researchMetrics),
    guides: library.guides,
  };
}

export const LIBRARY_FLOOR = {
  door: { x: -24, z: 0 } as Vec2,
  approach: { x: -21, z: 0 } as Vec2,
  slabMinX: -24,
  accent: "#e5e7eb",
  road: ROAD.minWidth,
  margin: 6,
  /**
   * Kept free for the elevator call pad (parallel work: a pad in front of the elevator on every floor):
   * no obstacle, door pad, station or sign may touch it. The lead road may cross it.
   */
  padZone: { minX: -24, maxX: -15, minZ: -4.5, maxZ: 4.5 } as Rect,
} as const;

/** Docking sizes: `along` the road and `across` it (u). A track bay docks with its own `along` (`shelfSize`); this is its minimum. */
export const STATION_SIZE: Record<LibraryZone, { along: number; across: number }> = {
  blog: { along: 4, across: 4 },
  research: { along: 10, across: 6 },
  models: { along: 8, across: 6 },
  talks: { along: 8, across: 6 },
  track: { along: SHELF.minAlong, across: SHELF.across },
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

/** One reader track's bay on the timeline: a bookshelf with the lead post's cover and the other posts' spines. */
export interface LibraryBay {
  track: string;
  /** `L4:track:<slug>` (`trackRoom`). */
  room: RoomId;
  rect: Rect;
  center: Vec2;
  /** Door pad center. */
  door: Vec2;
  /** Unit direction from the pad into the bay. */
  facing: Vec2;
  /** Spur start on the road centerline. */
  from: Vec2;
  /** Where the rover stops for the bay and every post on it (the door). */
  stop: Vec2;
  /** Lead first, then newest first (the L4 chunk builds their shelf slots, `baySlots` in slots.ts). */
  posts: string[];
}

export interface LibraryLayout {
  concept: LibraryConcept;
  floor: FloorLayout;
  network: RoadNetwork;
  /** Station order: the featured stage (the newest hosted post, when there is one), then research, models, talks. */
  stations: LibraryStation[];
  /** One bay per reader track, in dataset order, alternating north and south of the timeline. */
  bays: LibraryBay[];
  /** Concept centerpiece (the newsroom headline wall). */
  centerpiece: Vec2;
  /** Concept extras the decor reads (headline wall). */
  extras: { wall?: Rect };
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
  /** The Study Vault off the ring road (south-east), with the study guides as books; null without guides. */
  vault: LibraryVault | null;
}

/** A study guide standing as a tall book in the Study Vault. */
export interface VaultBook extends LibraryGuideInput {
  /** Footprint center. */
  at: Vec2;
  /** Unit direction from the book toward the vault stop: the spine faces this way. */
  facing: Vec2;
  /** Axis-aligned bounds of the turned footprint: a tall camera column and the pick bounds (the books' rects never overlap). */
  rect: Rect;
}

/** The Study Vault (owner request 2026-10-19): a round plaza at the end of a short road off the ring road. */
export interface LibraryVault {
  /** Vault plaza center (where its road ends). */
  center: Vec2;
  /** The rover's stop facing the books (`stops["L4:vault"]`), on the road on the ring side of the center. */
  stop: Vec2;
  /** The ring road vertex the vault road starts on. */
  entry: Vec2;
  /** File order, left to right as seen from the stop. */
  books: VaultBook[];
  /** Bounds of every book's `rect`: the one obstacle the books add (6 u clear floor rule). */
  shelf: Rect;
  /** Vault plaza radius. */
  radius: number;
}

export const roomOfPost = (slug: string): RoomId => `L4:${slug}` as RoomId;
/** The room of a reader track's bay. */
export const trackRoom = (slug: string): RoomId => `L4:track:${slug}` as RoomId;
export const ZONE_ROOM: Record<Exclude<LibrarySection, "blog">, RoomId> = { research: "L4:research", models: "L4:publications", talks: "L4:talks" };

export interface DockItem {
  room: RoomId;
  zone: LibraryZone;
  /** Length along the road (default `STATION_SIZE[zone].along`). */
  along?: number;
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
    const along = item.along ?? STATION_SIZE[item.zone].along;
    const { across } = STATION_SIZE[item.zone];
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

/** The non-post stations that have content (an empty shelf gets no station). */
export function shelfItems(input: LibraryLayoutInput): DockItem[] {
  const out: DockItem[] = [];
  if (input.research) out.push({ room: ZONE_ROOM.research, zone: "research" });
  if (input.models) out.push({ room: ZONE_ROOM.models, zone: "models" });
  if (input.talks) out.push({ room: ZONE_ROOM.talks, zone: "talks" });
  return out;
}

/** Follow-camera yaw that looks at a station from its road (see `ViewZone.yaw` in camera/orbit.ts). */
export function stationYaw(facing: Vec2): number {
  if (facing.z < -0.5) return 0;
  if (facing.z > 0.5) return Math.PI / 2;
  if (facing.x < -0.5) return Math.PI / 4;
  return -Math.PI / 2;
}

/** A camera zone around every door pad that turns the follow camera toward its station; a track bay's also zooms out to its whole shelf (`SHELF_VIEW`). */
export function stationViewZones(stations: readonly LibraryStation[]): ViewZone[] {
  return stations.map((s) => {
    const bay = s.zone === "track";
    const r = bay ? SHELF_VIEW.zone : 2.2;
    return { id: s.room, area: { minX: s.door.x - r, maxX: s.door.x + r, minZ: s.door.z - r, maxZ: s.door.z + r }, yaw: stationYaw(s.facing), ...(bay && { zoom: SHELF_VIEW.zoom, classView: { mobile: { zoom: SHELF_VIEW.zoomPhone } } }) };
  });
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

/** The `FloorLayout` of the concept: doors from stations, obstacles, road, camera zones. */
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
  track: "#22d3ee",
};
