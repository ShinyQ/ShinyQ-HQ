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
 * L3 Project Roads (walkable floors plan, part 2; consolidated in round 5, owner request 2026-10-13; three
 * paths in Round 7 G). The global elevator shaft stays at x = -28, so a short lead road runs from its door
 * into a round hub plaza. Three roads leave the hub: the Data and ML spine runs straight east along z = 0
 * to the ring road's west point around the reactor core; the `software` wing road (north, z < 0) and the
 * `ai` wing road (south, z > 0) leave the hub rim `mouthAngle` (30 degrees) off the spine, run out to
 * |z| = `wingZ`, turn east, turn again `tail` past their last pod and end on the ring road, so the floor
 * is one loop without dead ends or empty road ends. Where the three roads fork stands the directory wall:
 * three raised boards on four posts, west faces toward the arrival camera, Product north, Data and ML in
 * the middle as a gate the spine road passes under, AI south. Hero and featured pods dock on both sides
 * of their wing road in site order (`comparePods`: gallery pods nearest the hub), one `slot` each, so
 * both wings stay mirror images whatever their tiers; spine pods dock alternating north and south of the
 * spine. Each pod has a forecourt and a spur to its door, at least 6 u apart. `wingZ` grows past its
 * minimum just enough for the spine pods, the row gap and the deepest inner wing pod. Listed pods stay
 * on the directory. L3 paints no road chevrons (`RoadNetwork.chevrons`).
 * Pure module (no React or three): Vitest runs it in node.
 */
export const LABS = {
  door: { x: -24, z: 0 } as Vec2,
  approach: { x: -21, z: 0 } as Vec2,
  slabMinX: -24,
  accent: "#a78bfa",
  road: ROAD.minWidth,
  hub: { x: -4, z: 0, size: 26 },
  /** Minimum |z| of the wing roads; `buildLabsLayout` widens it (`LabsLayout.wingZ`) so the Data and ML spine fits between the inner rows. */
  wingZ: 24,
  /** Clear floor between the backs of the spine pods and the inner wing pods (the packet lanes run in it). */
  rowGap: 6,
  /** Each wing road leaves the hub rim this far (rad) off the spine, so all three road mouths sit in the arrival view. */
  mouthAngle: Math.PI / 6,
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
   * Directory wall where the three roads fork (Round 7 G): a row of raised boards on four posts, thin
   * along x, west faces toward the arrival camera. Product north, Data and ML in the middle as a gate
   * the spine road and the rover (2.8 u) pass under, AI south. `gate` and `d` are the middle and outer
   * board widths along z; boards run from `base` to `h`; posts are `post` deep along z.
   */
  board: { x: 17, w: 0.6, h: 11.2, base: 3.2, d: 6.6, gate: 9, post: 0.4 },
  /** Distance from a panel's west face to the stop in front of it (the rover then hides none of the list). */
  boardStop: 3,
  /** Camera zoom at a board stop: the whole panel fits under the HUD top bar. */
  boardZoom: 0.9,
  /** Entries a board shows in large type; the full list opens in the palette. */
  boardEntries: 5,
  /** Deep links (and the roll after an elevator ride) park here: on the hub's east rim facing the wall, beyond the hint radius of every board stop. */
  overview: { x: 8.5, z: 0 } as Vec2,
  /** Overview camera zoom: the whole wall in the middle of the frame, the camera still east of the shaft. */
  overviewZoom: 1.3,
  /** Phones frame all three road mouths and the whole wall from the arrival spot. */
  overviewZoomPhone: 1.9,
  /** Wing signs float this far along their road past the mouth; the spine sign floats over the spine at `spineSignX`. */
  signAlong: 2,
  spineSignX: 12,
  margin: 6,
  /** Hologram stage disc inside hero pods (6 u diameter). */
  stageRadius: 3,
  wallHeight: 2.6,
  /** Data and ML spine: pods dock from `start` (north row; the south row half a pitch later), at most `maxPods`. */
  data: { maxPods: 8, start: 24 },
} as const;

