import type { Plaza, Road, RoadNetwork } from "../../../nav/road";
import { coreRect, ringRoadEntry, ringRoadPoints } from "../../../nav/ringRoad";
import { TOPICS_ROOM } from "../topicHash";
import type { Rect, Vec2 } from "../../../types";
import {
  DOCK,
  dockAlong,
  floorBounds,
  LIBRARY_FLOOR,
  libraryFloor,
  shelfItems,
  signsFor,
  splitPosts,
  STATION_SIZE,
  stationSpurs,
  tagLinks,
  YEAR_POST,
  ZONE_TONE,
  type DockItem,
  type LibraryLayout,
  type LibraryLayoutInput,
  type LibraryStation,
} from "../model";

/**
 * Concept B, "Newsroom": a press plaza in front of the elevator with a giant headline wall (scrolling
 * ticker of post titles) on its north edge and the featured post (the newest hosted post) on a stage on
 * its south edge. One timeline lane runs east: the other posts newest first, alternating north and
 * south, with year marks on the road where the year changes, then the Research, Models and Talks desks,
 * and the end plaza (owner request 2026-10-14): the Topic Constellation on a pedestal in its middle with a
 * ring road around it, the research-metrics monument on its north rim, the Express Return pad south of it
 * and the archive board on its east rim. Pure.
 */
export const NEWSROOM = {
  plaza: { x: -2, z: 0, w: 24, d: 20 },
  /**
   * Elevator arrivals and floor deep links (Round 8 J, like L3): on the plaza axis, west of its center. The
   * camera stands behind the rover and looks east down the timeline lane at its first stations. Zooms: the
   * widest view whose camera stays east of the glass shaft (`shaftClearZoom`).
   */
  arrival: { x: -4, z: 0 },
  arrivalZoom: 1.12,
  arrivalZoomPhone: 0.96,
  wall: { x: -3, z: -15, w: 18, d: 1, h: 7 },
  /** Featured stage: docked on the south side from the plaza center. */
  featuredStart: 2,
  /** First timeline station on the north and south sides (distance from the plaza center). */
  northStart: 14,
  southStart: 16,
  tail: 10,
  board: { w: 0.6, d: 7, h: 4.2 },
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
    /** Camera zones: straight north at the monument, straight east at the arrival, the constellation and the board. */
    lookNorth: -Math.PI / 4,
    lookEast: (-3 * Math.PI) / 4,
    /** Zoom out at the constellation stop so the whole cloud fits. */
    zoom: 1.35,
  },
} as const;

