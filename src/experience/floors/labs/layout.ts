import type { RoomId, Wing } from "@/content/schema";
import { comparePods } from "@/content/selectors";
import { ROAD, type Plaza, type Road, type RoadNetwork, type Spur } from "../../nav/road";
import type { ViewZone } from "../../camera/orbit";
import type { DoorTrigger, FloorLayout, LabPod, Rect, Vec2 } from "../../types";

/**
 * L3 Project Roads (walkable floors plan, part 2; consolidated in round 5, owner request 2026-10-13).
 * The global elevator shaft stays at x = -28, so a short lead road runs from its door into a round hub
 * plaza. The `software` wing road (north, z < 0) and the `ai` wing road (south, z > 0) leave the hub
 * and run east; each turns `tail` past its last pod into the east plaza, so the floor is one loop
 * without dead ends or empty road ends. Where the wing roads fork stands the wing directory wall: two
 * panels facing the arrival camera. Hero and featured pods dock on both sides of their wing road in
 * site order (`comparePods`: gallery pods nearest the hub), one `slot` each, so both wings stay mirror
 * images whatever their tiers; each pod has a forecourt and a spur to its door, at least 6 u apart.
 * Listed pods stay on the directory. L3 paints no road chevrons (`RoadNetwork.chevrons`).
 * Pure module (no React or three): Vitest runs it in node.
 */
export const LABS = {
  door: { x: -24, z: 0 } as Vec2,
  approach: { x: -21, z: 0 } as Vec2,
  slabMinX: -24,
  accent: "#a78bfa",
  road: ROAD.minWidth,
  hub: { x: -4, z: 0, size: 26 },
  /** |z| of the wing roads. */
  wingZ: 24,
  /** x where the wing roads turn east after leaving the hub. */
  wingStartX: 10,
  /** First pod edge on the outer and inner side of each wing road (inner pods sit between the roads). */
  outerStart: 14,
  /** Half a pitch after the outer row, so the rows alternate and the first inner pod stays 6 u clear of the directory wall. */
  innerStart: 24,
  /** Clear floor between two pods on the same side of a road (at least 6 u). */
  gap: 7,
  /** Road edge to pod front: the forecourt. */
  forecourt: 3,
  hero: { w: 12, d: 9 },
  featured: { w: 8, d: 7 },
  /** Length of row each docked pod reserves (the hero width): slot i sits at the same x in both wings. */
  slot: 12,
  /** Pods docked per wing; the rest go to the wing directory. */
  maxPerWing: 12,
  /** Pod front wall to door pad center (the rover fits on the pad). */
  padInset: 1.1,
  spurWidth: 4,
  /** Road past the far edge of a wing's last pod before it turns into the east plaza: half the road plus a forecourt. */
  tail: 7,
  /** Diameter of the east plaza where the wing roads meet. */
  east: 18,
  /**
   * Wing directory wall where the wing roads fork: two touching double-sided panels (software north),
   * thin along x, their west faces toward the arrival camera. `z` is each panel's |z| center, `d` its width along z.
   */
  board: { x: 17, z: 3.75, w: 0.6, d: 7.5, h: 9.5 },
  /** Distance from a panel's west face to the stop in front of it (the rover then hides none of the list). */
  boardStop: 3,
  /** Camera zoom at a board stop: the whole panel fits under the HUD top bar. */
  boardZoom: 0.9,
  /** Entries a board shows in large type; the full list opens in the palette. */
  boardEntries: 5,
  /** Deep links (and the roll after an elevator ride) park here: on the hub's east rim facing the wall, beyond the hint radius of both board stops. */
  overview: { x: 8.5, z: 0 } as Vec2,
  /** Overview camera zoom: both wall panels whole in the middle of the frame, the camera still east of the shaft. */
  overviewZoom: 1.3,
  margin: 6,
  /** Hologram stage disc inside hero pods (6 u diameter). */
  stageRadius: 3,
  wallHeight: 2.6,
} as const;

