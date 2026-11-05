import type { FloorId, RoomId } from "@/content/schema";
import type { ViewZone } from "../../camera/orbit";
import { ROAD, type Plaza, type Road, type RoadNetwork, type Spur } from "../../nav/road";
import type { DoorTrigger, Rect, Vec2 } from "../../types";
import { OFFICE_WING } from "./officeLayout";
import { LOBBY_SLAB } from "./slab";
import { HIGHLIGHT_STATIONS, highlightRoom, type HighlightStation } from "./stations";

/** Hall west edge and the slab's half depth (floors/lobby/slab.ts): every hall position below is an offset from them. */
const X0 = LOBBY_SLAB.hallX;
const Z = LOBBY_SLAB.halfZ;
/** The lead road's line: 6 u in from the Lobby's south edge line (S), where the gateway's south pillar ends. */
const LEAD_Z = Z - 6;
/** The floor's south edge (the office wing's): the hall runs the slab's full depth (owner decision 2026-11-02). */
const SOUTH = Z + OFFICE_WING.depth;

/**
 * L1 Highlights Hall (owner request, October 2026; more room 2026-10-19; the slab's full depth 2026-11-02): the Lobby
 * slab grows east from `LOBBY_SLAB.hallX` by 36 u, and the hall runs from the north slab edge to the floor's south edge.
 * A lead road leaves the Lobby south of the certification wall (which stays untouched and readable from the plaza) into
 * the hall plaza through the gateway arch: the only way in (owner decision 2026-11-04; low glass partitions close the hall's
 * west edge, so the hall is a dead-end gallery). Seven stations stand flush with the slab edges,
 * facing the plaza, in this order: about me (north-west), top projects (north-east), work experience, wins and now (east),
 * results (south-east), contact (south-west). Pure: the floor layout, the scenery and the e2e tests read it.
 * Checked by tests/unit/highlights-layout.test.ts (space rules with the real Lobby).
 */
