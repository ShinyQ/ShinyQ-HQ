import type { RoomId, Wing } from "@/content/schema";
import { comparePods } from "@/content/selectors";
import { ROAD, type Plaza, type Road, type RoadNetwork, type Spur } from "../../nav/road";
import type { ViewZone } from "../../camera/orbit";
import type { DoorTrigger, FloorLayout, LabPod, Rect, Vec2 } from "../../types";
import { reactorRect, REACTOR, ringEntry, ringPoints } from "./reactor";
import { OPS, type OpsPlacement } from "./ops";
import { OPS_ROOM } from "./opsHash";
import { REACTOR_ROOM, reactorStop } from "./techReactor";

/**
 * L3 Project Roads (walkable floors plan, part 2; consolidated in round 5, owner request 2026-10-13).
 * The global elevator shaft stays at x = -28, so a short lead road runs from its door into a round hub
 * plaza. The `software` wing road (north, z < 0) and the `ai` wing road (south, z > 0) leave the hub
 * and run east; each turns `tail` past its last pod into the east plaza and ends on the ring road
 * around the reactor core there, so the floor is one loop without dead ends or empty road ends. Where the wing roads fork stands the wing directory wall: two
 * panels facing the arrival camera. Hero and featured pods dock on both sides of their wing road in
 * site order (`comparePods`: gallery pods nearest the hub), one `slot` each, so both wings stay mirror
 * images whatever their tiers; each pod has a forecourt and a spur to its door, at least 6 u apart.
 * Listed pods stay on the directory. L3 paints no road chevrons (`RoadNetwork.chevrons`).
 * The `data` wing (Data and ML, owner request 2026-10-14) is an annex east of the Tech Reactor: its road
 * leaves the ring road's east point and runs east along z = 0, its pods dock alternating north and south
 * past the old slab end (clear of the Express Return pad and the inner pocket), and it ends in a round
 * data plaza with the data directory panel beyond it. Without data pods there is no annex, and the hub
 * wings, the reactor and every hub view zone are the same with or without it.
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
  /** Diameter of the east plaza where the wing roads meet: room for the ring road around the reactor core. */
  east: 22,
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
  /**
   * Data and ML annex: pods dock from `margin` past the east plaza rim (the old slab end), at most
   * `maxPods` (the rest go to its directory); the road ends in a round plaza `plaza` u across, with the
   * data directory panel `boardGap` past its rim.
   */
  data: { maxPods: 8, plaza: 18, boardGap: 1 },
} as const;

/** The two wings whose roads leave the hub (the `data` wing is the annex east of the reactor). */
export const HUB_WINGS = ["software", "ai"] as const;
export type HubWing = (typeof HUB_WINGS)[number];
/** Every wing in tour order: the hub wings, then the Data and ML annex. */
export const LABS_WINGS: readonly Wing[] = ["software", "ai", "data"];
/** -1 = north (`software` wing), +1 = south (`ai` wing); display names come from messages (`common.wing`). */
export const WING_SIDE: Record<HubWing, -1 | 1> = { software: -1, ai: 1 };
/** Wing tints; Data and ML takes the Tech Reactor's Data ring amber. */
export const WING_TINT: Record<Wing, string> = { software: "#22d3ee", ai: "#a78bfa", data: "#fbbf24" };

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
  /** z of the road the pod docks on (its wing road, or 0 on the data road). */
  roadZ: number;
}

