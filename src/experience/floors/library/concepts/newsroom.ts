import type { RoomId } from "@/content/schema";
import type { Plaza, Road, RoadNetwork } from "../../../nav/road";
import { coreRect, ringRoadEntry, ringRoadPoints } from "../../../nav/ringRoad";
import { ARRIVAL_YAW } from "../../../camera/look";
import { TOPICS_ROOM } from "../topicHash";
import type { Rect, Vec2 } from "../../../types";
import {
  dockAlong,
  floorBounds,
  LIBRARY_FLOOR,
  libraryFloor,
  roomOfPost,
  shelfItems,
  stationSpurs,
  trackRoom,
  ZONE_TONE,
  type DockItem,
  type LibraryBay,
  type LibraryLayout,
  type LibraryLayoutInput,
  type LibraryGuideInput,
  type LibraryStation,
  type LibraryVault,
  type VaultBook,
} from "../model";
import { shelfSize } from "../shelf";

/**
 * Concept B, "Newsroom": a press plaza in front of the elevator with a giant headline wall (scrolling
 * ticker of post titles) on its north edge and the featured post (the newest hosted post) on a stage on
 * its south edge. One timeline lane runs east: one bookshelf bay per reader track in dataset order,
 * alternating north and south (the featured post keeps its slot on its track's shelf too), then the Research,
 * Models and Talks desks, and the end plaza (owner request 2026-10-14): the Topic Constellation on a pedestal
 * in its middle with a ring road around it, the research-metrics monument on its north rim and the Express
 * Return pad south of it. Pure.
 */
export const NEWSROOM = {
  plaza: { x: -2, z: 0, w: 24, d: 20 },
  /**
   * Elevator arrivals and floor deep links (Round 8 J, like L3): on the plaza axis, west of its center. The
   * camera stands behind the rover and looks east down the timeline lane at its first stations. Zooms: under
   * `shaftClearZoom` (the camera stays east of the glass shaft), wide enough on desktops for the first bay's track sign.
   */
  arrival: { x: -4, z: 0 },
  arrivalZoom: 1.16,
  arrivalZoomPhone: 0.96,
  wall: { x: -3, z: -15, w: 18, d: 1, h: 7 },
  /** Featured stage: docked on the south side from the plaza center. */
  featuredStart: 2,
  /** First timeline station on the north and south sides (distance from the plaza center). */
  northStart: 14,
  southStart: 16,
  tail: 10,
  /** The end plaza: the timeline's turnaround, filled with the Topic Constellation. */
  end: {
    /** Round plaza diameter (room for the ring road around the pedestal and the orbiting topics). */
    plaza: 26,
    /** Extra run past `tail`, so the wider plaza clears the last station. */
    lead: 5,
    /** Half side of the constellation pedestal (the obstacle). */
    core: 1.6,
    /** Top of the topic cloud: the pedestal blocks a low camera up to here. */
    coreHeight: 11.5,
    /** Ring road around the pedestal (centerline radius, vertices; vertex 0 due north). */
    ring: 6.5,
    segments: 16,
    /** Monument north of the plaza: footprint, height, gap to the plaza rim; the stop stands `stopInset` inside the rim. */
    monument: { w: 6, d: 1.5, h: 6.5, gap: 3, stopInset: 1.5 },
    /** Express Return pad, from the plaza center: south of the plaza, on the side toward the elevator. */
    returnPad: { dx: -4, dz: 15 },
    /** Camera zones: straight north at the monument, straight east at the arrival and the constellation. */
    lookNorth: -Math.PI / 4,
    lookEast: (-3 * Math.PI) / 4,
    /** Zoom out at the constellation stop so the whole cloud fits. */
    zoom: 1.35,
    /** How far west of the constellation stop an eastbound rover already gets its view (along the timeline). */
    approach: 8,
    /**
     * The Study Vault (owner request 2026-10-19), only with study guides: a road from a ring road vertex out along
     * its diagonal to a small round plaza, the stop on the plaza's ring side and the guides as tall books on an arc
     * around the stop on the plaza's east rim, each facing the stop; the camera at the stop looks east at them, like
     * the floor's other end plaza views. South-east, so it stays clear of the Return pad (south-west of it) and the
     * monument (north rim); `tests/unit/library-vault.test.ts` checks the space
     * rules, a 3 u clearance from each of them and the framing of every book on every screen class.
     *
     * The arc runs north to south, so the books' common footprint (`LibraryVault.shelf`, the one obstacle) is a thin
     * axis-aligned strip: one obstacle per book would leave gaps under the 6 u clear floor rule between them.
     */
    vault: {
      /** Ring road vertex the vault road starts on: 6 of 16 is 135 degrees, south-east. */
      entryVertex: 6,
      /** Vault plaza center from the end plaza center, along the entry's diagonal: the two rims stay 1 u apart. */
      distance: 22,
      /** Round plaza diameter (`ROAD.minPlaza`). */
      plaza: 16,
      /**
       * The stop stands this far from the vault plaza center, toward the ring, on the road: close to the center, so five
       * books on the arc stay inside the plaza and clear of the road's end.
       */
      stopInset: 0.5,
      /**
       * The books stand on an arc of this radius around the stop, centered due east of it, `spacing` apart along the
       * arc (file order north to south, left to right on screen); the road's end keeps its half width clear of them.
       */
      arc: 8,
      spacing: 3,
      /** Book: thickness (the spine) along the arc, depth toward the stop, height (a tall camera column). */
      book: { w: 1.2, d: 2.6, h: 4.2 },
      /** Camera zone half size around the stop, and its zooms: every book in view, phones included. */
      zone: 2.5,
      zoom: 1.15,
      zoomPhone: 1.15,
    },
  },
} as const;

