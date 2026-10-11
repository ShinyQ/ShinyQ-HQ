import type { RoomId, Wing } from "@/content/schema";
import { ROAD, type Plaza, type Road, type RoadNetwork, type Spur } from "../../nav/road";
import type { ViewZone } from "../../camera/orbit";
import type { DoorTrigger, FloorLayout, LabPod, Rect, Vec2 } from "../../types";

/**
 * L3 Project Roads (walkable floors plan, part 2). The global elevator shaft stays at x = -28, so
 * a short lead road runs from its door into a round hub plaza with the two wing directory boards.
 * The Software Wing road (north, z < 0) and the AI Wing road (south, z > 0) leave the hub, run east
 * and meet at the east plaza, so the floor is one loop without dead ends. Hero and featured pods
 * dock on both sides of their wing road (hero pods nearest the hub), each with a forecourt and a
 * spur to its door, at least 6 u apart. Listed pods stay on the directory boards.
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
  innerStart: 20,
  /** Clear floor between two pods on the same side of a road (at least 6 u). */
  gap: 7,
  /** Road edge to pod front: the forecourt. */
  forecourt: 3,
  hero: { w: 12, d: 9 },
  featured: { w: 8, d: 7 },
  /** Pods docked per wing; the rest go to the wing directory. */
  maxPerWing: 12,
  /** Pod front wall to door pad center (the rover fits on the pad). */
  padInset: 1.1,
  spurWidth: 4,
  /** Road from the last pod to the loop corner, and the corner's x offset to the east plaza. */
  tail: 8,
  loop: 14,
  /** Diameter of the east plaza where the wing roads meet. */
  east: 18,
  /** Wing directory boards on the west rim of the hub, thin along x and facing east (+x) toward the follow camera. */
  board: { x: -14, z: 9, w: 0.6, d: 6, h: 6.4 },
  /** Distance from a board's front face to the stop in front of it. */
  boardStop: 2.4,
  margin: 6,
  /** Hologram stage disc inside hero pods (6 u diameter). */
  stageRadius: 3,
  wallHeight: 2.6,
} as const;

/** -1 = north (Software Wing), +1 = south (AI Wing). */
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

export interface DirectoryBoard extends Rect {
  center: Vec2;
  /** Where the rover stops to read the board (`directoryStop`). */
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
  /** Where each wing road leaves the hub (signs), and its heading. */
  signs: Record<Wing, { at: Vec2; heading: Vec2 }>;
  /** Packet lanes: the data spine between the inner rows and a branch into each inner pod. */
  lanes: [number, number][][];
}

const rect = (c: Vec2, w: number, d: number): Rect => ({ minX: c.x - w / 2, maxX: c.x + w / 2, minZ: c.z - d / 2, maxZ: c.z + d / 2 });
const bare = ({ minX, maxX, minZ, maxZ }: Rect): Rect => ({ minX, maxX, minZ, maxZ });

export function roomOf(pod: Pick<LabPod, "slug">): RoomId {
  return `L3:${pod.slug}`;
}

/** The wing directory board on the hub rim (fixed: it does not depend on the pods). */
export function directoryBoard(wing: Wing): DirectoryBoard {
  const { board } = LABS;
  const center = { x: board.x, z: WING_SIDE[wing] * board.z };
  return { ...rect(center, board.w, board.d), center, stop: { x: board.x + board.w / 2 + LABS.boardStop, z: center.z } };
}

/** Where `drive` stops for a listed item, and the tour's "More projects here" stop: in front of its wing's board. */
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

/** Hero pods (by `order`), then featured pods (by `order`): the docking order along a wing road and the tour order. */
export function tourOrder(pods: readonly LabPod[]): LabPod[] {
  const byOrder = (a: LabPod, b: LabPod) => a.order - b.order;
  return [...pods.filter((p) => p.tier === "hero").sort(byOrder), ...pods.filter((p) => p.tier === "featured").sort(byOrder)];
}

/**
 * Places pods from data (`ExperienceData.labs.pods`). Per wing, hero then featured pods dock along
 * the wing road from the hub eastward, alternating the outer and the inner side; the loop corner
 * follows the farthest pod of either wing, so both wings share one east plaza.
 */
