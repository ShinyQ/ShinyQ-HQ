import type { RoomId } from "@/content/schema";
import { yawLooking } from "../../camera/look";
import type { ViewZone } from "../../camera/orbit";
import type { Road, RoadNetwork, Spur } from "../../nav/road";
import type { DoorTrigger, FloorLayout, Rect, Vec2 } from "../../types";

/**
 * B1 Engine Room (spec 2026-10-17, section 3): a central aisle east from the elevator with seven bays,
 * alternating north and south; bays 1 to 5 hold the build story's stations, bays 6 and 7 stay dark until their
 * stations ship. Server rack rows fill the wall gaps between bays, a workbench closes the aisle at the east
 * edge. Pure (no React or three): the floor layout, the registry, the minimap and the scenery read it.
 * The bay order must equal `[...STATION_IDS, ...COMING_SOON_IDS]` of `src/content/build-story.ts` (a test
 * checks it; that module is server-only, so the ids are repeated here).
 */
export const ENGINE_BAYS = ["blueprint", "timeline", "agents", "gates", "dashboard", "brain", "rejected"] as const;
export type EngineBayId = (typeof ENGINE_BAYS)[number];
export const ENGINE_STATIONS = ["blueprint", "timeline", "agents", "gates", "dashboard"] as const satisfies readonly EngineBayId[];
export type EngineStationId = (typeof ENGINE_STATIONS)[number];

export function isEngineStation(id: EngineBayId): id is EngineStationId {
  return (ENGINE_STATIONS as readonly EngineBayId[]).includes(id);
}

export const engineRoom = (id: EngineStationId): RoomId => `B1:${id}`;

export const ENGINE = {
  bounds: { minX: -24, maxX: 48, minZ: -14, maxZ: 14 },
  door: { x: -24, z: 0 },
  approach: { x: -21, z: 0 },
  /** In front of the elevator: kept free for the elevator call pad. */
  callPad: { minX: -24, maxX: -16, minZ: -4, maxZ: 4 },
  /** The Engine Room's warmer amber (the Data and ML wing is #fbbf24). */
  accent: "#f59e0b",
  aisle: { width: 8, endX: 38 },
  /** Bay k stands at x = x0 + k * pitch, north for even k; w along x, d from the wall, h its wall height. */
  bay: { x0: -10, pitch: 7, w: 8, d: 6, h: 4.6 },
  /** Bay front to door pad center. */
  padInset: 1.1,
  spurWidth: 4,
  /** Rack rows stand this deep against the wall, between the bays. */
  rackDepth: 3,
  workbench: { minX: 44, maxX: 48, minZ: -5, maxZ: 5 },
  returnPad: { x: 40, z: 9 },
  /** Elevator arrivals roll on here and deep links spawn here (Round 8 J), looking east down the aisle. */
  // x -8 as on RF: far enough east of the shaft that the arrival camera clears the glass (`shaftClearZoom`).
  arrival: { x: -8, z: 0 },
  /** Arrival zooms: the widest view whose camera stays east of the glass shaft (`shaftClearZoom`), as on RF. */
  arrivalZoom: 0.95,
  arrivalZoomPhone: 0.8,
  /** Height of the ceiling pipe runs (u above the slab). */
  ceiling: 6.4,
} as const;

export interface EngineBay {
  id: EngineBayId;
  /** 0 to 6, from the elevator east. */
  index: number;
  side: "north" | "south";
  rect: Rect;
  center: Vec2;
  /** z of the bay's open face toward the aisle. */
  front: number;
  /** Unit direction from the aisle into the bay (the door facing). */
  facing: Vec2;
  lit: boolean;
  room: RoomId | null;
  /** Door pad center for lit bays; null for the dark bays. */
  pad: Vec2 | null;
}

export interface EngineLayout {
  floor: FloorLayout;
  network: RoadNetwork;
  bays: EngineBay[];
  /** Rack rows (obstacles) in the wall gaps between same-side bays. */
  racks: Rect[];
  workbench: Rect;
  callPad: Rect;
}

const plain = (r: Rect): Rect => ({ minX: r.minX, maxX: r.maxX, minZ: r.minZ, maxZ: r.maxZ });
const LOOK_EAST = yawLooking({ x: 1, z: 0 });

