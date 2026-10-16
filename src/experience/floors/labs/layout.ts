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
 * is one loop without dead ends or empty road ends. Where the three roads fork stand three free-standing
 * directory boards (owner request 2026-10-16: a neat entrance, one name per path, no floating road signs):
 * the Data and ML board a gate over the spine on two posts, facing west; the Product (north) and AI
 * (south) boards each on one pylon beside their road mouth, turned toward the axis so their fronts face
 * the arrival camera, about 2.3 u from the gate. Hero and featured pods dock on both sides
 * of their wing road in site order (`comparePods`: gallery pods nearest the hub), one `slot` each, so
 * both wings stay mirror images whatever their tiers; spine pods dock alternating north and south of the
 * spine, spread evenly from `data.start` to the reactor plaza. Each pod has a forecourt and a spur to its door, at least 6 u apart. `wingZ` grows past its
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
  /** Half a pitch after the outer row, so the rows alternate and the first inner pod stays 6 u clear of the directory boards. */
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
   * Directory boards where the three roads fork (plan 2026-10-16): three free-standing boards, `width`
   * along their face, `w` thick, raised from `base` (the rover, 2.8 u, drives under) to `h`. The Data and
   * ML board is a gate over the spine at x = `dataX`, facing west, on two posts `post` deep along the face
   * (outside the road's driving width). The side boards stand at (`side.x`, -/+`side.z`), each on one
   * central `pylon` (`across` along the normal, `along` along the face), turned `turn` rad from west
   * toward the axis.
   */
  board: { w: 0.6, base: 3.2, h: 9.6, width: 9, post: 0.4, pylon: { across: 0.4, along: 0.8 }, dataX: 18, side: { x: 16, z: 11.2 }, turn: 0.33 },
  /** Distance from a board's front face to the stop in front of it (the rover then hides none of the list). */
  boardStop: 3,
  /** Camera zoom at a board stop: the whole panel fits under the HUD top bar. */
  boardZoom: 1.05,
  /** Phones frame the board from its stop a little closer, so the list stays readable. */
  boardZoomPhone: 1,
  /** Entries a board shows in large type; the full list opens in the palette. */
  boardEntries: 5,
  /** Deep links (and the roll after an elevator ride) park here: on the hub's east rim facing the boards, beyond the hint radius of every board stop. */
  overview: { x: 8.5, z: 0 } as Vec2,
  /** Overview camera zoom: the three boards in the middle of the frame, the camera still east of the shaft. */
  overviewZoom: 1.3,
  /** The farthest phone view that keeps the follow camera east of the elevator shaft with a 1.5 u gap; the shaft then lies wholly behind the camera, which looks east. */
  overviewZoomPhone: 1.45,
  margin: 6,
  /** Hologram stage disc inside hero pods (6 u diameter). */
  stageRadius: 3,
  wallHeight: 2.6,
  /**
   * Data and ML spine: pods dock from `start` alternating north and south, half a pitch apart, at most `maxPods`.
   * The pitch spreads them to the reactor plaza (never below `slot + gap`, where they pack and push the plaza east).
   */
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
/**
 * Follow camera yaw whose forward (`followForward`) is `dir`, in (-PI, PI]. Every follow offset has
 * ox = oz, so the forward of yaw y points at angle 5PI/4 - y.
 */
export function lookAlong(dir: Vec2): number {
  const yaw = (5 * Math.PI) / 4 - Math.atan2(dir.z, dir.x);
  return Math.atan2(Math.sin(yaw), Math.cos(yaw));
}

/** Follow camera yaw that puts the camera west of the rover, looking east along the floor. */
const LOOK_EAST = (-3 * Math.PI) / 4;
/** Follow camera yaw that puts the camera east of the rover, looking west along the floor. */
const LOOK_WEST = Math.PI / 4;
/** Camera zoom at the Tech Reactor stop: the core in front, both wing roads beside it. */
const REACTOR_ZOOM = 1.3;

/** A directory board; its `Rect` is the axis-aligned bounds of its footprint. */
export interface DirectoryBoard extends Rect {
  center: Vec2;
  /** Unit direction the front face looks (toward the arrival camera and the board stop). */
  normal: Vec2;
  /** Reading direction of the front face: (normal.z, -normal.x). */
  along: Vec2;
  /** Troika text yaw of the front face: atan2(normal.x, normal.z); the back face is yaw + PI. */
  yaw: number;
  /** Where the rover stops to read the board (`directoryStop`): `boardStop` in front of its front face. */
  stop: Vec2;
}

/** A post under a board (a floor obstacle): `across` along the board's normal, `along` along its face. */
export interface BoardPost {
  wing: Wing;
  center: Vec2;
  across: number;
  along: number;
  /** The yaw of the board it carries. */
  yaw: number;
  /** Axis-aligned bounds of the turned footprint: the obstacle. */
  rect: Rect;
}

export interface LabsLayout {
  floor: FloorLayout;
  placed: PlacedPod[];
  /** Pods that only appear on the wing directory (listed tier, or overflow beyond `maxPerWing`). */
  directory: Record<Wing, LabPod[]>;
  /** The three free-standing directory boards at the fork, one per wing. */
  boards: Record<Wing, DirectoryBoard>;
  network: RoadNetwork;
  hub: Plaza;
  /** The round plaza around the reactor core where all three roads end on the ring road. */
  east: Plaza;
  /** Packet lanes: two packet spines between the spine pods and the inner wing rows, and a branch into each of their back walls. */
  lanes: [number, number][][];
  /** The reactor core in the middle of the east plaza (`reactor.ts`): its footprint is an obstacle the ring road drives around. */
  reactor: { center: Vec2; rect: Rect };
  /** The Ops Control Room (`ops.ts`): docked in the AI wing's inner row after its last inner pod, facing the wing road. */
  ops: OpsPlacement;
  /** |z| of the wing roads: wide enough for the spine pods, the row gap and the inner wing pods. */
  wingZ: number;
}

const rect = (c: Vec2, w: number, d: number): Rect => ({ minX: c.x - w / 2, maxX: c.x + w / 2, minZ: c.z - d / 2, maxZ: c.z + d / 2 });
const bare = ({ minX, maxX, minZ, maxZ }: Rect): Rect => ({ minX, maxX, minZ, maxZ });

export function roomOf(pod: Pick<LabPod, "slug">): RoomId {
  return `L3:${pod.slug}`;
}

const along = (normal: Vec2): Vec2 => ({ x: normal.z, z: -normal.x });
const offset = (p: Vec2, dir: Vec2, d: number): Vec2 => ({ x: p.x + dir.x * d, z: p.z + dir.z * d });

/** Axis-aligned bounds of a footprint `across` deep along `normal` and `length` long along the face. */
function footprint(center: Vec2, normal: Vec2, across: number, length: number): Rect {
  const hx = (Math.abs(normal.x) * across + Math.abs(normal.z) * length) / 2;
  const hz = (Math.abs(normal.z) * across + Math.abs(normal.x) * length) / 2;
  return { minX: center.x - hx, maxX: center.x + hx, minZ: center.z - hz, maxZ: center.z + hz };
}

/** A directory board at the fork (fixed: it does not depend on the pods). */
export function directoryBoard(wing: Wing): DirectoryBoard {
  const { w, width, dataX, side, turn } = LABS.board;
  const center: Vec2 = wing === "data" ? { x: dataX, z: 0 } : { x: side.x, z: WING_SIDE[wing] * side.z };
  const normal: Vec2 = wing === "data" ? { x: -1, z: 0 } : { x: -Math.cos(turn), z: -WING_SIDE[wing] * Math.sin(turn) };
  return { ...footprint(center, normal, w, width), center, normal, along: along(normal), yaw: Math.atan2(normal.x, normal.z), stop: offset(center, normal, w / 2 + LABS.boardStop) };
}

/** Where `drive` stops for a listed item, and the tour's "More projects here" stop: in front of its wing's board. */
export function directoryStop(wing: Wing): Vec2 {
  return directoryBoard(wing).stop;
}

/** The posts that carry the boards (the floor obstacles): two framing the spine road under the gate, then one pylon under each side board. */
export function wallPosts(): BoardPost[] {
  const { w, width, post, pylon } = LABS.board;
  const at = (wing: Wing, center: Vec2, across: number, length: number): BoardPost => {
    const b = directoryBoard(wing);
    return { wing, center, across, along: length, yaw: b.yaw, rect: footprint(center, b.normal, across, length) };
  };
  const gate = directoryBoard("data");
  return [
    ...[-1, 1].map((s) => at("data", offset(gate.center, gate.along, s * (width / 2 - post / 2)), w, post)),
    ...SIDE_WINGS.map((wing) => at(wing, directoryBoard(wing).center, pylon.across, pylon.along)),
  ];
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
 * plaza. Data pods dock alternating north and south of the spine, spread to the plaza the side wings set
 * (see the module comment).
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
  // Each wing road turns `tail` past its own last pod; the east plaza sits on the later turn, so a
  // shorter wing cuts across to it instead of running on empty. An empty wing still reaches a plaza
  // and a margin past the point where the wing roads start.
  // The Ops Control Room docks in the AI wing's inner row, `OPS.gap` past its last inner pod (or where the
  // inner row starts); the AI road turns at least half a road width past it, so the room always fits.
  const aiInner = placed.filter((p) => p.pod.wing === "ai" && p.row === "inner").map((p) => p.rect.maxX);
  const opsMinX = aiInner.length ? Math.max(...aiInner) + OPS.gap : L.innerStart;
  const sideTurn = (wing: SideWing) => Math.max(L.wingStartX + L.east + L.margin, lastEdge[wing] + L.tail, wing === "ai" ? opsMinX + OPS.w + half : -Infinity);

  // The spine: pods alternate north (even index) and south (odd), one even step of half a pitch apart from
  // `data.start`, spread so the last slot ends a `tail` before the reactor plaza the side wings alone set.
  // With many pods the pitch stops at a slot and a gap: they pack and push the plaza east.
  const spineEnd = Math.max(sideTurn("software"), sideTurn("ai")) - L.east / 2 - L.tail;
  const n = docked.data.length;
  const pitch = Math.max(L.slot + L.gap, n > 1 ? (2 * (spineEnd - L.data.start - L.slot)) / (n - 1) : 0);
  let spineEdge = -Infinity;
  docked.data.forEach((pod, i) => {
    const row = i % 2 === 0 ? "outer" : "inner";
    const p = dock(pod, 0, row === "outer" ? -1 : 1, L.data.start + (i * pitch) / 2, row);
    placed.push(p);
    spineEdge = Math.max(spineEdge, p.rect.maxX);
  });

  // With spine pods, every side wing also turns `tail` past the last spine pod, so its last leg into the
  // ring never cuts diagonally through the spine rows.
  const spineTurn = Number.isFinite(spineEdge) ? spineEdge + L.tail : -Infinity;
  const turnX = (wing: SideWing) => Math.max(sideTurn(wing), spineTurn);
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
    // The side board stops hang straight off the spine on short spurs, so a click on a board from the arrival spot drives
    // east and turns off, never back through the hub. These are stop spurs, not doors: the `room` cast only labels them
    // (no door trigger exists for a board).
    ...SIDE_WINGS.map((wing) => ({
      room: `L3:directory:${wing}` as RoomId,
      from: { x: boards[wing].stop.x, z: 0 },
      to: boards[wing].stop,
      width: L.spurWidth,
      color: WING_TINT[wing],
    })),
  ];
  // No floor arrows on L3 (owner request 2026-10-13): the roads and the directory boards guide the way.
  const network: RoadNetwork = { roads: [lead, spine, wingRoad("software"), wingRoad("ai"), ring], plazas: [hub, east], spurs, chevrons: false };

  const doors: DoorTrigger[] = [
    ...placed.map((p) => ({ room: p.room, at: p.door, facing: { x: 0, z: -p.facing } })),
    { room: OPS_ROOM, at: ops.door, facing: { x: 0, z: ops.facing } },
  ];
  const EAST: Vec2 = { x: 1, z: 0 };
  const boardZone = (wing: Wing): ViewZone => {
    const b = boards[wing];
    const view = { zoom: L.boardZoom, classView: { mobile: { zoom: L.boardZoomPhone } } };
    if (wing === "data") return { id: `L3:directory:${wing}`, area: { minX: b.stop.x - 1, maxX: b.minX, minZ: -L.board.width / 2, maxZ: L.board.width / 2 }, yaw: LOOK_EAST, ...view, travel: EAST };
    const { x, z } = b.stop;
    return { id: `L3:directory:${wing}`, area: { minX: x - 1.5, maxX: x + 1.5, minZ: z - 1.5, maxZ: z + 1.5 }, yaw: lookAlong({ x: -b.normal.x, z: -b.normal.z }), ...view };
  };
  const viewZones: ViewZone[] = [
    // Board stops first: the camera stands behind the rover and looks at the board head on, zoomed so it fits under the HUD.
    // The side stops lie on dead-end spurs, so they take any heading; only the data stop sits on the spine, where a
    // westbound rover must not get the zone.
    ...LABS_WINGS.map(boardZone),
    // The arrival spot on the hub's east rim, on the spine: the camera sits west of the rover and looks east at
    // the three boards with all three road mouths in front of them (phones zoom out further). Only rovers heading east
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
  const obstacles: Rect[] = [...placed.map((p) => bare(p.rect)), ...wallPosts().map((p) => p.rect), core, ops.rect];
  const extentZ = Math.max(wingZ + half, ...placed.map((p) => Math.max(Math.abs(p.rect.minZ), Math.abs(p.rect.maxZ))));
  const bounds: Rect = { minX: L.slabMinX, maxX: hubEndX, minZ: -(extentZ + L.margin), maxZ: extentZ + L.margin };

  // Packet lanes: two spines in the row gap between the spine pods and the inner wing pods (east of the
  // gate to the reactor plaza's west rim), with a branch into the back wall of each pod on either side.
  const laneZ = half + L.forecourt + spineDepth + L.rowGap / 2;
  const laneFrom = L.board.dataX + L.board.w / 2 + 1;
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
      // The boards (9.6 u), the reactor core and the Ops Control Room block a low camera up to their own height.
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