/** The two wings beside the spine; the `data` wing is the spine itself. */
export const SIDE_WINGS = ["software", "ai"] as const;
export type SideWing = (typeof SIDE_WINGS)[number];
/** Every wing in tour order: Product, AI, then Data and ML. */
export const LABS_WINGS: readonly Wing[] = ["software", "ai", "data"];
/** -1 = north (`software` wing), +1 = south (`ai` wing); display names come from messages (`common.wing`). */
export const WING_SIDE: Record<SideWing, -1 | 1> = { software: -1, ai: 1 };
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
  /** z of the road the pod docks on (its wing road, or 0 on the spine). */
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
  /** The three boards of the directory wall at the fork, one per wing. */
  boards: Record<Wing, DirectoryBoard>;
  network: RoadNetwork;
  hub: Plaza;
  /** The round plaza around the reactor core where all three roads end on the ring road. */
  east: Plaza;
  /** Where each road leaves the hub rim, its heading, and where its floating sign stands (the spine sign over the spine, west of the wall). */
  signs: Record<Wing, WingSign>;
  /** Packet lanes: two packet spines between the spine pods and the inner wing rows, and a branch into each of their back walls. */
  lanes: [number, number][][];
  /** The reactor core in the middle of the east plaza (`reactor.ts`): its footprint is an obstacle the ring road drives around. */
  reactor: { center: Vec2; rect: Rect };
  /** The Ops Control Room (`ops.ts`): docked in the AI wing's inner row after its last inner pod, facing the wing road. */
  ops: OpsPlacement;
  /** |z| of the wing roads: wide enough for the spine pods, the row gap and the inner wing pods. */
  wingZ: number;
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

/** A board of the directory wall at the fork (fixed: it does not depend on the pods). */
export function directoryBoard(wing: Wing): DirectoryBoard {
  const { x, w, gate, d } = LABS.board;
  const [minZ, maxZ] = wing === "data" ? [-gate / 2, gate / 2] : WING_SIDE[wing] < 0 ? [-(gate / 2 + d), -gate / 2] : [gate / 2, gate / 2 + d];
  const center = { x, z: (minZ + maxZ) / 2 };
  return { minX: x - w / 2, maxX: x + w / 2, minZ, maxZ, center, stop: { x: x - w / 2 - LABS.boardStop, z: center.z } };
}

/** Where `drive` stops for a listed item, and the tour's "More projects here" stop: in front of its wing's board. */
export function directoryStop(wing: Wing): Vec2 {
  return directoryBoard(wing).stop;
}