/** -1 = north (`software` wing), +1 = south (`ai` wing); display names come from messages (`common.wing`). */
export const WING_SIDE: Record<Wing, -1 | 1> = { software: -1, ai: 1 };
export const WING_TINT: Record<Wing, string> = { software: "#22d3ee", ai: "#a78bfa" };

export interface PlacedPod {
  pod: LabPod;
  room: RoomId;
  rect: Rect;
  center: Vec2;
  /** Center of the door trigger, between the pod front and its wing road. */
  door: Vec2;
  /** Direction (along z) the pod front faces: toward its wing road. */
  facing: -1 | 1;
  /** Outer (away from the other wing) or inner (between the two wing roads). */
  row: "outer" | "inner";
  width: number;
  depth: number;
  /** Floor between the road edge and the pod front. */
  forecourt: Rect;
}

/** Half depth (along z) of the camera zone around each pod's door pad. */
const VIEW_ZONE_DEPTH = 2;
/** Follow camera yaw that puts the camera west of the rover, looking east along the floor. */
const LOOK_EAST = (-3 * Math.PI) / 4;

export interface DirectoryBoard extends Rect {
  center: Vec2;
  /** Where the rover stops to read the panel (`directoryStop`): in front of its west face. */
  stop: Vec2;
}

export interface LabsLayout {
  floor: FloorLayout;
  placed: PlacedPod[];
  /** Pods that only appear on the wing directory (listed tier, or overflow beyond `maxPerWing`). */
  directory: Record<Wing, LabPod[]>;
  boards: Record<Wing, DirectoryBoard>;
  network: RoadNetwork;
  hub: Plaza;
  east: Plaza;
  /** Where each wing road leaves the hub, its heading, and where the floating wing sign stands (5 u further along the road). */
  signs: Record<Wing, { at: Vec2; heading: Vec2; float: Vec2 }>;
  /** Packet lanes: the data spine between the inner rows and a branch into each inner pod. */
  lanes: [number, number][][];
}

const rect = (c: Vec2, w: number, d: number): Rect => ({ minX: c.x - w / 2, maxX: c.x + w / 2, minZ: c.z - d / 2, maxZ: c.z + d / 2 });
const bare = ({ minX, maxX, minZ, maxZ }: Rect): Rect => ({ minX, maxX, minZ, maxZ });

export function roomOf(pod: Pick<LabPod, "slug">): RoomId {
  return `L3:${pod.slug}`;
}

/** A panel of the wing directory wall where the wing roads fork (fixed: it does not depend on the pods). */
export function directoryBoard(wing: Wing): DirectoryBoard {
  const { board } = LABS;
  const center = { x: board.x, z: WING_SIDE[wing] * board.z };
  return { ...rect(center, board.w, board.d), center, stop: { x: board.x - board.w / 2 - LABS.boardStop, z: center.z } };
}

/** Where `drive` stops for a listed item, and the tour's "More projects here" stop: in front of its wing's panel. */
export function directoryStop(wing: Wing): Vec2 {
  return directoryBoard(wing).stop;
}

/** Width and height of a hologram board for an architecture with `layers` columns and `rows` rows. */
export const BOARD = { colGap: 2.5, rowGap: 1.25, nodeW: 2, nodeH: 0.85, maxWidth: 9, y: 3.4 } as const;

export function boardSize(layers: number, rows: number): { width: number; height: number; scale: number } {
  const width = (Math.max(1, layers) - 1) * BOARD.colGap + BOARD.nodeW;
  const height = (Math.max(1, rows) - 1) * BOARD.rowGap + BOARD.nodeH;
  const scale = Math.min(1, BOARD.maxWidth / width);
  return { width: width * scale, height: height * scale, scale };
}

/** Hero and featured pods in site order (`comparePods`: gallery first): the docking order along a wing road and the tour order. */
export function tourOrder(pods: readonly LabPod[]): LabPod[] {
  return pods.filter((p) => p.tier !== "listed").sort(comparePods);
}

/**
 * Places pods from data (`ExperienceData.labs.pods`). Per wing, hero and featured pods dock in
 * `tourOrder` along the wing road from the hub eastward, one slot each, alternating the outer and the
 * inner side; each wing road turns `tail` past its own last pod and both meet at one east plaza.
 */
