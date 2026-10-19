import type { FloorId, RoomId } from "@/content/schema";
import type { ViewZone } from "../../camera/orbit";
import { ROAD, type Plaza, type Road, type RoadNetwork, type Spur } from "../../nav/road";
import type { DoorTrigger, Rect, Vec2 } from "../../types";
import { LOBBY_SLAB } from "./slab";
import { HIGHLIGHT_STATIONS, highlightRoom, type HighlightStation } from "./stations";

/** Hall west edge and the slab's half depth (floors/lobby/slab.ts): every hall position below is an offset from them. */
const X0 = LOBBY_SLAB.hallX;
const Z = LOBBY_SLAB.halfZ;
/** The lead road's line: 6 u in from the south slab edge, so the gateway's south pillar touches the edge. */
const LEAD_Z = Z - 6;

/**
 * L1 Highlights Hall (owner request, October 2026; more room 2026-10-19): the Lobby slab grows east from
 * `LOBBY_SLAB.hallX` by 36 u. A lead road leaves the Lobby south of the certification wall (which stays
 * untouched and readable from the plaza) into the hall plaza. Four stations stand flush with the slab edges,
 * facing the plaza, in this order: about me (north-west), top projects (north-east), work experience (east),
 * contact (south). Pure: the floor layout, the scenery and the e2e tests read it.
 * Checked by tests/unit/highlights-layout.test.ts (space rules with the real Lobby).
 */
export const HALL = {
  maxX: X0 + 36,
  /** Drives that start or end in here follow the hall road (`FloorLayout.roadZone`); east of the cert wall. */
  zone: { minX: X0 - 1, maxX: X0 + 36, minZ: -Z, maxZ: Z },
  lead: [
    { x: 14, z: LEAD_Z },
    { x: X0 + 8, z: LEAD_Z },
  ],
  /** The plaza keeps 8 u to the north stations, 2 u to the contact station and 3 u to the experience arch. */
  plaza: { x: X0 + 18, z: 3, w: 24, d: 2 * Z - 16 },
  stations: {
    about: { minX: X0 + 4, maxX: X0 + 14, minZ: -Z, maxZ: -Z + 3 },
    projects: { minX: X0 + 20, maxX: X0 + 36, minZ: -Z, maxZ: -Z + 3 },
    experience: { minX: X0 + 33, maxX: X0 + 36, minZ: -8, maxZ: 10 },
    contact: { minX: X0 + 12, maxX: X0 + 26, minZ: Z - 3, maxZ: Z },
  },
  /** Unit direction from each door pad into its station. */
  facing: {
    about: { x: 0, z: -1 },
    projects: { x: 0, z: -1 },
    experience: { x: 1, z: 0 },
    contact: { x: 0, z: 1 },
  },
  /** Station hues, matching the drawer accents (green, violet, amber, blue). */
  tone: { about: "#34d399", projects: "#a78bfa", experience: "#fbbf24", contact: "#60a5fa" },
  padInset: 1.1,
  spurWidth: 4,
  panel: { h: 6, plinth: 0.35, depth: 0.3 },
  /** The passage behind the cert wall: the camera turns to look into the hall. */
  entry: { minX: X0, maxX: X0 + 8, minZ: LEAD_Z - 4, maxZ: LEAD_Z + 4 },
  /**
   * Gateway arch over the lead road where it enters the plaza (gallery rebuild, October 2026): two
   * pillars (the south one touches the slab edge, the north one stays clear of the cert wall), a
   * lintel the rover drives under, and the floating "HIGHLIGHTS HALL" sign above it (nothing on the floor).
   */
  gate: { x: X0 + 5, depth: 1.2, north: { minZ: LEAD_Z - 5.6, maxZ: LEAD_Z - 4.4 }, south: { minZ: LEAD_Z + 4.8, maxZ: Z }, h: 7.4, lintel: 1, signY: 8.1 },
  /** Station camera zoom (the old panel widths over 11, so phone text stays as large as before the gallery). */
  zoom: { about: 1, projects: 1.45, experience: 1.5, contact: 1.27 },
  /** Height of each station's shape (point-and-go pick volume, camera collision). */
  height: { about: 6.4, projects: 7.6, experience: 7.4, contact: 9.6 },
  /** Screenshots load once the rover is east of here on L1. */
  lazyX: X0 - 10,
} as const;

export interface HallStation {
  station: HighlightStation;
  room: RoomId;
  rect: Rect;
  /** Unit direction from the pad into the station (`DoorTrigger.facing`). */
  facing: Vec2;
  /** Middle of the station's front edge (the panel face). */
  front: Vec2;
  /** Door pad center, `HALL.padInset` in front of the station. */
  pad: Vec2;
  /** Panel width along its face. */
  width: number;
  /** Yaw that turns a label's +z toward the plaza (`BatchedLabel.yaw`). */
  yaw: number;
  /** The reader's right along the face (left to right as read). */
  right: Vec2;
}