/** The Study Vault stop and camera zone (a stop with a view, no drawer: no catalog room). */
export const VAULT_ROOM = "L4:vault" as RoomId;

export function buildNewsroomLayout(input: LibraryLayoutInput): LibraryLayout {
  const N = NEWSROOM;
  const P: Vec2 = { x: N.plaza.x, z: N.plaza.z };
  const east = { x: P.x + 1, z: P.z };
  // The featured stage: the newest hosted post (it keeps its slot on its track's shelf too).
  const newest = input.posts.find((p) => !p.external);
  const featured: DockItem[] = newest ? [{ room: roomOfPost(newest.slug), zone: "blog" }] : [];
  const tracks = input.tracks.filter((t) => t.posts.length);
  const timeline: DockItem[] = [...tracks.map((t): DockItem => ({ room: trackRoom(t.slug), zone: "track", along: shelfSize(t.posts.length).along })), ...shelfItems(input)];

  const stage = dockAlong(featured, { a: P, b: east, side: 1, start: N.featuredStart });
  const northItems = timeline.filter((_, i) => i % 2 === 0);
  const southItems = timeline.filter((_, i) => i % 2 === 1);
  const north = dockAlong(northItems, { a: P, b: east, side: -1, start: N.northStart });
  const south = dockAlong(southItems, { a: P, b: east, side: 1, start: N.southStart });
  const lane: LibraryStation[] = timeline.map((_, i) => (i % 2 === 0 ? north.stations[i / 2] : south.stations[(i - 1) / 2]));
  // Every door pad in door order: the stage, the bays, the desks.
  const docked = [...stage.stations, ...lane];
  const stations = docked.filter((s) => s.zone !== "track");
  const bays: LibraryBay[] = tracks.map((t, i) => {
    const s = lane[i];
    return { ...s, track: t.slug, stop: s.door, posts: t.posts };
  });

  const E = N.end;
  const endX = P.x + Math.max(north.end, south.end, N.northStart) + N.tail + E.lead;
  const end: Vec2 = { x: endX, z: P.z };
  const radius = E.plaza / 2;
  const core = coreRect(end, E.core);
  const ringStop = ringRoadEntry(end, P, E.ring);
  const pressPlaza: Plaza = { id: "press", center: P, w: N.plaza.w, d: N.plaza.d };
  const endPlaza: Plaza = { id: "end", center: end, w: E.plaza, d: E.plaza, round: true, core: E.core };
  const roads: Road[] = [
    { id: "lead", points: [LIBRARY_FLOOR.approach, P], width: LIBRARY_FLOOR.road },
    { id: "timeline", points: [P, ringStop], width: LIBRARY_FLOOR.road },
    { id: "end-ring", points: ringRoadPoints(end, E.ring, E.segments), width: LIBRARY_FLOOR.road, closed: true },
  ];
  const network: RoadNetwork = { roads, plazas: [pressPlaza, endPlaza], spurs: stationSpurs(docked, (z) => ZONE_TONE[z]) };

  const wall: Rect = { minX: N.wall.x - N.wall.w / 2, maxX: N.wall.x + N.wall.w / 2, minZ: N.wall.z - N.wall.d / 2, maxZ: N.wall.z + N.wall.d / 2 };
  const monumentCenter = { x: end.x, z: end.z - radius - E.monument.gap - E.monument.d / 2 };
  const monument = input.metrics
    ? {
        rect: { minX: monumentCenter.x - E.monument.w / 2, maxX: monumentCenter.x + E.monument.w / 2, minZ: monumentCenter.z - E.monument.d / 2, maxZ: monumentCenter.z + E.monument.d / 2 },
        center: monumentCenter,
        stop: { x: end.x, z: end.z - radius + E.monument.stopInset },
      }
    : null;
  const returnPad = { x: end.x + E.returnPad.dx, z: end.z + E.returnPad.dz };
  const vault = studyVault(end, input.guides ?? []);
  if (vault) {
    roads.push({ id: "vault", points: [vault.entry, vault.center], width: LIBRARY_FLOOR.road });
    network.plazas.push({ id: "vault", center: vault.center, w: E.vault.plaza, d: E.vault.plaza, round: true });
  }
  const books = vault?.books.map((b) => b.rect) ?? [];

  const extra: Rect[] = [wall, core, ...(monument ? [monument.rect] : []), ...(vault ? [vault.shelf] : [])];
  const points = [
    { x: P.x - N.plaza.w / 2, z: P.z - N.plaza.d / 2 },
    { x: P.x + N.plaza.w / 2, z: P.z + N.plaza.d / 2 },
    { x: end.x + radius, z: end.z + radius },
    { x: end.x - radius, z: end.z - radius },
    { x: returnPad.x, z: returnPad.z + 1.5 },
  ];
  const bounds = floorBounds([...docked.map((s) => s.rect), ...extra, ...(vault ? [around(vault.center, vault.radius)] : [])], points, LIBRARY_FLOOR.margin);
  const spawn: Vec2 = { x: N.arrival.x, z: N.arrival.z };
  // Every post drives to its bay's door; the featured post's room keeps the stage door (doors win over stops).
  const postStops: Partial<Record<RoomId, Vec2>> = {};
  for (const bay of bays) for (const slug of bay.posts) if (slug !== newest?.slug) postStops[roomOfPost(slug)] = bay.stop;
  const floor = libraryFloor({
    bounds,
    stations: docked,
    extraObstacles: extra,
    network,
    spawn,
    viewZones: [
      // The arrival: behind a rover heading east, looking down the timeline lane (eastbound rovers only).
      {
        id: "L4:arrival",
        area: around(spawn, 2),
        yaw: ARRIVAL_YAW,
        zoom: N.arrivalZoom,
        classView: { mobile: { zoom: N.arrivalZoomPhone } },
        travel: { x: 1, z: 0 },
        arrivalOnly: true,
      },
      // In front of the headline wall: look north at it, zoomed out so the whole wall fits.
      { id: "L4:headlines", area: { minX: wall.minX, maxX: wall.maxX, minZ: wall.maxZ + 0.5, maxZ: wall.maxZ + 5 }, yaw: 0, zoom: 1.4 },
      // The end plaza: look east over the constellation from where the timeline meets the ring road.
      { id: TOPICS_ROOM, area: around(ringStop, 2.5), yaw: E.lookEast, zoom: E.zoom },
      // Its approach on the timeline, same id and view: a rover heading east toward the plaza already sees the
      // whole cloud with the topic count above it. Eastbound only, so a drive back west from the plaza keeps its view.
      {
        id: TOPICS_ROOM,
        area: { minX: ringStop.x - E.approach, maxX: ringStop.x - 2.5, minZ: ringStop.z - 2.5, maxZ: ringStop.z + 2.5 },
        yaw: E.lookEast,
        zoom: E.zoom,
        travel: { x: 1, z: 0 },
      },
      ...(monument ? [{ id: "L4:metrics", area: around(monument.stop, 2.5), yaw: E.lookNorth, zoom: 1.2 }] : []),
      // The Study Vault: from the stop, look east at the books (any heading), zoomed out so all four fit.
      ...(vault ? [{ id: VAULT_ROOM, area: around(vault.stop, E.vault.zone), yaw: E.lookEast, zoom: E.vault.zoom, classView: { mobile: { zoom: E.vault.zoomPhone } } }] : []),
    ],
    returnPad,
    stops: { ...postStops, [TOPICS_ROOM]: ringStop, ...(vault ? { [VAULT_ROOM]: vault.stop } : {}) },
    // The pedestal with its topic cloud, the monument and the vault books block a low camera up to their height.
    tall: [
      { ...core, h: E.coreHeight },
      ...(monument ? [{ ...monument.rect, h: E.monument.h }] : []),
      ...books.map((r) => ({ ...r, h: E.vault.book.h })),
    ],
  });

  return {
    concept: "newsroom",
    floor,
    network,
    stations,
    bays,
    centerpiece: { x: N.wall.x, z: wall.maxZ },
    extras: { wall },
    end: { center: end, core, ringStop, monument, returnPad, vault },
  };
}

