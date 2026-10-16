import type { ViewZone } from "../../camera/orbit";
import { ROAD, type Plaza, type Road, type RoadNetwork, type Spur } from "../../nav/road";
import type { DoorTrigger, FloorLayout, Rect, Vec2 } from "../../types";

const rect = (cx: number, cz: number, w: number, d: number): Rect => ({
  minX: cx - w / 2,
  maxX: cx + w / 2,
  minZ: cz - d / 2,
  maxZ: cz + d / 2,
});

/* ----------------------------------------------------------------- RF revamp: the roof deck */

/**
 * RF roof deck (RF revamp plan). The elevator approach leads east on one road into a round plaza
 * around the centerpiece (telescope, drone cradle or antenna mast, per the picked concept). The
 * stations sit flush with the slab edges, facing the plaza: comms (RF:contact) north, the CV station
 * (RF:cv) east, the about board south-west. Pure (no React or three): the floor layout, the scenery
 * and the missions all read it.
 */
export const ROOF_DECK = {
  bounds: { minX: -20, maxX: 22, minZ: -20, maxZ: 20 },
  door: { x: -20, z: 0 },
  approach: { x: -17, z: 0 },
  /** In front of the elevator: kept free for the elevator call pad (no obstacles, pads, stops, labels or decor). */
  callPad: { minX: -20, maxX: -12, minZ: -4, maxZ: 4 },
  accent: "#60a5fa",
  plaza: { x: 2, z: 0, size: 20 },
  centerpiece: { w: 4, d: 4 },
  comms: { minX: -4, maxX: 8, minZ: -20, maxZ: -14 },
  cv: { minX: 16, maxX: 22, minZ: -3, maxZ: 3 },
  about: { minX: -8, maxX: 0, minZ: 16, maxZ: 20 },
  /** Station front to door pad center. */
  padInset: 1.1,
  spurWidth: 4,
  /** About board front to the rover stop in front of it. */
  aboutStop: 3.5,
  /** Rover stop south of the centerpiece, on the line the availability sign faces (`signYaw`). */
  availability: { x: 4.5, z: 6.1 },
  /**
   * Deep links spawn here and elevator arrivals roll on here (Round 8 J, like L3): the end of the lead road at
   * the plaza rim. The camera stands behind the rover and looks east over the plaza at the centerpiece mast.
   */
  spawn: { x: -8, z: 0 },
  /** Arrival zooms: the widest view whose camera stays east of the glass shaft (`shaftClearZoom`). */
  arrivalZoom: 0.95,
  arrivalZoomPhone: 0.8,
  /** View yaw at the availability stop (offset from the default angle): looks north-north-west at the mast. */
  overviewYaw: -Math.PI / 8,
  /** The availability sign on the mast faces the availability stop's camera head on (yaw PI/4 is the default camera's direction). */
  signYaw: Math.PI / 8,
} as const;

export type RoofStop = "about" | "availability" | "cv" | "contact";

export interface RoofLayoutInput {
  /** Contact channels on the comms station (`RoofData.channels.length`, 6 today). Only the anchors depend on it. */
  channels?: number;
}

export interface RoofLayout {
  floor: FloorLayout;
  network: RoadNetwork;
  plaza: Plaza;
  centerpiece: Rect & { center: Vec2 };
  comms: Rect;
  cv: Rect;
  about: Rect;
  /** Where the rover parks: door pads for the rooms, points for the about board and the availability sign. */
  stops: Record<RoofStop, Vec2>;
  /** One anchor per channel across the comms station (x ascending); the scenery picks the height. */
  channelSlots: Vec2[];
  callPad: Rect;
}

/** Which RF room the drawer shows: the scenery "transmits" for contact and "launches" for the CV. */
export type RoofActive = "contact" | "cv" | null;

export function roofActive(phase: string, room: string | null): RoofActive {
  if (phase !== "room") return null;
  return room === "RF:contact" ? "contact" : room === "RF:cv" ? "cv" : null;
}

const plain = (r: Rect): Rect => ({ minX: r.minX, maxX: r.maxX, minZ: r.minZ, maxZ: r.maxZ });
const centerOf = (r: Rect): Vec2 => ({ x: (r.minX + r.maxX) / 2, z: (r.minZ + r.maxZ) / 2 });