export const HALL = {
  maxX: X0 + 36,
  /** The floor's south edge, where the hall's south stations stand. */
  south: SOUTH,
  /** Drives that start or end in here follow the hall road (`FloorLayout.roadZone`); east of the cert wall. */
  zone: { minX: X0 - 1, maxX: X0 + 36, minZ: -Z, maxZ: SOUTH },
  /**
   * Starts 6 u east of the Agent Office wing's east edge (`OFFICE_WING.maxX`, the wing hangs off the south slab edge), so the
   * road's driving width keeps 6 u from the wing's north-east corner (owner, 2026-10-19).
   */
  lead: [
    { x: OFFICE_WING.maxX + 6, z: LEAD_Z },
    { x: X0 + 8, z: LEAD_Z },
  ],
  /** The plaza runs the hall's depth: 8 u from the north stations, 6 u from the south ones and 3 u from the east ones. */
  plaza: { x: X0 + 18, z: (-Z + 11 + SOUTH - 9) / 2, w: 24, d: SOUTH - 9 - (-Z + 11) },
  stations: {
    // 0.75 u east of its first place (owner, 2026-11-04: clear of the west wall); a wing wall fills the gap to the partition.
    about: { minX: X0 + 5.5, maxX: X0 + 14, minZ: -Z, maxZ: -Z + 3 },
    projects: { minX: X0 + 20, maxX: X0 + 36, minZ: -Z, maxZ: -Z + 3 },
    experience: { minX: X0 + 33, maxX: X0 + 36, minZ: -8, maxZ: 10 },
    wins: { minX: X0 + 33, maxX: X0 + 36, minZ: Z - 11, maxZ: Z - 1 },
    now: { minX: X0 + 33, maxX: X0 + 36, minZ: Z + 5, maxZ: Z + 19 },
    results: { minX: X0 + 20, maxX: X0 + 36, minZ: SOUTH - 3, maxZ: SOUTH },
    // Inside the west wall's line since the gate moved onto it (2026-11-04): 10 u wide, the beacon and card closer.
    contact: { minX: X0 + 4, maxX: X0 + 14, minZ: SOUTH - 3, maxZ: SOUTH },
  },
  /** Unit direction from each door pad into its station. */
  facing: {
    about: { x: 0, z: -1 },
    projects: { x: 0, z: -1 },
    experience: { x: 1, z: 0 },
    wins: { x: 1, z: 0 },
    now: { x: 1, z: 0 },
    results: { x: 0, z: 1 },
    contact: { x: 0, z: 1 },
  },
  /** Station accents in the B4 palette (owner decision 2026-11-04): cyan for odd station numbers, violet for even. */
  tone: { about: "#6ee7ff", projects: "#a78bfa", experience: "#6ee7ff", wins: "#a78bfa", now: "#6ee7ff", results: "#a78bfa", contact: "#6ee7ff" },
  padInset: 1.1,
  spurWidth: 4,
  panel: { h: 6, plinth: 0.35, depth: 0.3 },
  /** The passage behind the cert wall: the camera turns to look into the hall. */
  entry: { minX: X0, maxX: X0 + 8, minZ: LEAD_Z - 4, maxZ: LEAD_Z + 4 },
  /**
   * Gateway arch over the lead road where it enters the plaza (gallery rebuild, October 2026): two
   * pillars (the north one stays clear of the cert wall, the south one reaches the Lobby's south edge line), a lintel the
   * rover drives under, and the floating "HIGHLIGHTS HALL" sign above it (nothing on the floor). At x 36.8 since
   * 2026-11-04, on the west wall's line (36 from 2026-11-02, 38 before).
   */
  gate: { x: X0 + 3.8, depth: 1.2, north: { minZ: LEAD_Z - 5.6, maxZ: LEAD_Z - 4.4 }, south: { minZ: LEAD_Z + 4.8, maxZ: Z }, h: 7.4, lintel: 1, signY: 8.1 },
  /** Station camera zoom (the old panel widths over 11, so phone text stays as large as before the gallery). */
  zoom: { about: 1, projects: 1.45, experience: 1.5, wins: 1, now: 1.2, results: 1.45, contact: 1 },
  /** Height of each station's shape (point-and-go pick volume, camera collision). */
  height: { about: 6.4, projects: 7.6, experience: 7.4, wins: 6.4, now: 6.4, results: 7.6, contact: 9.6 },
  /**
   * Low glass partitions close the hall's west side on one straight line through the gateway arch (owner decisions
   * 2026-11-04: one gate; then "the wall and the door" flush, nothing further forward than the rest): x 36.6 to 37, 6.5 u
   * clear of the certification wall, from the north slab edge to the contact station, the gate's pillars set into it.
   * Obstacles and navgrid blockers, low and translucent so the certification wall stays readable from the plaza; not
   * camera columns.
   */
  partition: { line: X0 + 3.6, thickness: 0.4, height: 2.4 },
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
  /**
   * The routing network (`FloorLayout.road`): the lead road runs on to the spine, a road down the plaza's long axis, and a
   * short approach road leads from the spine to every spur's start, so a drive between two stations crosses the plaza
   * along it instead of through one hub at the plaza's centre (the hall runs the slab's full depth since 2026-11-02).
   */
  network: RoadNetwork;
  /**
   * What the hall draws (`RoadMarkings`): the lead road from the Lobby up to the gateway arch only. Inside, the hall's
   * own runway, floor grid and door-pad halos mark the way (B4, owner decision 2026-11-04).
   */
  drawn: RoadNetwork;
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

/**
 * The west-side partitions (obstacles and navgrid blockers), on one line through the gateway: the north run (north slab
 * edge through the north pillar), the south run (through the south pillar to the south slab edge, beside the contact
 * station) and the wing wall
 * from the line to the about station.
 */
export function hallPartitions(): Rect[] {
  const P = HALL.partition;
  const g = HALL.gate;
  const x = { minX: P.line, maxX: P.line + P.thickness };
  return [
    { ...x, minZ: HALL.zone.minZ, maxZ: g.north.maxZ },
    { ...x, minZ: g.south.minZ, maxZ: HALL.zone.maxZ },
    { minX: x.maxX, maxX: HALL.stations.about.minX, minZ: HALL.zone.minZ, maxZ: HALL.stations.about.maxZ },
  ];
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
  // Routing only: the spine from 1 u inside the plaza's north edge to 1 u inside its south edge, the lead road run on to it
  // (a T junction), and an approach road from the spine to every spur's start (a T junction or the spine's end).
  const top = P.z - P.d / 2 + 1;
  const bottom = P.z + P.d / 2 - 1;
  const spine: Road = { id: "hall-spine", points: [{ x: P.x, z: top }, { x: P.x, z: bottom }], width: ROAD.minWidth };
  const leadOn: Road = { ...lead, points: [lead.points[0], { x: P.x, z: lead.points[lead.points.length - 1].z }] };
  const approaches: Road[] = spurs.map((sp) => ({ id: `hall-to-${sp.room.slice(3)}`, points: [{ x: P.x, z: clamp(sp.from.z, top, bottom) }, { x: sp.from.x, z: sp.from.z }], width: ROAD.minWidth }));
  return {
    stations,
    network: { roads: [leadOn, spine, ...approaches], plazas: [plaza], spurs },
    drawn: { roads: [{ ...lead, points: [lead.points[0], { x: HALL.gate.x, z: lead.points[0].z }] }], plazas: [], spurs: [] },
    doors: stations.map((s) => ({ room: s.room, at: s.pad, facing: s.facing })),
    obstacles: [...stations.map((s) => s.rect), ...gatePillars(), ...hallPartitions()],
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