/**
 * The Study Vault off the end plaza (`NEWSROOM.end.vault`): the plaza center and the stop on the entry's diagonal, and
 * the books on an arc around the stop centered due east of it, in file order north to south (left to right as the
 * camera looks east), each turned with its spine toward the stop. Null without guides, so the floor stays as it was.
 */
function studyVault(end: Vec2, guides: readonly LibraryGuideInput[]): LibraryVault | null {
  if (!guides.length) return null;
  const V = NEWSROOM.end.vault;
  const entry = ringRoadPoints(end, NEWSROOM.end.ring, NEWSROOM.end.segments)[V.entryVertex];
  const len = Math.hypot(entry.x - end.x, entry.z - end.z);
  const dir = { x: (entry.x - end.x) / len, z: (entry.z - end.z) / len };
  const center = { x: end.x + dir.x * V.distance, z: end.z + dir.z * V.distance };
  const stop = { x: center.x - dir.x * V.stopInset, z: center.z - dir.z * V.stopInset };
  const step = V.spacing / V.arc;
  const books = guides.map((g, i): VaultBook => {
    const a = (i - (guides.length - 1) / 2) * step;
    const at = { x: stop.x + Math.cos(a) * V.arc, z: stop.z + Math.sin(a) * V.arc };
    const facing = { x: -Math.cos(a), z: -Math.sin(a) };
    const hx = (Math.abs(facing.z) * V.book.w + Math.abs(facing.x) * V.book.d) / 2;
    const hz = (Math.abs(facing.x) * V.book.w + Math.abs(facing.z) * V.book.d) / 2;
    return { ...g, at, facing, rect: { minX: at.x - hx, maxX: at.x + hx, minZ: at.z - hz, maxZ: at.z + hz } };
  });
  const shelf: Rect = {
    minX: Math.min(...books.map((b) => b.rect.minX)),
    maxX: Math.max(...books.map((b) => b.rect.maxX)),
    minZ: Math.min(...books.map((b) => b.rect.minZ)),
    maxZ: Math.max(...books.map((b) => b.rect.maxZ)),
  };
  return { center, stop, entry, books, shelf, radius: V.plaza / 2 };
}

const around = (p: Vec2, r: number): Rect => ({ minX: p.x - r, maxX: p.x + r, minZ: p.z - r, maxZ: p.z + r });
