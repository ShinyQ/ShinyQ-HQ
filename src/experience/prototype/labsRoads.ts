import type { RoomId, Wing } from "@/content/schema";
import { ROAD, type Plaza, type Road, type RoadNetwork, type Spur } from "../nav/road";
import type { DoorTrigger, LabPod, Rect, Vec2 } from "../types";

/**
 * Prototype of the L3 Project Roads (design check, not wired into the tower). A round hub plaza in
 * front of the elevator holds the two wing directory boards. The Software Wing road (north) and the
 * AI Wing road (south) leave the hub and run east, then join at the far end, so the floor is one
 * loop without dead ends. Pods dock on both sides of their wing road (hero pods first, then featured
 * pods), each with a forecourt and a spur, at least 6 u apart.
 */

export const LABS_ROADS = {
  approach: { x: -21, z: 0 } as Vec2,
  door: { x: -24, z: 0 } as Vec2,
  slabMinX: -24,
  width: ROAD.minWidth,
  hub: { x: -4, z: 0, size: 26 },
  /** |z| of the wing roads. */
  wingZ: 24,
  /** x where the wing roads turn east (after leaving the hub). */
  wingStartX: 10,
  /** First pod x on the outer and inner side of each wing road (inner pods sit between the roads). */
  outerStart: 14,
  innerStart: 20,
  /** Clear floor between two pods along the road (>= 6 u). */
  gap: 7,
  /** Road edge to pod front (the forecourt). */
  forecourt: 3,
  hero: { w: 12, d: 9 },
  featured: { w: 8, d: 7 },
  /** Distance from a pod's front wall to its door pad center. */
  padInset: 1.1,
  /** Road from the last pod to the loop corner, and the loop corner's x offset. */
  tail: 8,
  loop: 14,
  /** Diameter of the plaza where the wing roads meet. */
  east: 18,
  board: { w: 5, d: 0.6 },
  margin: 6,
} as const;

export const WING_Z_SIDE: Record<Wing, -1 | 1> = { software: -1, ai: 1 };
export const WING_COLOR: Record<Wing, string> = { software: "#22d3ee", ai: "#a78bfa" };

export interface ProtoPod {
  pod: LabPod;
  room: RoomId;
  rect: Rect;
  center: Vec2;
  /** -1 north, +1 south of its wing road. */
  side: -1 | 1;
  /** Door pad center. */
  at: Vec2;
  /** Forecourt in front of the pod (between the road edge and the pod front). */
  forecourt: Rect;
}

export interface LabsRoadsLayout {
  bounds: Rect;
  network: RoadNetwork;
  hub: Plaza;
  east: Plaza;
  pods: ProtoPod[];
  directory: Record<Wing, LabPod[]>;
  boards: Record<Wing, Rect & { center: Vec2; stop: Vec2 }>;
  /** Signposts where each wing road leaves the hub. */
  signs: Record<Wing, Vec2>;
  obstacles: Rect[];
  doors: DoorTrigger[];
  approach: Vec2;
  door: Vec2;
  loopEnd: Vec2;
}

const rect = (c: Vec2, w: number, d: number): Rect => ({ minX: c.x - w / 2, maxX: c.x + w / 2, minZ: c.z - d / 2, maxZ: c.z + d / 2 });