/** `n` anchors spread across the comms station, 1 u in from its ends, on its center line. */
export function channelSlots(n: number): Vec2[] {
  const { comms } = ROOF_DECK;
  const z = (comms.minZ + comms.maxZ) / 2;
  if (n <= 0) return [];
  if (n === 1) return [{ x: (comms.minX + comms.maxX) / 2, z }];
  const from = comms.minX + 1;
  const step = (comms.maxX - comms.minX - 2) / (n - 1);
  return Array.from({ length: n }, (_, i) => ({ x: from + i * step, z }));
}

/** The roof deck: floor layout (road, plaza, doors, view zones), stations, stops and channel anchors. */
export function buildRoofLayout({ channels = 6 }: RoofLayoutInput = {}): RoofLayout {
  const D = ROOF_DECK;
  const center: Vec2 = { x: D.plaza.x, z: D.plaza.z };
  const rim = D.plaza.size / 2;
  const plaza: Plaza = { id: "plaza", center, w: D.plaza.size, d: D.plaza.size, round: true };
  const centerpiece = { ...rect(center.x, center.z, D.centerpiece.w, D.centerpiece.d), center };
  const comms = plain(D.comms);
  const cv = plain(D.cv);
  const about = plain(D.about);
  const contactPad: Vec2 = { x: centerOf(comms).x, z: comms.maxZ + D.padInset };
  const cvPad: Vec2 = { x: cv.minX - D.padInset, z: centerOf(cv).z };
  const stops: Record<RoofStop, Vec2> = {
    about: { x: centerOf(about).x, z: about.minZ - D.aboutStop },
    availability: { x: D.availability.x, z: D.availability.z },
    cv: cvPad,
    contact: contactPad,
  };
  const lead: Road = { id: "lead", points: [{ x: D.approach.x, z: D.approach.z }, { x: center.x - rim, z: center.z }], width: ROAD.minWidth };
  const spurs: Spur[] = [
    { room: "RF:contact", from: { x: contactPad.x, z: center.z - rim + 1 }, to: contactPad, width: D.spurWidth, color: D.accent },
    { room: "RF:cv", from: { x: center.x + rim - 1, z: cvPad.z }, to: cvPad, width: D.spurWidth, color: "#22d3ee" },
  ];
  const network: RoadNetwork = { roads: [lead], plazas: [plaza], spurs };
  const doors: DoorTrigger[] = [
    { room: "RF:contact", at: contactPad, facing: { x: 0, z: -1 } },
    { room: "RF:cv", at: cvPad, facing: { x: 1, z: 0 } },
  ];
  const spawn: Vec2 = { x: D.spawn.x, z: D.spawn.z };
  const box = (p: Vec2, r = 2): Rect => ({ minX: p.x - r, maxX: p.x + r, minZ: p.z - r, maxZ: p.z + r });
  const viewZones: ViewZone[] = [
    // Spawn and arrival: behind a rover heading east, looking over the plaza at the mast (eastbound rovers only).
    {
      id: "RF:arrival",
      area: box(spawn),
      yaw: (-3 * Math.PI) / 4,
      zoom: D.arrivalZoom,
      classView: { mobile: { zoom: D.arrivalZoomPhone } },
      travel: { x: 1, z: 0 },
    },
    // Comms (facing south): the camera south of the rover, looking north at the station and the channels above it.
    { id: "RF:contact", area: { minX: comms.minX, maxX: comms.maxX, minZ: contactPad.z - 2, maxZ: contactPad.z + 2 }, yaw: -Math.PI / 4 },
    // CV station (facing west): the camera west of the rover, looking east.
    { id: "RF:cv", area: { minX: cvPad.x - 2, maxX: cv.minX, minZ: cv.minZ, maxZ: cv.maxZ }, yaw: (-3 * Math.PI) / 4 },
    // About board (facing north): the camera north of the rover, looking south.
    { id: "RF:about", area: { minX: about.minX, maxX: about.maxX, minZ: stops.about.z - 2, maxZ: about.minZ }, yaw: (3 * Math.PI) / 4 },
    // Availability sign on the mast (facing `signYaw`): looking straight at it.
    { id: "RF:availability", area: box(stops.availability, 1.8), yaw: D.overviewYaw },
  ];
  return {
    floor: {
      id: "RF",
      bounds: plain(D.bounds),
      door: { x: D.door.x, z: D.door.z },
      approach: { x: D.approach.x, z: D.approach.z },
      obstacles: [plain(centerpiece), comms, cv, about],
      spawn,
      arrival: spawn,
      accent: D.accent,
      doors,
      road: network,
      viewZones,
    },
    network,
    plaza,
    centerpiece,
    comms,
    cv,
    about,
    stops,
    channelSlots: channelSlots(channels),
    callPad: plain(D.callPad),
  };
}