export function buildLabsLayout(pods: readonly LabPod[]): LabsLayout {
  const L = LABS;
  const half = L.road / 2;
  const hubC: Vec2 = { x: L.hub.x, z: L.hub.z };
  const hub: Plaza = { id: "hub", center: hubC, w: L.hub.size, d: L.hub.size, round: true };
  const placed: PlacedPod[] = [];
  const directory: Record<Wing, LabPod[]> = { software: [], ai: [] };
  let farX: number = L.wingStartX;

  for (const wing of ["software", "ai"] as const) {
    const zr = WING_SIDE[wing] * L.wingZ;
    const inWing = pods.filter((p) => p.wing === wing);
    const tour = tourOrder(inWing);
    const docked = tour.slice(0, L.maxPerWing);
    directory[wing] = [...tour.slice(L.maxPerWing), ...inWing.filter((p) => p.tier === "listed")];
    const cursor = { outer: L.outerStart as number, inner: L.innerStart as number };
    docked.forEach((pod, i) => {
      const row = i % 2 === 0 ? "outer" : "inner";
      // Side of the road the pod sits on: away from the other wing (outer) or toward it (inner).
      const side = (row === "outer" ? WING_SIDE[wing] : -WING_SIDE[wing]) as -1 | 1;
      const { w, d } = pod.tier === "hero" ? L.hero : L.featured;
      const x = cursor[row] + w / 2;
      cursor[row] += w + L.gap;
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
    });
    farX = Math.max(farX, cursor.outer - L.gap, cursor.inner - L.gap);
  }

  const turnX = farX + L.tail;
  const loopEnd: Vec2 = { x: turnX + L.loop, z: 0 };
  const wingRoad = (wing: Wing): Road => {
    const z = WING_SIDE[wing] * L.wingZ;
    return { id: wing, points: [hubC, { x: L.wingStartX, z }, { x: turnX, z }, loopEnd], width: L.road };
  };
  const lead: Road = { id: "lead", points: [L.approach, hubC], width: L.road };
  const east: Plaza = { id: "east", center: loopEnd, w: L.east, d: L.east, round: true };
  const spurs: Spur[] = placed.map((p) => ({
    room: p.room,
    from: { x: p.door.x, z: WING_SIDE[p.pod.wing] * L.wingZ },
    to: p.door,
    width: L.spurWidth,
    color: WING_TINT[p.pod.wing],
  }));
  const network: RoadNetwork = { roads: [lead, wingRoad("software"), wingRoad("ai")], plazas: [hub, east], spurs };

  const boards = { software: directoryBoard("software"), ai: directoryBoard("ai") };
  const sign = (wing: Wing) => {
    const to = { x: L.wingStartX, z: WING_SIDE[wing] * L.wingZ };
    const len = Math.hypot(to.x - hubC.x, to.z - hubC.z);
    const heading = { x: (to.x - hubC.x) / len, z: (to.z - hubC.z) / len };
    // Just past the hub rim, on the wing road.
    const r = L.hub.size / 2 + 3;
    return { at: { x: hubC.x + heading.x * r, z: hubC.z + heading.z * r }, heading };
  };

  const doors: DoorTrigger[] = placed.map((p) => ({ room: p.room, at: p.door, facing: { x: 0, z: -p.facing } }));
  const viewZones: ViewZone[] = [
    // Arriving by elevator: the camera swings south-west of the rover, so the hub and the wing roads
    // fill the view instead of the shaft (a yaw of -PI/2; the shaft stays north-west, out of the line of sight).
    { id: "L3:arrival", area: { minX: L.slabMinX, maxX: hubC.x - L.hub.size / 2, minZ: -half, maxZ: half }, yaw: -Math.PI / 2 },
    // At a door the camera looks at the pod front at 45 degrees: from the south-east (the default) for
    // pods facing south, from the north-east for pods facing north, so a pod never sits between the
    // camera and the rover.
    ...placed.map((p) => ({
      id: p.room,
      area: { minX: p.rect.minX, maxX: p.rect.maxX, minZ: p.door.z - VIEW_ZONE_DEPTH, maxZ: p.door.z + VIEW_ZONE_DEPTH },
      yaw: p.facing > 0 ? 0 : Math.PI / 2,
    })),
    // The boards face east: a yaw of PI/4 puts the camera east of the rover, looking west at the board.
    ...(["software", "ai"] as const).map((wing) => {
      const b = boards[wing];
      return { id: `L3:directory:${wing}`, area: { minX: b.maxX, maxX: b.maxX + 6, minZ: b.minZ - 1, maxZ: b.maxZ + 1 }, yaw: Math.PI / 4 };
    }),
  ];
  const obstacles: Rect[] = [...placed.map((p) => bare(p.rect)), bare(boards.software), bare(boards.ai)];
  const extentZ = Math.max(L.wingZ + half, ...placed.map((p) => Math.max(Math.abs(p.rect.minZ), Math.abs(p.rect.maxZ))));
  const bounds: Rect = { minX: L.slabMinX, maxX: loopEnd.x + L.east / 2 + L.margin, minZ: -(extentZ + L.margin), maxZ: extentZ + L.margin };

  // Data spine between the inner rows (hub rim to east plaza rim) with a branch into each inner pod's back wall.
  const spineFrom = hubC.x + L.hub.size / 2 + 1;
  const spineTo = loopEnd.x - L.east / 2 - 1;
  const lanes: [number, number][][] = [
    [
      [spineFrom, 0],
      [spineTo, 0],
    ],
  ];
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
      spawn: L.approach,
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
