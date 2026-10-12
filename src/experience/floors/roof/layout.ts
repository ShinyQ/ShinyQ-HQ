import type { ViewZone } from "../../camera/orbit";
import { towardPad } from "../../nav/doors";
import { ROAD, type Plaza, type Road, type RoadNetwork, type Spur } from "../../nav/road";
import type { DoorTrigger, FloorLayout, Rect, Vec2 } from "../../types";

/** RF Roof element positions (appendix 01 section 6). Floor-local, pure. */
export const ROOF = {
  beacon: { x: 0, z: -6, r: 1.2 },
  /** Comms terminals sit on an arc of this radius in front of (+z of) the beacon. */
  arc: 10,
  /** Angle between neighbouring terminals (radians). */
  arcStep: (24 * Math.PI) / 180,
  terminal: { w: 1.8, d: 0.8, h: 1.1 },
  kiosk: { x: 10, z: 6, w: 3, d: 2 },
} as const;

/** Email plus LinkedIn, GitHub, Hugging Face, Medium, Google Scholar and IEEE Xplore. */
export const TERMINAL_COUNT = 7;
const STOP_GAP = 2.4;

export interface TerminalSlot {
  index: number;
  x: number;
  z: number;
  /** Yaw so the screen faces away from the beacon (local +z points outward). */
  angle: number;
}

const rect = (cx: number, cz: number, w: number, d: number): Rect => ({
  minX: cx - w / 2,
  maxX: cx + w / 2,
  minZ: cz - d / 2,
  maxZ: cz + d / 2,
});

/** Terminals spread symmetrically on the arc, the middle one straight in front of the beacon. */
export function terminalSlots(count = TERMINAL_COUNT): TerminalSlot[] {
  const { beacon, arc, arcStep } = ROOF;
  return Array.from({ length: count }, (_, index) => {
    const angle = (index - (count - 1) / 2) * arcStep;
    return { index, angle, x: beacon.x + arc * Math.sin(angle), z: beacon.z + arc * Math.cos(angle) };
  });
}

const middle = terminalSlots()[Math.floor(TERMINAL_COUNT / 2)];
const { kiosk } = ROOF;

/** Mission stops on the Roof. */
export const ROOF_STOPS: Record<"contact" | "cv", Vec2> = {
  contact: { x: middle.x, z: middle.z + ROOF.terminal.d / 2 + STOP_GAP },
  cv: { x: kiosk.x, z: kiosk.z + kiosk.d / 2 + STOP_GAP },
};

/** Navgrid obstacles (before rover inflation). Terminals use a square that covers any yaw. */
export function roofObstacles(count = TERMINAL_COUNT): Rect[] {
  const { beacon, terminal } = ROOF;
  const side = Math.max(terminal.w, terminal.d);
  return [
    rect(beacon.x, beacon.z, beacon.r * 2, beacon.r * 2),
    ...terminalSlots(count).map((t) => rect(t.x, t.z, side, side)),
    rect(kiosk.x, kiosk.z, kiosk.w, kiosk.d),
  ];
}

/** Door triggers: in front of the middle comms terminal and the CV kiosk. */
export const ROOF_DOORS: DoorTrigger[] = [
  { room: "RF:contact", at: ROOF_STOPS.contact, facing: { x: 0, z: -1 } },
  { room: "RF:cv", at: ROOF_STOPS.cv, facing: { x: 0, z: -1 } },
];

const LANE_Z = ROOF_STOPS.cv.z;

/** Prototype data lanes on RF: from the elevator around the comms arc toward the CV kiosk, with a spur to the email terminal. Lanes stop before door pads. */
export const ROOF_LANES: [number, number][][] = [
  [[-17, 0], [-17, LANE_Z], towardPad([-17, LANE_Z], ROOF_STOPS.cv)],
  [[ROOF_STOPS.contact.x, LANE_Z], towardPad([ROOF_STOPS.contact.x, LANE_Z], ROOF_STOPS.contact)],
];

/* ----------------------------------------------------------------- RF revamp: the roof deck */

/**
 * RF roof deck (RF revamp plan). The elevator approach leads east on one road into a round plaza
 * around the centerpiece (telescope, drone cradle or antenna mast, per the picked concept). The
 * stations sit flush with the slab edges, facing the plaza: comms (RF:contact) north, the CV station
 * (RF:cv) east, the about board south-west. Pure (no React or three): the floor layout, the scenery
 * and the "Meet me" walk all read it.
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
  /** Rover stop south of the centerpiece, facing its availability sign. */
  availability: { x: 2, z: 6 },
  /** Deep links spawn here and elevator arrivals roll on here: south-east of the plaza, looking north-west over it. */
  spawn: { x: 8, z: 7 },
  /** Overview zoom at the spawn: the plaza, the comms station and the CV station in frame. */
  overviewZoom: 1.25,
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
    // Spawn and arrival: the default south-east angle, zoomed out over the plaza toward the comms station.
    { id: "RF:overview", area: box(spawn, 3), yaw: 0, zoom: D.overviewZoom },
    // Comms (facing south): the camera south of the rover, looking north at the station and the channels above it.
    { id: "RF:contact", area: { minX: comms.minX, maxX: comms.maxX, minZ: contactPad.z - 2, maxZ: contactPad.z + 2 }, yaw: -Math.PI / 4 },
    // CV station (facing west): the camera west of the rover, looking east.
    { id: "RF:cv", area: { minX: cvPad.x - 2, maxX: cv.minX, minZ: cv.minZ, maxZ: cv.maxZ }, yaw: (-3 * Math.PI) / 4 },
    // About board (facing north): the camera north of the rover, looking south.
    { id: "RF:about", area: { minX: about.minX, maxX: about.maxX, minZ: stops.about.z - 2, maxZ: about.minZ }, yaw: (3 * Math.PI) / 4 },
    // Availability sign on the centerpiece (facing south): the camera south of the rover, looking north.
    { id: "RF:availability", area: box(stops.availability), yaw: -Math.PI / 4 },
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