/** The four posts that carry the wall (the floor obstacles): one at each outer end, two framing the spine road under the gate. */
export function wallPosts(): Rect[] {
  const { x, w, gate, d, post } = LABS.board;
  const at = (minZ: number, maxZ: number): Rect => ({ minX: x - w / 2, maxX: x + w / 2, minZ, maxZ });
  const g = gate / 2;
  const o = gate / 2 + d;
  return [at(-o, -o + post), at(-g, -g + post), at(g - post, g), at(o - post, o)];
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
 * Places pods from data (`ExperienceData.labs.pods`). Per side wing, hero and featured pods dock in
 * `tourOrder` along the wing road from the hub eastward, one slot each, alternating the outer and the
 * inner side; each wing road turns `tail` past its own last pod and all three roads meet at one east
 * plaza. Data pods dock alternating north and south of the spine (see the module comment).
 */
export function buildLabsLayout(pods: readonly LabPod[]): LabsLayout {
  const L = LABS;
  const half = L.road / 2;
  const hubC: Vec2 = { x: L.hub.x, z: L.hub.z };
  const hub: Plaza = { id: "hub", center: hubC, w: L.hub.size, d: L.hub.size, round: true };
  const placed: PlacedPod[] = [];
  const directory: Record<Wing, LabPod[]> = { software: [], ai: [], data: [] };
  // Docking lists first: the deepest spine and inner wing pods set how far apart the wing roads run.
  const docked: Record<Wing, LabPod[]> = { software: [], ai: [], data: [] };
  for (const wing of LABS_WINGS) {
    const inWing = pods.filter((p) => p.wing === wing);
    const tour = tourOrder(inWing);
    const cap = wing === "data" ? L.data.maxPods : L.maxPerWing;
    docked[wing] = tour.slice(0, cap);
    directory[wing] = [...tour.slice(cap), ...inWing.filter((p) => p.tier === "listed").sort(comparePods)];
  }
  const depthOf = (p: LabPod) => (p.tier === "hero" ? L.hero.d : L.featured.d);
  const spineDepth = Math.max(0, ...docked.data.map(depthOf));
  const innerDepth = Math.max(OPS.d, ...SIDE_WINGS.flatMap((w) => docked[w].filter((_, i) => i % 2 === 1).map(depthOf)));
  const wingZ = Math.max(L.wingZ, 2 * (half + L.forecourt) + spineDepth + L.rowGap + innerDepth);
  // Far edge (max x) of each wing's last docked pod.
  const lastEdge: Record<SideWing, number> = { software: -Infinity, ai: -Infinity };

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

  for (const wing of SIDE_WINGS) {
    const zr = WING_SIDE[wing] * wingZ;
    const cursor = { outer: L.outerStart as number, inner: L.innerStart as number };
    docked[wing].forEach((pod, i) => {
      const row = i % 2 === 0 ? "outer" : "inner";
      // Side of the road the pod sits on: away from the other wing (outer) or toward the spine (inner).
      const side = (row === "outer" ? WING_SIDE[wing] : -WING_SIDE[wing]) as -1 | 1;
      const p = dock(pod, zr, side, cursor[row], row);
      cursor[row] += L.slot + L.gap;
      placed.push(p);
      lastEdge[wing] = Math.max(lastEdge[wing], p.rect.maxX);
    });
  }
  // The spine: north row from `data.start`, south row half a pitch later (the wings' outer and inner offsets).
  const spineCursor = { outer: L.data.start as number, inner: L.data.start + L.innerStart - L.outerStart };
  let spineEdge = -Infinity;
  docked.data.forEach((pod, i) => {
    const row = i % 2 === 0 ? "outer" : "inner";
    const p = dock(pod, 0, row === "outer" ? -1 : 1, spineCursor[row], row);
    spineCursor[row] += L.slot + L.gap;
    placed.push(p);
    spineEdge = Math.max(spineEdge, p.rect.maxX);
  });

  // Each wing road turns `tail` past its own last pod; the east plaza sits on the later turn, so a
  // shorter wing cuts across to it instead of running on empty. An empty wing still reaches a plaza
  // and a margin past the point where the wing roads start.
  // The Ops Control Room docks in the AI wing's inner row, `OPS.gap` past its last inner pod (or where the
  // inner row starts); the AI road turns at least half a road width past it, so the room always fits.
  const aiInner = placed.filter((p) => p.pod.wing === "ai" && p.row === "inner").map((p) => p.rect.maxX);
  const opsMinX = aiInner.length ? Math.max(...aiInner) + OPS.gap : L.innerStart;
  const minTurn: Record<SideWing, number> = { software: -Infinity, ai: opsMinX + OPS.w + half };
  const turnX = (wing: SideWing) => Math.max(L.wingStartX + L.east + L.margin, lastEdge[wing] + L.tail, minTurn[wing]);
  // The reactor plaza sits on the later wing turn, and a `tail` plus its radius past the last spine pod.
  const loopEnd: Vec2 = { x: Math.max(turnX("software"), turnX("ai"), spineEdge + L.tail + L.east / 2), z: 0 };
  const r = L.hub.size / 2;
  const mouth = (wing: SideWing): Vec2 => ({ x: hubC.x + r * Math.cos(L.mouthAngle), z: hubC.z + WING_SIDE[wing] * r * Math.sin(L.mouthAngle) });
  // All three roads end on the ring road around the reactor core (spectacle round), never at its center.
  const wingRoad = (wing: SideWing): Road => {
    const z = WING_SIDE[wing] * wingZ;
    const turn = { x: turnX(wing), z };
    return { id: wing, points: [hubC, mouth(wing), { x: L.wingStartX, z }, turn, ringEntry(loopEnd, turn)], width: L.road };
  };
  const spine: Road = { id: "data", points: [hubC, ringEntry(loopEnd, hubC)], width: L.road };
  const ring: Road = { id: "east-ring", points: ringPoints(loopEnd), width: L.road, closed: true };
  const core = reactorRect(loopEnd);
  const lead: Road = { id: "lead", points: [L.approach, hubC], width: L.road };
  const east: Plaza = { id: "east", center: loopEnd, w: L.east, d: L.east, round: true, core: REACTOR.half };
  const hubEndX = loopEnd.x + L.east / 2 + L.margin;

  const ops = opsPlacement(opsMinX, wingZ);
  const boards = { software: directoryBoard("software"), ai: directoryBoard("ai"), data: directoryBoard("data") } satisfies Record<Wing, DirectoryBoard>;
  const spurs: Spur[] = [
    ...placed.map((p) => ({ room: p.room, from: { x: p.door.x, z: p.roadZ }, to: p.door, width: L.spurWidth, color: WING_TINT[p.pod.wing] })),
    { room: OPS_ROOM, from: { x: ops.door.x, z: WING_SIDE.ai * wingZ }, to: ops.door, width: L.spurWidth, color: OPS_TINT },
    // The outer board stops hang off the spine on short spurs, so a click on a board drives straight there.
    // These are stop spurs, not doors: the `room` cast only labels them (no door trigger exists for a board).
    ...SIDE_WINGS.map((wing) => ({ room: `L3:directory:${wing}` as RoomId, from: { x: boards[wing].stop.x, z: 0 }, to: boards[wing].stop, width: L.spurWidth, color: WING_TINT[wing] })),
  ];
  // No floor arrows on L3 (owner request 2026-10-13): the roads, signs and directory guide the way.
  const network: RoadNetwork = { roads: [lead, spine, wingRoad("software"), wingRoad("ai"), ring], plazas: [hub, east], spurs, chevrons: false };

  const wingSign = (wing: SideWing): WingSign => {
    const at = mouth(wing);
    const to = { x: L.wingStartX, z: WING_SIDE[wing] * wingZ };
    const len = Math.hypot(to.x - at.x, to.z - at.z);
    const heading = { x: (to.x - at.x) / len, z: (to.z - at.z) / len };
    return { at, heading, float: { x: at.x + heading.x * L.signAlong, z: at.z + heading.z * L.signAlong } };
  };
  const spineSign: WingSign = { at: { x: hubC.x + r, z: 0 }, heading: { x: 1, z: 0 }, float: { x: L.spineSignX, z: 0 } };

  const doors: DoorTrigger[] = [
    ...placed.map((p) => ({ room: p.room, at: p.door, facing: { x: 0, z: -p.facing } })),
    { room: OPS_ROOM, at: ops.door, facing: { x: 0, z: ops.facing } },
  ];
  const EAST: Vec2 = { x: 1, z: 0 };
  const boardZone = (wing: Wing): ViewZone => {
    const b = boards[wing];
    return { id: `L3:directory:${wing}`, area: { minX: b.stop.x - 1, maxX: b.minX, minZ: b.minZ, maxZ: b.maxZ }, yaw: LOOK_EAST, zoom: L.boardZoom, ...(wing === "data" ? { travel: EAST } : {}) };
  };
  const viewZones: ViewZone[] = [
    // Board stops first: the camera stands west of the rover and looks east at the board, zoomed so it fits under the HUD.
    // The side stops lie on dead-end spurs and are reached heading north or south, so they take any heading; only
    // the data stop sits on the spine, where a westbound rover must not get the zone.
    ...LABS_WINGS.map(boardZone),
    // The arrival spot on the hub's east rim, on the spine: the camera sits west of the rover and looks east at
    // the wall with all three road mouths in front of it (phones zoom out further). Only rovers heading east
    // get it (`travel`), so driving the spine back to the hub never turns the camera around.
    {
      id: "L3:overview",
      area: { minX: L.overview.x - 4, maxX: boards.data.stop.x - 1, minZ: -2, maxZ: 2 },
      yaw: LOOK_EAST,
      zoom: L.overviewZoom,
      classView: { mobile: { zoom: L.overviewZoomPhone } },
      travel: EAST,
    },
    // Tech Reactor stop on the ring road's east point: the camera stands east of the rover and looks west
    // over the core, so the lit pods and roads of every wing fill the frame beside it.
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
  ];
  const obstacles: Rect[] = [...placed.map((p) => bare(p.rect)), ...wallPosts(), core, ops.rect];
  const extentZ = Math.max(wingZ + half, ...placed.map((p) => Math.max(Math.abs(p.rect.minZ), Math.abs(p.rect.maxZ))));
  const bounds: Rect = { minX: L.slabMinX, maxX: hubEndX, minZ: -(extentZ + L.margin), maxZ: extentZ + L.margin };

  // Packet lanes: two spines in the row gap between the spine pods and the inner wing pods (east of the
  // wall to the reactor plaza's west rim), with a branch into the back wall of each pod on either side.
  const laneZ = half + L.forecourt + spineDepth + L.rowGap / 2;
  const laneFrom = L.board.x + L.board.w / 2 + 1;
  const laneTo = loopEnd.x - L.east / 2;
  const lanes: [number, number][][] = [];
  if (laneTo > laneFrom) for (const s of [-1, 1]) lanes.push([[laneFrom, s * laneZ], [laneTo, s * laneZ]]);
  for (const p of placed) {
    if (p.pod.wing !== "data" && p.row !== "inner") continue;
    const back = p.facing > 0 ? p.rect.minZ : p.rect.maxZ;
    lanes.push([[p.center.x, Math.sign(p.center.z) * laneZ], [p.center.x, back]]);
  }

  return {
    floor: {
      id: "L3",
      bounds,
      door: L.door,
      approach: L.approach,
      obstacles,
      // The boards (11.2 u), the reactor core and the Ops Control Room block a low camera up to their own height.
      tall: [...LABS_WINGS.map((w) => ({ ...bare(boards[w]), h: L.board.h })), { ...core, h: REACTOR.height }, { ...ops.rect, h: OPS.h }],
      spawn: L.overview,
      arrival: L.overview,
      accent: L.accent,
      doors,
      road: network,
      viewZones,
      // Fast return (F1): south-east of the reactor core, outside the ring road's driving width.
      returnPad: { x: loopEnd.x + 10, z: 9 },
      stops: { [REACTOR_ROOM]: reactorStop(loopEnd) },
      directoryStops: { software: boards.software.stop, ai: boards.ai.stop, data: boards.data.stop },
    },
    placed,
    directory,
    boards,
    network,
    hub,
    east,
    signs: { software: wingSign("software"), ai: wingSign("ai"), data: spineSign },
    lanes,
    reactor: { center: loopEnd, rect: core },
    ops,
    wingZ,
  };
}

/** Camera zoom in the Ops Control Room's door zone. */
const OPS_ZOOM = 0.85;

/** Road tint of the Ops Control Room spur (monitoring green). */
export const OPS_TINT = "#34d399";

/** The Ops Control Room on the AI side: inner row, `OPS.w` wide from `minX`, front on the forecourt line like the inner pods. */
function opsPlacement(minX: number, wingZ: number): OpsPlacement {
  const L = LABS;
  // Inner side of the AI wing road: toward the software wing (z decreases).
  const side = -WING_SIDE.ai as -1 | 1;
  const front = WING_SIDE.ai * wingZ + side * (L.road / 2 + L.forecourt);
  const back = front + side * OPS.d;
  const center = { x: minX + OPS.w / 2, z: (front + back) / 2 };
  return {
    rect: { minX, maxX: minX + OPS.w, minZ: Math.min(front, back), maxZ: Math.max(front, back) },
    center,
    door: { x: center.x, z: front - side * L.padInset },
    facing: side,
  };
}