export function buildLabsLayout(pods: readonly LabPod[]): LabsLayout {
  const L = LABS;
  const half = L.road / 2;
  const hubC: Vec2 = { x: L.hub.x, z: L.hub.z };
  const hub: Plaza = { id: "hub", center: hubC, w: L.hub.size, d: L.hub.size, round: true };
  const placed: PlacedPod[] = [];
  const directory: Record<Wing, LabPod[]> = { software: [], ai: [] };
  // Far edge (max x) of each wing's last docked pod.
  const lastEdge: Record<Wing, number> = { software: -Infinity, ai: -Infinity };

  for (const wing of ["software", "ai"] as const) {
    const zr = WING_SIDE[wing] * L.wingZ;
    const inWing = pods.filter((p) => p.wing === wing);
    const tour = tourOrder(inWing);
    const docked = tour.slice(0, L.maxPerWing);
    directory[wing] = [...tour.slice(L.maxPerWing), ...inWing.filter((p) => p.tier === "listed").sort(comparePods)];
    const cursor = { outer: L.outerStart as number, inner: L.innerStart as number };
    docked.forEach((pod, i) => {
      const row = i % 2 === 0 ? "outer" : "inner";
      // Side of the road the pod sits on: away from the other wing (outer) or toward it (inner).
      const side = (row === "outer" ? WING_SIDE[wing] : -WING_SIDE[wing]) as -1 | 1;
      const { w, d } = pod.tier === "hero" ? L.hero : L.featured;
      const x = cursor[row] + L.slot / 2;
      cursor[row] += L.slot + L.gap;
      const front = zr + side * (half + L.forecourt);
      const center = { x, z: front + (side * d) / 2 };
      const edge = zr + side * half;
      placed.push({
        pod,
        room: roomOf(pod),
        rect: rect(center, w, d),
        center,
        door: { x, z: front - side * L.padInset },
        facing: -side as -1 | 1,
        row,
        width: w,
        depth: d,
        forecourt: { minX: x - w / 2, maxX: x + w / 2, minZ: Math.min(edge, front), maxZ: Math.max(edge, front) },
      });
      lastEdge[wing] = Math.max(lastEdge[wing], x + w / 2);
    });
  }

  // Each wing road turns `tail` past its own last pod; the east plaza sits on the later turn, so a
  // shorter wing cuts across to it instead of running on empty. An empty wing still reaches a plaza
  // and a margin past the point where the wing roads start.
  const turnX = (wing: Wing) => Math.max(L.wingStartX + L.east + L.margin, lastEdge[wing] + L.tail);
  const loopEnd: Vec2 = { x: Math.max(turnX("software"), turnX("ai")), z: 0 };
  const wingRoad = (wing: Wing): Road => {
    const z = WING_SIDE[wing] * L.wingZ;
    return { id: wing, points: [hubC, { x: L.wingStartX, z }, { x: turnX(wing), z }, loopEnd], width: L.road };
  };
  const lead: Road = { id: "lead", points: [L.approach, hubC], width: L.road };
  // A short stub from the hub toward the directory wall, ending half a road width before it: the
  // arrival spot and both panel stops lie on it, so a click on a panel drives straight there instead
  // of out onto a wing road and back (roadRoute only shortcuts hops under ROAD.shortcut).
  const stub: Road = { id: "directory", points: [hubC, { x: L.board.x - L.board.w / 2 - half, z: 0 }], width: L.road };
  const east: Plaza = { id: "east", center: loopEnd, w: L.east, d: L.east, round: true };
  const spurs: Spur[] = placed.map((p) => ({
    room: p.room,
    from: { x: p.door.x, z: WING_SIDE[p.pod.wing] * L.wingZ },
    to: p.door,
    width: L.spurWidth,
    color: WING_TINT[p.pod.wing],
  }));
  // No floor arrows on L3 (owner request 2026-10-13): the wing roads, signs and directory guide the way.
  const network: RoadNetwork = { roads: [lead, stub, wingRoad("software"), wingRoad("ai")], plazas: [hub, east], spurs, chevrons: false };

  const boards = { software: directoryBoard("software"), ai: directoryBoard("ai") };
  const sign = (wing: Wing) => {
    const to = { x: L.wingStartX, z: WING_SIDE[wing] * L.wingZ };
    const len = Math.hypot(to.x - hubC.x, to.z - hubC.z);
    const heading = { x: (to.x - hubC.x) / len, z: (to.z - hubC.z) / len };
    // Just past the hub rim, on the wing road; the floating sign stands 5 u further along it.
    const r = L.hub.size / 2 + 3;
    const at = { x: hubC.x + heading.x * r, z: hubC.z + heading.z * r };
    return { at, heading, float: { x: at.x + heading.x * 5, z: at.z + heading.z * 5 } };
  };

  const doors: DoorTrigger[] = placed.map((p) => ({ room: p.room, at: p.door, facing: { x: 0, z: -p.facing } }));
  const viewZones: ViewZone[] = [
    // Board stops first (they lie just east of the overview zone): the camera stands west of the rover
    // and looks east at the panel, zoomed so the whole panel fits under the HUD top bar.
    ...(["software", "ai"] as const).map((wing) => {
      const b = boards[wing];
      return { id: `L3:directory:${wing}`, area: { minX: b.stop.x - 1, maxX: b.minX, minZ: b.minZ, maxZ: b.maxZ }, yaw: LOOK_EAST, zoom: L.boardZoom };
    }),
    // The arrival spot on the hub's east rim: the camera sits west of the rover, zoomed out, and looks
    // east, so the directory wall fills the middle of the frame with both wing roads beside it and the
    // shaft behind the camera. The zone lies between the wing roads, so driving them never triggers it.
    { id: "L3:overview", area: { minX: L.overview.x - 4, maxX: L.overview.x + 1, minZ: -4, maxZ: 4 }, yaw: LOOK_EAST, zoom: L.overviewZoom },
    // At a door the camera looks at the pod front at 45 degrees: from the south-east (the default) for
    // pods facing south, from the north-east for pods facing north, so a pod never sits between the
    // camera and the rover.
    ...placed.map((p) => ({
      id: p.room,
      area: { minX: p.rect.minX, maxX: p.rect.maxX, minZ: p.door.z - VIEW_ZONE_DEPTH, maxZ: p.door.z + VIEW_ZONE_DEPTH },
      yaw: p.facing > 0 ? 0 : Math.PI / 2,
    })),
  ];
  const obstacles: Rect[] = [...placed.map((p) => bare(p.rect)), bare(boards.software), bare(boards.ai)];
  const extentZ = Math.max(L.wingZ + half, ...placed.map((p) => Math.max(Math.abs(p.rect.minZ), Math.abs(p.rect.maxZ))));
  const bounds: Rect = { minX: L.slabMinX, maxX: loopEnd.x + L.east / 2 + L.margin, minZ: -(extentZ + L.margin), maxZ: extentZ + L.margin };

  // Data spine between the inner rows (just east of the directory wall to the east plaza rim) with a branch into each inner pod's back wall.
  const spineFrom = Math.max(hubC.x + L.hub.size / 2, L.board.x + L.board.w / 2) + 1;
  const spineTo = loopEnd.x - L.east / 2 - 1;
  const lanes: [number, number][][] =
    spineTo > spineFrom
      ? [
          [
            [spineFrom, 0],
            [spineTo, 0],
          ],
        ]
      : [];
  for (const p of placed) {
    if (p.row !== "inner") continue;
    const back = p.facing > 0 ? p.rect.minZ : p.rect.maxZ;
    lanes.push([
      [p.center.x, 0],
      [p.center.x, back],
    ]);
  }

  return {
    floor: {
      id: "L3",
      bounds,
      door: L.door,
      approach: L.approach,
      obstacles,
      spawn: L.overview,
      arrival: L.overview,
      accent: L.accent,
      doors,
      road: network,
      viewZones,
    },
    placed,
    directory,
    boards,
    network,
    hub,
    east,
    signs: { software: sign("software"), ai: sign("ai") },
    lanes,
  };
}