/** Half depth (along z) of the camera zone around each pod's door pad. */
const VIEW_ZONE_DEPTH = 2;
/** Follow camera yaw that puts the camera west of the rover, looking east along the floor. */
const LOOK_EAST = (-3 * Math.PI) / 4;
/** Follow camera yaw that puts the camera east of the rover, looking west along the floor. */
const LOOK_WEST = Math.PI / 4;
/** Camera zoom at the Tech Reactor stop: the core in front, both wing roads beside it. */
const REACTOR_ZOOM = 1.3;

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
  /** Directory panels: both hub wings at the fork, plus the data panel past the data plaza when the annex exists. */
  boards: Record<HubWing, DirectoryBoard> & { data?: DirectoryBoard };
  network: RoadNetwork;
  hub: Plaza;
  east: Plaza;
  /** The round plaza at the end of the data road (null without the annex). */
  dataPlaza: Plaza | null;
  /** Where each wing road leaves the hub (or the reactor ring, for data), its heading, and where the floating wing sign stands. */
  signs: Record<HubWing, WingSign> & { data?: WingSign };
  /** Packet lanes: the data spine between the inner rows (into the reactor core) and a branch into each inner pod. */
  lanes: [number, number][][];
  /** The reactor core in the middle of the east plaza (`reactor.ts`): its footprint is an obstacle the ring road drives around. */
  reactor: { center: Vec2; rect: Rect };
  /** The Ops Control Room (`ops.ts`): docked in the AI wing's inner row after its last inner pod, facing the wing road. */
  ops: OpsPlacement;
}

export interface WingSign {
  at: Vec2;
  heading: Vec2;
  float: Vec2;
}

const rect = (c: Vec2, w: number, d: number): Rect => ({ minX: c.x - w / 2, maxX: c.x + w / 2, minZ: c.z - d / 2, maxZ: c.z + d / 2 });
const bare = ({ minX, maxX, minZ, maxZ }: Rect): Rect => ({ minX, maxX, minZ, maxZ });

export function roomOf(pod: Pick<LabPod, "slug">): RoomId {
  return `L3:${pod.slug}`;
}

/** A panel standing at `center`, thin along x, its west face toward the stop `LABS.boardStop` in front of it. */
function panelAt(center: Vec2): DirectoryBoard {
  const { board } = LABS;
  return { ...rect(center, board.w, board.d), center, stop: { x: center.x - board.w / 2 - LABS.boardStop, z: center.z } };
}

/** A panel of the wing directory wall where the hub wing roads fork (fixed: it does not depend on the pods). */
export function directoryBoard(wing: HubWing): DirectoryBoard {
  return panelAt({ x: LABS.board.x, z: WING_SIDE[wing] * LABS.board.z });
}

/**
 * Where `drive` stops for a listed item, and the tour's "More projects here" stop: in front of its wing's
 * panel. The data panel moves with the floor, so it needs the layout (null when the floor has no annex).
 */