export function engineBays(): EngineBay[] {
  const { bounds, bay: B, padInset } = ENGINE;
  return ENGINE_BAYS.map((id, index) => {
    const side = index % 2 === 0 ? "north" : "south";
    const x = B.x0 + B.pitch * index;
    const rect: Rect =
      side === "north" ? { minX: x - B.w / 2, maxX: x + B.w / 2, minZ: bounds.minZ, maxZ: bounds.minZ + B.d } : { minX: x - B.w / 2, maxX: x + B.w / 2, minZ: bounds.maxZ - B.d, maxZ: bounds.maxZ };
    const front = side === "north" ? rect.maxZ : rect.minZ;
    const facing: Vec2 = { x: 0, z: side === "north" ? -1 : 1 };
    const lit = isEngineStation(id);
    return {
      id,
      index,
      side,
      rect,
      center: { x, z: (rect.minZ + rect.maxZ) / 2 },
      front,
      facing,
      lit,
      room: lit ? engineRoom(id) : null,
      pad: lit ? { x, z: front - facing.z * padInset } : null,
    };
  });
}

/** Rack rows in every wall gap between neighbouring bays on the same side, touching both bays and the wall. */
export function engineRacks(bays: readonly EngineBay[]): Rect[] {
  const { bounds, rackDepth } = ENGINE;
  const racks: Rect[] = [];
  for (const side of ["north", "south"] as const) {
    const row = bays.filter((b) => b.side === side);
    for (let i = 0; i + 1 < row.length; i++) {
      const [minX, maxX] = [row[i].rect.maxX, row[i + 1].rect.minX];
      racks.push(side === "north" ? { minX, maxX, minZ: bounds.minZ, maxZ: bounds.minZ + rackDepth } : { minX, maxX, minZ: bounds.maxZ - rackDepth, maxZ: bounds.maxZ });
    }
  }
  return racks;
}

/** The Engine Room: floor layout (aisle, spurs, doors, view zones, arrival, Return pad), bays, racks and the workbench. */
export function buildEngineLayout(): EngineLayout {
  const E = ENGINE;
  const bays = engineBays();
  const racks = engineRacks(bays);
  const workbench = plain(E.workbench);
  const aisle: Road = { id: "aisle", points: [{ ...E.approach }, { x: E.aisle.endX, z: 0 }], width: E.aisle.width };
  const stations = bays.flatMap((b) => (b.room && b.pad ? [{ ...b, room: b.room, pad: b.pad }] : []));
  const spurs: Spur[] = stations.map((b) => ({ room: b.room, from: { x: b.center.x, z: 0 }, to: b.pad, width: E.spurWidth, color: E.accent }));
  const network: RoadNetwork = { roads: [aisle], plazas: [], spurs };
  const doors: DoorTrigger[] = stations.map((b) => ({ room: b.room, at: b.pad, facing: b.facing }));
  const arrival: Vec2 = { ...E.arrival };
  const viewZones: ViewZone[] = [
    // Arrival (eastbound only, primed by an arrival or a deep link): behind the rover, down the aisle to the workbench.
    {
      id: "B1:arrival",
      area: { minX: arrival.x - 2, maxX: arrival.x + 2, minZ: arrival.z - 2, maxZ: arrival.z + 2 },
      yaw: LOOK_EAST,
      zoom: E.arrivalZoom,
      classView: { mobile: { zoom: E.arrivalZoomPhone } },
      travel: { x: 1, z: 0 },
      arrivalOnly: true,
    },
    // Each station: on its door pad the camera stands on the aisle side and looks into the bay.
    ...stations.map((b): ViewZone => ({ id: `B1:${b.id}`, area: { minX: b.rect.minX, maxX: b.rect.maxX, minZ: b.pad.z - 2, maxZ: b.pad.z + 2 }, yaw: yawLooking(b.facing) })),
    // The aisle's end: looking east at the workbench (eastbound only, so driving back never turns the camera).
    { id: "B1:workbench", area: { minX: E.aisle.endX - 4, maxX: workbench.minX, minZ: -E.aisle.width / 2, maxZ: E.aisle.width / 2 }, yaw: LOOK_EAST, travel: { x: 1, z: 0 } },
  ];
  return {
    floor: {
      id: "B1",
      bounds: plain(E.bounds),
      door: { ...E.door },
      approach: { ...E.approach },
      obstacles: [...bays.map((b) => b.rect), ...racks, workbench],
      spawn: arrival,
      arrival,
      accent: E.accent,
      doors,
      road: network,
      returnPad: { ...E.returnPad },
      viewZones,
    },
    network,
    bays,
    racks,
    workbench,
    callPad: plain(E.callPad),
  };
}