export function buildNewsroomLayout(input: LibraryLayoutInput): LibraryLayout {
  const N = NEWSROOM;
  const P: Vec2 = { x: N.plaza.x, z: N.plaza.z };
  const east = { x: P.x + 1, z: P.z };
  const { docked, archive } = splitPosts(input);
  const featuredIndex = input.posts.slice(0, docked.length).findIndex((p) => !p.external);
  const featured: DockItem[] = featuredIndex >= 0 ? [docked[featuredIndex]] : [];
  const timeline: DockItem[] = [...docked.filter((_, i) => i !== featuredIndex), ...shelfItems(input)];

  const stage = dockAlong(featured, { a: P, b: east, side: 1, start: N.featuredStart });
  const northItems = timeline.filter((_, i) => i % 2 === 0);
  const southItems = timeline.filter((_, i) => i % 2 === 1);
  const north = dockAlong(northItems, { a: P, b: east, side: -1, start: N.northStart });
  const south = dockAlong(southItems, { a: P, b: east, side: 1, start: N.southStart });
  const lane: LibraryStation[] = timeline.map((_, i) => (i % 2 === 0 ? north.stations[i / 2] : south.stations[(i - 1) / 2]));
  const stations = [...stage.stations, ...lane];

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
  const network: RoadNetwork = { roads, plazas: [pressPlaza, endPlaza], spurs: stationSpurs(stations, (z) => ZONE_TONE[z]) };

  const wall: Rect = { minX: N.wall.x - N.wall.w / 2, maxX: N.wall.x + N.wall.w / 2, minZ: N.wall.z - N.wall.d / 2, maxZ: N.wall.z + N.wall.d / 2 };
  const boardCenter = { x: end.x + radius + 3 + N.board.w / 2, z: end.z };
  const board = archive.length
    ? {
        rect: { minX: boardCenter.x - N.board.w / 2, maxX: boardCenter.x + N.board.w / 2, minZ: boardCenter.z - N.board.d / 2, maxZ: boardCenter.z + N.board.d / 2 },
        center: boardCenter,
        stop: { x: boardCenter.x - N.board.w / 2 - 3, z: boardCenter.z },
      }
    : null;

  // Year marks on the lane: before the first post of each year (the featured post's year is on its stage).
  const years: { year: string; at: Vec2 }[] = [];
  let last = featuredIndex >= 0 ? input.posts[featuredIndex].date.slice(0, 4) : "";
  timeline.forEach((item, i) => {
    if (item.zone !== "blog") return;
    const year = input.posts.find((p) => `L4:${p.slug}` === item.room)!.date.slice(0, 4);
    if (year === last) return;
    last = year;
    // A low post on the road edge in the gap before the first post of the year (Round 7 F: no billboard in the camera path).
    const s = lane[i];
    years.push({ year, at: { x: s.from.x - (STATION_SIZE.blog.along / 2 + DOCK.gap / 2), z: s.from.z + s.facing.z * (LIBRARY_FLOOR.road / 2 + YEAR_POST.edge) } });
  });

  const monumentCenter = { x: end.x, z: end.z - radius - E.monument.gap - E.monument.d / 2 };
  const monument = input.metrics
    ? {
        rect: { minX: monumentCenter.x - E.monument.w / 2, maxX: monumentCenter.x + E.monument.w / 2, minZ: monumentCenter.z - E.monument.d / 2, maxZ: monumentCenter.z + E.monument.d / 2 },
        center: monumentCenter,
        stop: { x: end.x, z: end.z - radius + E.monument.stopInset },
      }
    : null;
  const returnPad = { x: end.x + E.returnPad.dx, z: end.z + E.returnPad.dz };

  const extra: Rect[] = [wall, ...(board ? [board.rect] : []), core, ...(monument ? [monument.rect] : [])];
  const points = [
    { x: P.x - N.plaza.w / 2, z: P.z - N.plaza.d / 2 },
    { x: P.x + N.plaza.w / 2, z: P.z + N.plaza.d / 2 },
    { x: end.x + radius, z: end.z + radius },
    { x: end.x - radius, z: end.z - radius },
    { x: returnPad.x, z: returnPad.z + 1.5 },
  ];
  const bounds = floorBounds([...stations.map((s) => s.rect), ...extra], points, LIBRARY_FLOOR.margin);
  const spawn: Vec2 = { x: N.arrival.x, z: N.arrival.z };
  const floor = libraryFloor({
    bounds,
    stations,
    extraObstacles: extra,
    network,
    spawn,
    viewZones: [
      // The arrival: behind a rover heading east, looking down the timeline lane (eastbound rovers only).
      {
        id: "L4:arrival",
        area: around(spawn, 2),
        yaw: E.lookEast,
        zoom: N.arrivalZoom,
        classView: { mobile: { zoom: N.arrivalZoomPhone } },
        travel: { x: 1, z: 0 },
      },
      // In front of the headline wall: look north at it, zoomed out so the whole wall fits.
      { id: "L4:headlines", area: { minX: wall.minX, maxX: wall.maxX, minZ: wall.maxZ + 0.5, maxZ: wall.maxZ + 5 }, yaw: 0, zoom: 1.4 },
      // The end plaza: look east over the constellation from where the timeline meets the ring road.
      { id: TOPICS_ROOM, area: around(ringStop, 2.5), yaw: E.lookEast, zoom: E.zoom },
      ...(monument ? [{ id: "L4:metrics", area: around(monument.stop, 2.5), yaw: E.lookNorth, zoom: 1.2 }] : []),
      ...(board ? [{ id: "L4:board:archive", area: around(board.stop, 2), yaw: E.lookEast }] : []),
    ],
    returnPad,
    stops: { [TOPICS_ROOM]: ringStop },
    // The pedestal with its topic cloud, the monument and the board block a low camera up to their height.
    tall: [{ ...core, h: E.coreHeight }, ...(monument ? [{ ...monument.rect, h: E.monument.h }] : []), ...(board ? [{ ...board.rect, h: N.board.h }] : [])],
  });

  return {
    concept: "newsroom",
    floor,
    network,
    stations,
    archive,
    board,
    signs: signsFor(stations, P),
    centerpiece: { x: N.wall.x, z: wall.maxZ },
    links: tagLinks(input),
    extras: { wall, years },
    end: { center: end, core, ringStop, monument, returnPad },
  };
}

const around = (p: Vec2, r: number): Rect => ({ minX: p.x - r, maxX: p.x + r, minZ: p.z - r, maxZ: p.z + r });