export function directoryStop(wing: HubWing, layout?: LabsLayout): Vec2;
export function directoryStop(wing: Wing, layout: LabsLayout): Vec2 | null;
export function directoryStop(wing: Wing, layout?: LabsLayout): Vec2 | null {
  if (wing === "data") return layout?.boards.data?.stop ?? null;
  return (layout?.boards[wing] ?? directoryBoard(wing)).stop;
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
 * Places pods from data (`ExperienceData.labs.pods`). Per hub wing, hero and featured pods dock in
 * `tourOrder` along the wing road from the hub eastward, one slot each, alternating the outer and the
 * inner side; each wing road turns `tail` past its own last pod and both meet at one east plaza. Data
 * pods dock along the data road east of the reactor (see the module comment).
 */
export function buildLabsLayout(pods: readonly LabPod[]): LabsLayout {
  const L = LABS;
  const half = L.road / 2;
  const hubC: Vec2 = { x: L.hub.x, z: L.hub.z };
  const hub: Plaza = { id: "hub", center: hubC, w: L.hub.size, d: L.hub.size, round: true };
  const placed: PlacedPod[] = [];
  const directory: Record<Wing, LabPod[]> = { software: [], ai: [], data: [] };
  // Far edge (max x) of each wing's last docked pod.
  const lastEdge: Record<HubWing, number> = { software: -Infinity, ai: -Infinity };

  /** Docks `pod` on `side` of a road at z = `roadZ`, its slot starting at `slotStart`. */
  const dock = (pod: LabPod, roadZ: number, side: -1 | 1, slotStart: number, row: PlacedPod["row"]): PlacedPod => {
    const { w, d } = pod.tier === "hero" ? L.hero : L.featured;
    const x = slotStart + L.slot / 2;
    const front = roadZ + side * (half + L.forecourt);
    const center = { x, z: front + (side * d) / 2 };
    const edge = roadZ + side * half;
    return {
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
      roadZ,
    };
  };

  for (const wing of HUB_WINGS) {
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
      const p = dock(pod, zr, side, cursor[row], row);
      cursor[row] += L.slot + L.gap;
      placed.push(p);
      lastEdge[wing] = Math.max(lastEdge[wing], p.rect.maxX);
    });
  }

  // Each wing road turns `tail` past its own last pod; the east plaza sits on the later turn, so a
  // shorter wing cuts across to it instead of running on empty. An empty wing still reaches a plaza
  // and a margin past the point where the wing roads start.
  // The Ops Control Room docks in the AI wing's inner row, `OPS.gap` past its last inner pod (or where the
  // inner row starts); the AI road turns at least half a road width past it, so the room always fits.
  const aiInner = placed.filter((p) => p.pod.wing === "ai" && p.row === "inner").map((p) => p.rect.maxX);
  const opsMinX = aiInner.length ? Math.max(...aiInner) + OPS.gap : L.innerStart;
  const minTurn: Record<HubWing, number> = { software: -Infinity, ai: opsMinX + OPS.w + half };
  const turnX = (wing: HubWing) => Math.max(L.wingStartX + L.east + L.margin, lastEdge[wing] + L.tail, minTurn[wing]);
  const loopEnd: Vec2 = { x: Math.max(turnX("software"), turnX("ai")), z: 0 };
  // The wing roads end on the ring road around the reactor core (spectacle round), never at its center.
  const wingRoad = (wing: HubWing): Road => {
    const z = WING_SIDE[wing] * L.wingZ;
    const turn = { x: turnX(wing), z };
    return { id: wing, points: [hubC, { x: L.wingStartX, z }, turn, ringEntry(loopEnd, turn)], width: L.road };
  };
  const ring: Road = { id: "east-ring", points: ringPoints(loopEnd), width: L.road, closed: true };
  const core = reactorRect(loopEnd);
  const lead: Road = { id: "lead", points: [L.approach, hubC], width: L.road };
  // A short stub from the hub toward the directory wall, ending half a road width before it: the
  // arrival spot and both panel stops lie on it, so a click on a panel drives straight there instead
  // of out onto a wing road and back (roadRoute only shortcuts hops under ROAD.shortcut).
  const stub: Road = { id: "directory", points: [hubC, { x: L.board.x - L.board.w / 2 - half, z: 0 }], width: L.road };
  const east: Plaza = { id: "east", center: loopEnd, w: L.east, d: L.east, round: true, core: REACTOR.half };
  const hubEndX = loopEnd.x + L.east / 2 + L.margin;

  // Data and ML annex: the data road leaves the ring road's east point (the reactor stop).
  const dataPods = pods.filter((p) => p.wing === "data");
  let dataRoad: Road | null = null;
  let dataPlaza: Plaza | null = null;
  let dataBoard: DirectoryBoard | undefined;
  let dataSign: WingSign | undefined;
  if (dataPods.length > 0) {
    const tour = tourOrder(dataPods);
    const docked = tour.slice(0, L.data.maxPods);
    directory.data = [...tour.slice(L.data.maxPods), ...dataPods.filter((p) => p.tier === "listed").sort(comparePods)];
    // North row from the old slab end, south row half a pitch later (the hub wings' outer and inner offsets).
    const cursor = { outer: hubEndX, inner: hubEndX + L.innerStart - L.outerStart };
    let edge = hubEndX;
    docked.forEach((pod, i) => {
      const row = i % 2 === 0 ? "outer" : "inner";
      const p = dock(pod, 0, row === "outer" ? -1 : 1, cursor[row], row);
      cursor[row] += L.slot + L.gap;
      placed.push(p);
      edge = Math.max(edge, p.rect.maxX);
    });
    const start = reactorStop(loopEnd);
    const plazaC: Vec2 = { x: edge + L.tail + L.data.plaza / 2, z: 0 };
    dataPlaza = { id: "data", center: plazaC, w: L.data.plaza, d: L.data.plaza, round: true };
    dataRoad = { id: "data", points: [start, plazaC], width: L.road };
    dataBoard = panelAt({ x: plazaC.x + L.data.plaza / 2 + L.data.boardGap + L.board.w / 2, z: 0 });
    // The floating wing sign stands over the data road past the east plaza, before the first data pod.
    const at = { x: loopEnd.x + L.east / 2, z: 0 };
    dataSign = { at, heading: { x: 1, z: 0 }, float: { x: hubEndX - 2, z: 0 } };
  }

  const ops = opsPlacement(opsMinX);
  const spurs: Spur[] = [
    ...placed.map((p) => ({
      room: p.room,
      from: { x: p.door.x, z: p.roadZ },
      to: p.door,
      width: L.spurWidth,
      color: WING_TINT[p.pod.wing],
    })),
    { room: OPS_ROOM, from: { x: ops.door.x, z: WING_SIDE.ai * L.wingZ }, to: ops.door, width: L.spurWidth, color: OPS_TINT },
  ];
  // No floor arrows on L3 (owner request 2026-10-13): the wing roads, signs and directory guide the way.
  const network: RoadNetwork = {
    roads: [lead, stub, wingRoad("software"), wingRoad("ai"), ring, ...(dataRoad ? [dataRoad] : [])],
    plazas: [hub, east, ...(dataPlaza ? [dataPlaza] : [])],
    spurs,
    chevrons: false,
  };

  const boards: LabsLayout["boards"] = { software: directoryBoard("software"), ai: directoryBoard("ai"), ...(dataBoard ? { data: dataBoard } : {}) };
  const sign = (wing: HubWing): WingSign => {
    const to = { x: L.wingStartX, z: WING_SIDE[wing] * L.wingZ };
    const len = Math.hypot(to.x - hubC.x, to.z - hubC.z);
    const heading = { x: (to.x - hubC.x) / len, z: (to.z - hubC.z) / len };
    // Just past the hub rim, on the wing road; the floating sign stands 5 u further along it.
    const r = L.hub.size / 2 + 3;
    const at = { x: hubC.x + heading.x * r, z: hubC.z + heading.z * r };
    return { at, heading, float: { x: at.x + heading.x * 5, z: at.z + heading.z * 5 } };
  };

  const doors: DoorTrigger[] = [
    ...placed.map((p) => ({ room: p.room, at: p.door, facing: { x: 0, z: -p.facing } })),
    { room: OPS_ROOM, at: ops.door, facing: { x: 0, z: ops.facing } },
  ];
  const boardZone = (wing: Wing, b: DirectoryBoard): ViewZone => ({
    id: `L3:directory:${wing}`,
    area: { minX: b.stop.x - 1, maxX: b.minX, minZ: b.minZ, maxZ: b.maxZ },
    yaw: LOOK_EAST,
    zoom: L.boardZoom,
  });
  const viewZones: ViewZone[] = [
    // Board stops first (they lie just east of the overview zone): the camera stands west of the rover
    // and looks east at the panel, zoomed so the whole panel fits under the HUD top bar.
    ...HUB_WINGS.map((wing) => boardZone(wing, boards[wing])),
    // The arrival spot on the hub's east rim: the camera sits west of the rover, zoomed out, and looks
    // east, so the directory wall fills the middle of the frame with both wing roads beside it and the
    // shaft behind the camera. The zone lies between the wing roads, so driving them never triggers it.
    { id: "L3:overview", area: { minX: L.overview.x - 4, maxX: L.overview.x + 1, minZ: -4, maxZ: 4 }, yaw: LOOK_EAST, zoom: L.overviewZoom },
    // Tech Reactor stop on the ring road's east point: the camera stands east of the rover and looks west
    // over the core, so the lit pods and roads of both wings fill the frame beside it.
    { id: REACTOR_ROOM, area: { minX: reactorStop(loopEnd).x - 2, maxX: reactorStop(loopEnd).x + 2, minZ: -2, maxZ: 2 }, yaw: LOOK_WEST, zoom: REACTOR_ZOOM },
    // At a door the camera looks at the pod front at 45 degrees: from the south-east (the default) for
    // pods facing south, from the north-east for pods facing north, so a pod never sits between the
    // camera and the rover.
    ...placed.map((p) => ({
      id: p.room,
      area: { minX: p.rect.minX, maxX: p.rect.maxX, minZ: p.door.z - VIEW_ZONE_DEPTH, maxZ: p.door.z + VIEW_ZONE_DEPTH },
      yaw: p.facing > 0 ? 0 : Math.PI / 2,
    })),
    // The Ops Control Room faces the AI wing road like the inner pods: the same 45 degree look at its screens.
    // Zoomed in a little, so the screens and the live panel read.
    { id: OPS_ROOM, area: { minX: ops.rect.minX, maxX: ops.rect.maxX, minZ: ops.door.z - VIEW_ZONE_DEPTH, maxZ: ops.door.z + VIEW_ZONE_DEPTH }, yaw: 0, zoom: OPS_ZOOM },
    ...(dataBoard ? [boardZone("data", dataBoard)] : []),
  ];
  const panels = [boards.software, boards.ai, ...(dataBoard ? [dataBoard] : [])];
  const obstacles: Rect[] = [...placed.map((p) => bare(p.rect)), ...panels.map(bare), core, ops.rect];
  const extentZ = Math.max(L.wingZ + half, ...placed.map((p) => Math.max(Math.abs(p.rect.minZ), Math.abs(p.rect.maxZ))));
  const bounds: Rect = { minX: L.slabMinX, maxX: dataBoard ? dataBoard.maxX + L.margin : hubEndX, minZ: -(extentZ + L.margin), maxZ: extentZ + L.margin };

  // Data spine between the inner rows (just east of the directory wall into the reactor core's west face) with a branch into each inner pod's back wall.
  const spineFrom = Math.max(hubC.x + L.hub.size / 2, L.board.x + L.board.w / 2) + 1;
  const spineTo = core.minX;
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
    // Data pods sit on the data road itself (z = 0): no lane would reach them without crossing it.
    if (p.row !== "inner" || p.pod.wing === "data") continue;
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
      // The directory panels (9.5 u), the reactor core and the Ops Control Room block a low camera up to their own height.
      tall: [...[boards.software, boards.ai].map((b) => ({ ...bare(b), h: L.board.h })), { ...core, h: REACTOR.height }, { ...ops.rect, h: OPS.h }, ...(dataBoard ? [{ ...bare(dataBoard), h: L.board.h }] : [])],
      spawn: L.overview,
      arrival: L.overview,
      accent: L.accent,
      doors,
      road: network,
      viewZones,
      // Fast return (F1): south-east of the reactor core, outside the ring road's driving width.
      returnPad: { x: loopEnd.x + 10, z: 9 },
      stops: { [REACTOR_ROOM]: reactorStop(loopEnd) },
      directoryStops: { software: boards.software.stop, ai: boards.ai.stop, ...(dataBoard ? { data: dataBoard.stop } : {}) },
    },
    placed,
    directory,
    boards,
    network,
    hub,
    east,
    dataPlaza,
    signs: { software: sign("software"), ai: sign("ai"), ...(dataSign ? { data: dataSign } : {}) },
    lanes,
    reactor: { center: loopEnd, rect: core },
    ops,
  };
}

/** Camera zoom in the Ops Control Room's door zone. */
const OPS_ZOOM = 0.85;

/** Road tint of the Ops Control Room spur (monitoring green). */
export const OPS_TINT = "#34d399";

/** The Ops Control Room on the AI side: inner row, `OPS.w` wide from `minX`, front on the forecourt line like the inner pods. */
function opsPlacement(minX: number): OpsPlacement {
  const L = LABS;
  // Inner side of the AI wing road: toward the software wing (z decreases).
  const side = -WING_SIDE.ai as -1 | 1;
  const front = WING_SIDE.ai * L.wingZ + side * (L.road / 2 + L.forecourt);
  const back = front + side * OPS.d;
  const center = { x: minX + OPS.w / 2, z: (front + back) / 2 };
  return {
    rect: { minX, maxX: minX + OPS.w, minZ: Math.min(front, back), maxZ: Math.max(front, back) },
    center,
    door: { x: center.x, z: front - side * L.padInset },
    facing: side,
  };
}
