import type { Plaza, Road, RoadNetwork } from "../../../nav/road";
import type { Rect, Vec2 } from "../../../types";
import {
  dockAlong,
  floorBounds,
  LIBRARY_FLOOR,
  libraryFloor,
  shelfItems,
  signsFor,
  splitPosts,
  stationSpurs,
  tagLinks,
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
 * and a turnaround plaza (archive board on its east rim). Pure.
 */
export const NEWSROOM = {
  plaza: { x: -2, z: 0, w: 24, d: 20 },
  wall: { x: -3, z: -15, w: 18, d: 1, h: 7 },
  /** Featured stage: docked on the south side from the plaza center. */
  featuredStart: 2,
  /** First timeline station on the north and south sides (distance from the plaza center). */
  northStart: 14,
  southStart: 16,
  tail: 10,
  endPlaza: 16,
  board: { w: 0.6, d: 7 },
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

  const endX = P.x + Math.max(north.end, south.end, N.northStart) + N.tail;
  const end: Vec2 = { x: endX, z: P.z };
  const pressPlaza: Plaza = { id: "press", center: P, w: N.plaza.w, d: N.plaza.d };
  const endPlaza: Plaza = { id: "end", center: end, w: N.endPlaza, d: N.endPlaza, round: true };
  const roads: Road[] = [
    { id: "lead", points: [LIBRARY_FLOOR.approach, P], width: LIBRARY_FLOOR.road },
    { id: "timeline", points: [P, end], width: LIBRARY_FLOOR.road },
  ];
  const network: RoadNetwork = { roads, plazas: [pressPlaza, endPlaza], spurs: stationSpurs(stations, (z) => ZONE_TONE[z]) };

  const wall: Rect = { minX: N.wall.x - N.wall.w / 2, maxX: N.wall.x + N.wall.w / 2, minZ: N.wall.z - N.wall.d / 2, maxZ: N.wall.z + N.wall.d / 2 };
  const boardCenter = { x: end.x + N.endPlaza / 2 + 3 + N.board.w / 2, z: end.z };
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
    // On the road edge in front of the first post of the year (alternating sides keep marks apart).
    years.push({ year, at: { x: lane[i].from.x, z: lane[i].from.z + lane[i].facing.z * (LIBRARY_FLOOR.road / 2 - 1.6) } });
  });

  const extra: Rect[] = [wall, ...(board ? [board.rect] : [])];
  const points = [
    { x: P.x - N.plaza.w / 2, z: P.z - N.plaza.d / 2 },
    { x: P.x + N.plaza.w / 2, z: P.z + N.plaza.d / 2 },
    { x: end.x + N.endPlaza / 2, z: end.z + N.endPlaza / 2 },
    { x: end.x - N.endPlaza / 2, z: end.z - N.endPlaza / 2 },
  ];
  const bounds = floorBounds([...stations.map((s) => s.rect), ...extra], points, LIBRARY_FLOOR.margin);
  const spawn = { x: P.x - 4, z: P.z + 3 };
  const floor = libraryFloor({
    bounds,
    stations,
    extraObstacles: extra,
    network,
    spawn,
    viewZones: [
      // In front of the headline wall: look north at it, zoomed out so the whole wall fits.
      { id: "L4:headlines", area: { minX: wall.minX, maxX: wall.maxX, minZ: wall.maxZ + 0.5, maxZ: wall.maxZ + 5 }, yaw: 0, zoom: 1.4 },
    ],
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
  };
}