export interface HighlightsHallLayout {
  stations: HallStation[];
  network: RoadNetwork;
  doors: DoorTrigger[];
  obstacles: Rect[];
  viewZones: ViewZone[];
  zone: Rect;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function buildStation(name: HighlightStation): HallStation {
  const r = HALL.stations[name];
  const f = HALL.facing[name];
  const center = { x: (r.minX + r.maxX) / 2, z: (r.minZ + r.maxZ) / 2 };
  const halfAlong = (Math.abs(f.x) * (r.maxX - r.minX) + Math.abs(f.z) * (r.maxZ - r.minZ)) / 2;
  const front = { x: center.x - f.x * halfAlong, z: center.z - f.z * halfAlong };
  return {
    station: name,
    room: highlightRoom(name),
    rect: { minX: r.minX, maxX: r.maxX, minZ: r.minZ, maxZ: r.maxZ },
    facing: { x: f.x, z: f.z },
    front,
    pad: { x: front.x - f.x * HALL.padInset, z: front.z - f.z * HALL.padInset },
    width: Math.abs(f.z) * (r.maxX - r.minX) + Math.abs(f.x) * (r.maxZ - r.minZ),
    // `0 - v` keeps +0 where v is 0 (no -0 in yaws and vectors).
    yaw: Math.atan2(0 - f.x, 0 - f.z),
    right: { x: 0 - f.z, z: f.x },
  };
}

/** Camera zone in front of a station: from its face 3 u back past the pad, across its width; the follow camera turns to face it head on. */
function stationZone(s: HallStation): ViewZone {
  const back = { x: s.pad.x - s.facing.x * 3, z: s.pad.z - s.facing.z * 3 };
  const across = { x: Math.abs(s.right.x) * (s.width / 2), z: Math.abs(s.right.z) * (s.width / 2) };
  return {
    id: s.room,
    area: {
      minX: Math.min(s.front.x, back.x) - across.x,
      maxX: Math.max(s.front.x, back.x) + across.x,
      minZ: Math.min(s.front.z, back.z) - across.z,
      maxZ: Math.max(s.front.z, back.z) + across.z,
    },
    // The default camera looks along (-1, -1): turning by (face yaw - PI/4) puts it on the plaza side.
    yaw: s.yaw - Math.PI / 4,
    zoom: HALL.zoom[s.station],
  };
}

/** The gateway arch pillars (obstacles; the opening between them carries the lead road). */
export function gatePillars(): Rect[] {
  const g = HALL.gate;
  const x = { minX: g.x - g.depth / 2, maxX: g.x + g.depth / 2 };
  return [
    { ...x, ...g.north },
    { ...x, ...g.south },
  ];
}

export function buildHighlightsHall(): HighlightsHallLayout {
  const stations = HIGHLIGHT_STATIONS.map(buildStation);
  const P = HALL.plaza;
  const plaza: Plaza = { id: "hall", center: { x: P.x, z: P.z }, w: P.w, d: P.d };
  const lead: Road = { id: "hall-lead", points: HALL.lead.map((p) => ({ x: p.x, z: p.z })), width: ROAD.minWidth };
  // Each spur starts 1 u inside the plaza, on the pad's line.
  const inside = (p: Vec2): Vec2 => ({ x: clamp(p.x, P.x - P.w / 2 + 1, P.x + P.w / 2 - 1), z: clamp(p.z, P.z - P.d / 2 + 1, P.z + P.d / 2 - 1) });
  const spurs: Spur[] = stations.map((s) => ({ room: s.room, from: inside(s.pad), to: s.pad, width: HALL.spurWidth, color: HALL.tone[s.station] }));
  return {
    stations,
    network: { roads: [lead], plazas: [plaza], spurs },
    doors: stations.map((s) => ({ room: s.room, at: s.pad, facing: s.facing })),
    obstacles: [...stations.map((s) => s.rect), ...gatePillars()],
    viewZones: [{ id: "L1:highlights-entry", area: { ...HALL.entry }, yaw: -Math.PI / 2, zoom: 1.3 }, ...stations.map(stationZone)],
    zone: { ...HALL.zone },
  };
}

export const HALL_LAYOUT = buildHighlightsHall();

export function stationOf(name: HighlightStation): HallStation {
  return HALL_LAYOUT.stations.find((s) => s.station === name)!;
}

/** The screenshot atlas loads once the rover is on L1 and east of `HALL.lazyX` (heading for the hall). */
export function shouldLoadShots(floor: FloorId, x: number): boolean {
  return floor === "L1" && x > HALL.lazyX;
}
