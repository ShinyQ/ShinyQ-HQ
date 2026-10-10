import type { RoomId, Wing } from "@/content/schema";
import { towardPad } from "../../nav/doors";
import type { DoorTrigger, FloorLayout, LabPod, Rect, Vec2 } from "../../types";

/**
 * L3 Labs geometry (appendix 01 section 4, as built in Phase 4). The global elevator shaft stays at
 * x = -28, so the atrium sits right in front of its door and both wings run east from it as mirror
 * halls: the Software Wing north of the spine lane (z < 0), the AI Wing south of it (z > 0).
 * Pure module (no React or three): Vitest runs it in node.
 */
export const LABS = {
  bounds: { minX: -24, maxX: 57, minZ: -28, maxZ: 28 } as Rect,
  atrium: { minX: -24, maxX: -10, minZ: -7, maxZ: 7 } as Rect,
  door: { x: -24, z: 0 } as Vec2,
  approach: { x: -21, z: 0 } as Vec2,
  accent: "#a78bfa",
  /** Hero pods 4 u apart, doors 4 u off the spine lane. */
  hero: { w: 12, d: 9, z: 8.5, xs: [6, 22, 38] },
  /** Featured pods 3 u apart, doors 3.5 u past the back lane. */
  featured: { w: 8, d: 7, z: 22.5, xs: [-5, 6, 17, 28, 39, 50] },
  /** |z| of the lane between the hero row and the featured row (2 u behind the hero pods). */
  backLane: 15,
  /** |z| of the door trigger centers, 1.1 u in front of each pod's front wall (the rover fits on the pad). */
  heroDoor: 2.9,
  featuredDoor: 17.9,
  /** x of the lane that links the spine and the back lanes, east of the last hero pod. */
  eastLink: 47,
  /** Wing directory boards: thin along x, facing east (+x) toward the follow camera. */
  pillar: { x: -12, z: 5.4, w: 0.6, d: 4.4, h: 6.4 },
  /** x of the stop in front of a directory board, where listed items are "visited". */
  pillarStopX: -10.2,
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
  /** Center of the door trigger, between the pod front and its lane. */
  door: Vec2;
  /** Direction (along z) the pod front faces: toward the spine for heroes, the back lane for featured. */
  facing: -1 | 1;
  width: number;
  depth: number;
}

export interface LabsLayout {
  floor: FloorLayout;
  placed: PlacedPod[];
  /** Pods that only appear in the wing directory (listed tier, or overflow beyond the rows). */
  directory: Record<Wing, LabPod[]>;
  pillars: Record<Wing, Rect & { center: Vec2 }>;
  lanes: [number, number][][];
}

const rect = (cx: number, cz: number, w: number, d: number): Rect => ({
  minX: cx - w / 2,
  maxX: cx + w / 2,
  minZ: cz - d / 2,
  maxZ: cz + d / 2,
});

export function roomOf(pod: Pick<LabPod, "slug">): RoomId {
  return `L3:${pod.slug}`;
}

/** Where `drive` stops for a listed item: in front of its wing's directory pillar. */
export function directoryStop(wing: Wing): Vec2 {
  return { x: LABS.pillarStopX, z: WING_SIDE[wing] * LABS.pillar.z };
}

/** Width and height of a hologram board for an architecture with `layers` columns and `rows` rows. */
export const BOARD = { colGap: 2.5, rowGap: 1.25, nodeW: 2, nodeH: 0.85, maxWidth: 9, y: 3.4 } as const;

export function boardSize(layers: number, rows: number): { width: number; height: number; scale: number } {
  const width = (Math.max(1, layers) - 1) * BOARD.colGap + BOARD.nodeW;
  const height = (Math.max(1, rows) - 1) * BOARD.rowGap + BOARD.nodeH;
  const scale = Math.min(1, BOARD.maxWidth / width);
  return { width: width * scale, height: height * scale, scale };
}

/**
 * Places pods from data. `pods` must already be in wing order (hero first, then `order`): heroes
 * fill the hero row nearest the atrium first, featured pods fill the featured row west to east, and
 * everything else (listed, or overflow) goes to the wing directory.
 */
export function buildLabsLayout(pods: readonly LabPod[]): LabsLayout {
  const placed: PlacedPod[] = [];
  const directory: Record<Wing, LabPod[]> = { software: [], ai: [] };

  for (const wing of ["software", "ai"] as const) {
    const side = WING_SIDE[wing];
    const facing = -side as -1 | 1;
    const inWing = pods.filter((p) => p.wing === wing);
    const place = (pod: LabPod, x: number, z: number, w: number, d: number, doorZ: number) =>
      placed.push({ pod, room: roomOf(pod), rect: rect(x, z, w, d), center: { x, z }, door: { x, z: doorZ }, facing, width: w, depth: d });

    inWing
      .filter((p) => p.tier === "hero")
      .forEach((pod, i) => {
        const x = LABS.hero.xs[i];
        if (x === undefined) directory[wing].push(pod);
        else place(pod, x, side * LABS.hero.z, LABS.hero.w, LABS.hero.d, side * LABS.heroDoor);
      });
    inWing
      .filter((p) => p.tier === "featured")
      .forEach((pod, i) => {
        const x = LABS.featured.xs[i];
        if (x === undefined) directory[wing].push(pod);
        else place(pod, x, side * LABS.featured.z, LABS.featured.w, LABS.featured.d, side * LABS.featuredDoor);
      });
    directory[wing].push(...inWing.filter((p) => p.tier === "listed"));
  }

  const pillar = (wing: Wing) => {
    const center = { x: LABS.pillar.x, z: WING_SIDE[wing] * LABS.pillar.z };
    return { ...rect(center.x, center.z, LABS.pillar.w, LABS.pillar.d), center };
  };
  const pillars = { software: pillar("software"), ai: pillar("ai") };

  const doors: DoorTrigger[] = placed.map((p) => ({ room: p.room, at: p.door }));
  const obstacles: Rect[] = [...placed.map((p) => p.rect), pillars.software, pillars.ai].map(({ minX, maxX, minZ, maxZ }) => ({ minX, maxX, minZ, maxZ }));

  const east = LABS.bounds.maxX - 2;
  const lanes: [number, number][][] = [
    [
      [LABS.approach.x, 0],
      [east, 0],
    ],
  ];
  for (const side of [-1, 1]) {
    const z = side * LABS.backLane;
    lanes.push(
      [
        [-8, z],
        [east, z],
      ],
      [
        [-7, 0],
        [-7, z],
      ],
      [
        [LABS.eastLink, 0],
        [LABS.eastLink, z],
      ],
    );
  }
  // Short spurs toward the hero doors stop before the pad, so no lane runs over a trigger.
  for (const p of placed) {
    if (Math.abs(p.door.z) < LABS.backLane)
      lanes.push([[p.door.x, 0], towardPad([p.door.x, 0], p.door)]);
  }

  return {
    floor: {
      id: "L3",
      bounds: LABS.bounds,
      door: LABS.door,
      approach: LABS.approach,
      obstacles,
      spawn: LABS.approach,
      accent: LABS.accent,
      doors,
    },
    placed,
    directory,
    pillars,
    lanes,
  };
}
