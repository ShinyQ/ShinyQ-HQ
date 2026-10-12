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
} from "../model";

/**
 * Concept A, "Reading Room": a closed reading loop (no dead ends) around a round atrium where an open
 * book hologram floats and turns its pages. An aisle crosses the atrium from the lead road. Themed
 * alcoves line the loop: the Blog alcoves on the north side (outer and inner rows, newest first), the
 * Research alcove on the east side, Models and Talks on the south side. Pure.
 */
export const ATRIUM = {
  west: -6,
  north: -22,
  south: 18,
  size: 20,
  /** Distance from a loop corner to the first alcove on a side. */
  start: 10,
  /** Clear road from the last alcove to the next corner. */
  tail: 10,
  board: { w: 7, d: 0.6, z: 12 },
} as const;

export function buildAtriumLayout(input: LibraryLayoutInput): LibraryLayout {
  const A = ATRIUM;
  const { docked, archive } = splitPosts(input);
  const shelves = shelfItems(input);
  const research = shelves.filter((s) => s.zone === "research");
  const lower = shelves.filter((s) => s.zone !== "research");

  const nw: Vec2 = { x: A.west, z: A.north };
  const east = { x: A.west + 1, z: A.north };
  const outer = dockAlong(docked.filter((_, i) => i % 2 === 0), { a: nw, b: east, side: -1, start: A.start });
  const inner = dockAlong(docked.filter((_, i) => i % 2 === 1), { a: nw, b: east, side: 1, start: A.start });
  const southNeed = dockAlong(lower, { a: { x: 0, z: 0 }, b: { x: -1, z: 0 }, side: -1, start: A.start }).end;
  const E = A.west + Math.max(outer.end, inner.end, southNeed, A.size + 2 * A.start) + A.tail;
  const ne: Vec2 = { x: E, z: A.north };
  const se: Vec2 = { x: E, z: A.south };
  const sw: Vec2 = { x: A.west, z: A.south };

  const posts: LibraryStation[] = docked.map((_, i) => (i % 2 === 0 ? outer.stations[i / 2] : inner.stations[(i - 1) / 2]));
  const r = dockAlong(research, { a: ne, b: se, side: -1, start: A.start });
  const low = dockAlong(lower, { a: se, b: sw, side: -1, start: A.start });
  const stations = [...posts, ...r.stations, ...low.stations];

  const center: Vec2 = { x: (A.west + E) / 2, z: 0 };
  const loop: Road = { id: "loop", points: [nw, ne, se, sw], width: LIBRARY_FLOOR.road, closed: true };
  const lead: Road = { id: "lead", points: [LIBRARY_FLOOR.approach, { x: A.west, z: 0 }], width: LIBRARY_FLOOR.road };
  const aisle: Road = { id: "aisle", points: [{ x: A.west, z: 0 }, center, { x: E, z: 0 }], width: LIBRARY_FLOOR.road };
  const atrium: Plaza = { id: "atrium", center, w: A.size, d: A.size, round: true };
  const network: RoadNetwork = { roads: [lead, loop, aisle], plazas: [atrium], spurs: stationSpurs(stations, (z) => ZONE_TONE[z]) };

  // Archive board on the atrium's south rim, facing north; the stop is inside the atrium.
  const boardCenter = { x: center.x, z: A.board.z };
  const board = archive.length
    ? {
        rect: { minX: boardCenter.x - A.board.w / 2, maxX: boardCenter.x + A.board.w / 2, minZ: boardCenter.z - A.board.d / 2, maxZ: boardCenter.z + A.board.d / 2 },
        center: boardCenter,
        stop: { x: boardCenter.x, z: boardCenter.z - A.board.d / 2 - 3 },
      }
    : null;

  const extra: Rect[] = board ? [board.rect] : [];
  const corners = [nw, ne, se, sw].map((c) => ({ x: c.x, z: c.z }));
  const bounds = floorBounds([...stations.map((s) => s.rect), ...extra], corners, LIBRARY_FLOOR.margin + LIBRARY_FLOOR.road / 2);
  const spawn = { x: A.west + 3, z: 5 };
  const floor = libraryFloor({
    bounds,
    stations,
    extraObstacles: extra,
    network,
    spawn,
    // From the west entry, look east across the atrium, zoomed out so the book and the first alcoves fit.
    viewZones: [{ id: "L4:atrium", area: { minX: A.west - 4, maxX: A.west + 4, minZ: -4, maxZ: 8 }, yaw: (-3 * Math.PI) / 4, zoom: 1.3 }],
  });

  return {
    concept: "atrium",
    floor,
    network,
    stations,
    archive,
    board,
    signs: signsFor(stations, center),
    centerpiece: center,
    links: tagLinks(input),
    extras: {},
  };
}