/** `pods` in wing order (hero first, then `order`), as in `ExperienceData.labs.pods`. */
export function buildLabsRoads(pods: readonly LabPod[]): LabsRoadsLayout {
  const L = LABS_ROADS;
  const half = L.width / 2;
  const hub: Plaza = { id: "hub", center: { x: L.hub.x, z: L.hub.z }, w: L.hub.size, d: L.hub.size, round: true };
  const placed: ProtoPod[] = [];
  const directory: Record<Wing, LabPod[]> = { software: [], ai: [] };
  let farX = 0;

  for (const wing of ["software", "ai"] as const) {
    const zr = WING_Z_SIDE[wing] * L.wingZ;
    const inWing = pods.filter((p) => p.wing === wing);
    const tour = [...inWing.filter((p) => p.tier === "hero"), ...inWing.filter((p) => p.tier === "featured")];
    directory[wing] = inWing.filter((p) => p.tier === "listed");
    // Outer side (away from the other wing) and inner side alternate, hero pods first.
    const cursor = { outer: L.outerStart as number, inner: L.innerStart as number };
    tour.forEach((pod, i) => {
      const where = i % 2 === 0 ? "outer" : "inner";
      const side = (where === "outer" ? WING_Z_SIDE[wing] : -WING_Z_SIDE[wing]) as -1 | 1;
      const { w, d } = pod.tier === "hero" ? L.hero : L.featured;
      const x = cursor[where] + w / 2;
      cursor[where] += w + L.gap;
      const front = zr + side * (half + L.forecourt);
      const center = { x, z: front + (side * d) / 2 };
      placed.push({
        pod,
        room: `L3:${pod.slug}`,
        rect: rect(center, w, d),
        center,
        side,
        at: { x, z: front - side * L.padInset },
        forecourt: { minX: x - w / 2, maxX: x + w / 2, minZ: Math.min(zr + side * half, front), maxZ: Math.max(zr + side * half, front) },
      });
    });
    farX = Math.max(farX, cursor.outer - L.gap, cursor.inner - L.gap);
  }

  const turnX = farX + L.tail;
  const loopEnd = { x: turnX + L.loop, z: 0 };
  const hubC = hub.center;
  const wingRoad = (wing: Wing): Road => {
    const z = WING_Z_SIDE[wing] * L.wingZ;
    return {
      id: wing,
      points: [hubC, { x: L.wingStartX, z }, { x: turnX, z }, loopEnd],
      width: L.width,
    };
  };
  const lead: Road = { id: "lead", points: [L.approach, hubC], width: L.width };
  // Open plaza where the two wing roads meet: room to turn around and roam.
  const east: Plaza = { id: "east", center: loopEnd, w: L.east, d: L.east, round: true };

  const board = (wing: Wing) => {
    const side = WING_Z_SIDE[wing];
    // On the hub rim between the lead road and the wing road, facing the hub center.
    const center = { x: hubC.x - 4, z: side * (L.hub.size / 2 + 1.5) };
    return { ...rect(center, L.board.w, L.board.d), center, stop: { x: center.x, z: side * (L.hub.size / 2 - 2) } };
  };
  const boards = { software: board("software"), ai: board("ai") };
  const signs = {
    software: { x: L.wingStartX - 4, z: -(L.wingZ - half - 2) },
    ai: { x: L.wingStartX - 4, z: L.wingZ - half - 2 },
  };

  const spurs: Spur[] = placed.map((p) => ({
    room: p.room,
    from: { x: p.at.x, z: WING_Z_SIDE[p.pod.wing] * L.wingZ },
    to: p.at,
    width: 4,
    color: WING_COLOR[p.pod.wing],
  }));

  const obstacles: Rect[] = [...placed.map((p) => p.rect), boards.software, boards.ai].map(({ minX, maxX, minZ, maxZ }) => ({ minX, maxX, minZ, maxZ }));
  const extentZ = Math.max(L.wingZ + half + 6, ...placed.map((p) => Math.max(Math.abs(p.rect.minZ), Math.abs(p.rect.maxZ))));
  const bounds: Rect = { minX: L.slabMinX, maxX: loopEnd.x + L.east / 2 + L.margin, minZ: -(extentZ + L.margin), maxZ: extentZ + L.margin };
  const doors: DoorTrigger[] = placed.map((p) => ({ room: p.room, at: p.at, facing: { x: 0, z: p.side } }));

  return {
    bounds,
    network: { roads: [lead, wingRoad("software"), wingRoad("ai")], plazas: [hub, east], spurs },
    hub,
    east,
    pods: placed,
    directory,
    boards,
    signs,
    obstacles,
    doors,
    approach: L.approach,
    door: L.door,
    loopEnd,
  };
}
