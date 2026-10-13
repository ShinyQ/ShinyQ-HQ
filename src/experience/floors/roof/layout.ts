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
 * (RF:cv) east, the about board south-west, the Visitor Observatory (RF:visits) north-east. Pure (no React or three): the floor layout, the scenery
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
  /** Visitor Observatory (public visit stats, owner plan 2026-10-14): the free north-east corner, flush with the north and east slab edges. */
  visits: { minX: 14, maxX: 22, minZ: -20, maxZ: -14 },
  /** Top of the observatory globe: a camera collision column (`FloorLayout.tall`). */
  visitsHeight: 7.4,
  /** Where the observatory spur leaves the plaza (inside its rim), so the spur meets the pad within 45 degrees of the door's facing. */
  visitsSpurFrom: { x: 11, z: -4 },
  /** Station front to door pad center. */
  padInset: 1.1,
  spurWidth: 4,
  /** About board front to the rover stop in front of it. */
  aboutStop: 3.5,
  /** Rover stop south of the centerpiece, on the line the availability sign faces (`signYaw`). */
  availability: { x: 4.5, z: 6.1 },
  /** Deep links spawn here and elevator arrivals roll on here: south-east of the plaza, looking north-west over it. */
  spawn: { x: 8, z: 7 },
  /** Overview zoom at the spawn: the plaza, the comms station and the CV station in frame. */
  overviewZoom: 1.25,
  /** Overview yaw at the spawn (offset from the default angle): looks north-north-west, the comms station near the middle. */
  overviewYaw: -Math.PI / 8,
  /** The availability sign on the mast faces the overview camera head on (yaw PI/4 is the default camera's direction). */
  signYaw: Math.PI / 8,
} as const;

export type RoofStop = "about" | "availability" | "cv" | "contact" | "visits";

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
  /** The Visitor Observatory (RF:visits): globe and stats panel. */
  visits: Rect;
  /** Where the rover parks: door pads for the rooms, points for the about board and the availability sign. */
  stops: Record<RoofStop, Vec2>;
  /** One anchor per channel across the comms station (x ascending); the scenery picks the height. */
  channelSlots: Vec2[];
  callPad: Rect;
}

/** Which RF room the drawer shows: the scenery "transmits" for contact, "launches" for the CV and spins the globe for the visits. */
export type RoofActive = "contact" | "cv" | "visits" | null;

const ACTIVE: Record<string, Exclude<RoofActive, null>> = { "RF:contact": "contact", "RF:cv": "cv", "RF:visits": "visits" };

export function roofActive(phase: string, room: string | null): RoofActive {
  if (phase !== "room" || !room) return null;
  return ACTIVE[room] ?? null;
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
  const visits = plain(D.visits);
  const visitsPad: Vec2 = { x: centerOf(visits).x, z: visits.maxZ + D.padInset };
  const contactPad: Vec2 = { x: centerOf(comms).x, z: comms.maxZ + D.padInset };
  const cvPad: Vec2 = { x: cv.minX - D.padInset, z: centerOf(cv).z };
  const stops: Record<RoofStop, Vec2> = {
    about: { x: centerOf(about).x, z: about.minZ - D.aboutStop },
    availability: { x: D.availability.x, z: D.availability.z },
    cv: cvPad,
    contact: contactPad,
    visits: visitsPad,
  };
  const lead: Road = { id: "lead", points: [{ x: D.approach.x, z: D.approach.z }, { x: center.x - rim, z: center.z }], width: ROAD.minWidth };
  const spurs: Spur[] = [
    { room: "RF:contact", from: { x: contactPad.x, z: center.z - rim + 1 }, to: contactPad, width: D.spurWidth, color: D.accent },
    { room: "RF:cv", from: { x: center.x + rim - 1, z: cvPad.z }, to: cvPad, width: D.spurWidth, color: "#22d3ee" },
    { room: "RF:visits", from: { x: D.visitsSpurFrom.x, z: D.visitsSpurFrom.z }, to: visitsPad, width: D.spurWidth, color: "#a78bfa" },
  ];
  const network: RoadNetwork = { roads: [lead], plazas: [plaza], spurs };
  const doors: DoorTrigger[] = [
    { room: "RF:contact", at: contactPad, facing: { x: 0, z: -1 } },
    { room: "RF:cv", at: cvPad, facing: { x: 1, z: 0 } },
    { room: "RF:visits", at: visitsPad, facing: { x: 0, z: -1 } },
  ];
  const spawn: Vec2 = { x: D.spawn.x, z: D.spawn.z };
  const box = (p: Vec2, r = 2): Rect => ({ minX: p.x - r, maxX: p.x + r, minZ: p.z - r, maxZ: p.z + r });
  const viewZones: ViewZone[] = [
    // Spawn and arrival: turned a little north of the default angle and zoomed out, so the mast, its
    // availability sign and the comms station all fit, also on portrait phones.
    { id: "RF:overview", area: box(spawn, 1.5), yaw: D.overviewYaw, zoom: D.overviewZoom },
    // Comms (facing south): the camera south of the rover, looking north at the station and the channels above it.
    { id: "RF:contact", area: { minX: comms.minX, maxX: comms.maxX, minZ: contactPad.z - 2, maxZ: contactPad.z + 2 }, yaw: -Math.PI / 4 },
    // CV station (facing west): the camera west of the rover, looking east.
    { id: "RF:cv", area: { minX: cvPad.x - 2, maxX: cv.minX, minZ: cv.minZ, maxZ: cv.maxZ }, yaw: (-3 * Math.PI) / 4 },
    // About board (facing north): the camera north of the rover, looking south.
    { id: "RF:about", area: { minX: about.minX, maxX: about.maxX, minZ: stops.about.z - 2, maxZ: about.minZ }, yaw: (3 * Math.PI) / 4 },
    // Availability sign on the mast (facing `signYaw`): the overview angle, looking straight at it.
    { id: "RF:availability", area: box(stops.availability, 1.8), yaw: D.overviewYaw },
    // Visitor Observatory (facing south): the camera south of the rover, looking north at the panel and the globe.
    { id: "RF:visits", area: { minX: visits.minX, maxX: visits.maxX, minZ: visitsPad.z - 2, maxZ: visitsPad.z + 2 }, yaw: -Math.PI / 4 },
  ];
  return {
    floor: {
      id: "RF",
      bounds: plain(D.bounds),
      door: { x: D.door.x, z: D.door.z },
      approach: { x: D.approach.x, z: D.approach.z },
      obstacles: [plain(centerpiece), comms, cv, about, visits],
      tall: [{ ...visits, h: D.visitsHeight }],
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
    visits,
    stops,
    channelSlots: channelSlots(channels),
    callPad: plain(D.callPad),
  };
}

/** Mission and walk stops on the roof (the door pads for RF:contact, RF:cv and RF:visits). */
export const ROOF_STOPS: Record<RoofStop, Vec2> = buildRoofLayout().stops;
