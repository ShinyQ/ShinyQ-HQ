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
  type LibraryLayout,
  type LibraryLayoutInput,
  type LibraryStation,
  type LibraryZone,
} from "../model";

/**
 * Concept C, "Constellation": a round core plaza (a star core floats over it) with three spokes to
 * nebula plazas. Posts are stars docked along the east spoke (north and south rows, newest nearest the
 * core) and joined in the sky by lines to the posts they share a tag with. Research sits on the north
 * spoke, Models and Talks face each other on the south spoke, each zone under its own nebula. Pure.
 */
export const CONSTELLATION = {
  core: { x: 0, z: 0 } as Vec2,
  size: 24,
  /** First star on the east spoke (clear of the north and south spokes' stations by 6 u or more). */
  blogStart: 20,
  /** First station on the north and south spokes. */
  spokeStart: 16,
  tail: 8,
  nebula: 16,
  board: { w: 0.6, d: 7 },
} as const;

export function buildConstellationLayout(input: LibraryLayoutInput): LibraryLayout {
  const K = CONSTELLATION;
  const C = K.core;
  const { docked, archive } = splitPosts(input);
  const shelves = shelfItems(input);
  const toward = (dx: number, dz: number): Vec2 => ({ x: C.x + dx, z: C.z + dz });

  const northRow = dockAlong(docked.filter((_, i) => i % 2 === 0), { a: C, b: toward(1, 0), side: -1, start: K.blogStart });
  const southRow = dockAlong(docked.filter((_, i) => i % 2 === 1), { a: C, b: toward(1, 0), side: 1, start: K.blogStart });
  const posts: LibraryStation[] = docked.map((_, i) => (i % 2 === 0 ? northRow.stations[i / 2] : southRow.stations[(i - 1) / 2]));
  // Research on the east side of the north spoke; Models east and Talks west on the south spoke.
  const r = dockAlong(shelves.filter((s) => s.zone === "research"), { a: C, b: toward(0, -1), side: 1, start: K.spokeStart });
  const m = dockAlong(shelves.filter((s) => s.zone === "models"), { a: C, b: toward(0, 1), side: -1, start: K.spokeStart });
  const t = dockAlong(shelves.filter((s) => s.zone === "talks"), { a: C, b: toward(0, 1), side: 1, start: K.spokeStart });
  const stations = [...posts, ...r.stations, ...m.stations, ...t.stations];

  const blogEnd = toward(Math.max(northRow.end, southRow.end, K.blogStart) + K.tail, 0);
  const northEnd = toward(0, -(Math.max(r.end, K.spokeStart) + K.tail));
  const southEnd = toward(0, Math.max(m.end, t.end, K.spokeStart) + K.tail);
  const roads: Road[] = [
    { id: "lead", points: [LIBRARY_FLOOR.approach, C], width: LIBRARY_FLOOR.road },
    { id: "blog", points: [C, blogEnd], width: LIBRARY_FLOOR.road },
    { id: "research", points: [C, northEnd], width: LIBRARY_FLOOR.road },
    { id: "shelves", points: [C, southEnd], width: LIBRARY_FLOOR.road },
  ];
  const plazas: Plaza[] = [
    { id: "core", center: C, w: K.size, d: K.size, round: true },
    { id: "nebula-blog", center: blogEnd, w: K.nebula, d: K.nebula, round: true },
    { id: "nebula-research", center: northEnd, w: K.nebula, d: K.nebula, round: true },
    { id: "nebula-shelves", center: southEnd, w: K.nebula, d: K.nebula, round: true },
  ];
  const network: RoadNetwork = { roads, plazas, spurs: stationSpurs(stations, (z) => ZONE_TONE[z]) };

  // Archive board on the east rim of the blog nebula, facing west.
  const boardCenter = { x: blogEnd.x + K.nebula / 2 + 3 + K.board.w / 2, z: blogEnd.z };
  const board = archive.length
    ? {
        rect: { minX: boardCenter.x - K.board.w / 2, maxX: boardCenter.x + K.board.w / 2, minZ: boardCenter.z - K.board.d / 2, maxZ: boardCenter.z + K.board.d / 2 },
        center: boardCenter,
        stop: { x: boardCenter.x - K.board.w / 2 - 3, z: boardCenter.z },
      }
    : null;

  const nebulae: Record<LibraryZone, Vec2> = {
    blog: { x: (C.x + K.blogStart + blogEnd.x) / 2, z: C.z },
    research: northEnd,
    models: { x: C.x + 10, z: southEnd.z },
    talks: { x: C.x - 10, z: southEnd.z },
  };
  const extra: Rect[] = board ? [board.rect] : [];
  const points = plazas.flatMap((p) => [
    { x: p.center.x - p.w / 2, z: p.center.z - p.d / 2 },
    { x: p.center.x + p.w / 2, z: p.center.z + p.d / 2 },
  ]);
  const bounds = floorBounds([...stations.map((s) => s.rect), ...extra], points, LIBRARY_FLOOR.margin);
  const spawn = { x: C.x - 5, z: C.z + 5 };
  const floor = libraryFloor({
    bounds,
    stations,
    extraObstacles: extra,
    network,
    spawn,
    // On the core: look east along the star spoke, zoomed out so the first stars and their links fit.
    viewZones: [{ id: "L4:core", area: { minX: C.x - 7, maxX: C.x + 7, minZ: C.z - 7, maxZ: C.z + 7 }, yaw: (-3 * Math.PI) / 4, zoom: 1.35 }],
  });

  return {
    concept: "constellation",
    floor,
    network,
    stations,
    archive,
    board,
    signs: signsFor(stations, C),
    centerpiece: C,
    links: tagLinks(input),
    extras: { nebulae },
  };
}
