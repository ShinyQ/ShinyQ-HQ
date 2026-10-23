import type { FloorId } from "@/content/schema";
import { PUBLIC_FLOORS } from "@/lib/floors";
import { ARRIVAL_YAW } from "./camera/look";
import { FLOOR_IDS, floorIndex } from "./floorOrder";
import type { ViewZone } from "./camera/orbit";
import { buildCareerRoad } from "./floors/career/layout";
import { buildEngineLayout, ENGINE } from "./floors/engine/layout";
import { buildLabsLayout } from "./floors/labs/layout";
import { buildLibraryLayout } from "./floors/library/layout";
import { hallTall } from "./floors/lobby/hallGallery";
import { HALL, HALL_LAYOUT } from "./floors/lobby/hallLayout";
import { lobbyObservatory } from "./floors/lobby/observatoryLayout";
import { officeObstacles, officeRoad, officeStops, officeTall, officeTowerTall, officeWing, officeZone } from "./floors/lobby/officeLayout";
import {
  KIOSK_AXIS,
  KIOSK_CENTER,
  KIOSK_DEPTH,
  KIOSK_STOP_GAP,
  KIOSK_WIDTH,
  LOBBY_HOLOGRAM,
  LOBBY_OBSERVATORY,
  LOBBY_SOUTH_EDGE,
  LOBBY_SPAWN,
  LOBBY_SPAWN_HEADING,
} from "./floors/lobby/spawn";
import { LOBBY_SLAB } from "./floors/lobby/slab";
import { buildRoofLayout } from "./floors/roof/layout";
import { returnPad } from "./nav/fastReturn";
import { elevatorPad } from "./nav/pads";
import type { FloorLayout, LayoutExtras, Rect, Vec2 } from "./types";

/** Tower constants from spec appendix 01 section 1. */
export const FLOOR_GAP = 14;
/** The floor order lives in floorOrder.ts (light: the store and the Classic HUD read it); re-exported here. */
export { FLOOR_IDS, floorIndex, READY_FLOORS } from "./floorOrder";
export const SLAB_THICKNESS = 0.4;

export const SHAFT = { x: -28, z: 0, size: 6 } as const;
export const SHAFT_EAST_FACE = SHAFT.x + SHAFT.size / 2;
export const CAR: Vec2 = { x: SHAFT.x, z: SHAFT.z };

/** Floor accent colors (appendix 05). */
export const FLOOR_COLOR: Record<FloorId, string> = {
  B1: ENGINE.accent,
  L1: "#34d399",
  L2: "#fbbf24",
  L3: "#a78bfa",
  L4: "#e5e7eb",
  RF: "#60a5fa",
};

export const COLORS = {
  void: "#05050c",
  vignette: "#1e1b4b",
  grid: "#6366f1",
  lane: "#818cf8",
  packet: "#c7d2fe",
  cyan: "#22d3ee",
  violet: "#a78bfa",
  pink: "#f472b6",
  green: "#34d399",
  amber: "#fbbf24",
  white: "#e5e7eb",
  terminalBg: "#03140e",
  terminalFg: "#34d399",
} as const;

/** Rover tuning (appendix 03 section 1). */
export const ROVER = {
  maxSpeedFine: 9,
  maxSpeedCoarse: 8,
  autopilotSpeed: 12,
  accel: 18,
  braking: 26,
  turnRate: 3.5,
  radius: 1,
  maxTilt: (8 * Math.PI) / 180,
} as const;

/** Height of a floor's slab top: L1 stays at 0, so every public floor keeps its height and B1 sits one gap below. */
export function floorY(id: FloorId): number {
  return (floorIndex(id) - floorIndex("L1")) * FLOOR_GAP;
}

/** The floors the tower draws and the elevator serves: B1 only once it is unlocked (store `b1Unlocked`). */
export function towerFloors(b1Unlocked: boolean): readonly FloorId[] {
  return b1Unlocked ? FLOOR_IDS : PUBLIC_FLOORS;
}

/** The glass shaft's span for the floors the tower draws: from under the lowest slab to 8 u above the roof. */
export function shaftSpan(floors: readonly FloorId[]): { bottom: number; height: number } {
  const bottom = Math.min(...floors.map(floorY)) - SLAB_THICKNESS;
  return { bottom, height: floorY("RF") + 8 - bottom };
}

const rect = (cx: number, cz: number, w: number, d: number): Rect => ({
  minX: cx - w / 2,
  maxX: cx + w / 2,
  minZ: cz - d / 2,
  maxZ: cz + d / 2,
});

/**
 * The plaza ends at `LOBBY_SLAB.hallX`; the Highlights Hall (floors/lobby/hallLayout.ts) extends the slab east to
 * `HALL.maxX`. The slab is `LOBBY_SLAB.halfZ` deep on each side of the elevator axis (more room 2026-10-19).
 */
const LOBBY_BOUNDS = { minX: LOBBY_SLAB.minX, maxX: HALL.maxX, minZ: -LOBBY_SLAB.halfZ, maxZ: LOBBY_SOUTH_EDGE } as const;
/** Walkable lane ring around the hologram (more room 2026-10-19: 12 to 13.5). */
const LANE_RADIUS = 13.5;

/** Certification wall arc radius around the hologram (more room 2026-10-19: 19.6 to 23.5); floors/lobby/layout.ts `CERT_WALL`. */
const CERT_RADIUS = 23.5;

/**
 * Lobby element positions (appendix 01 section 2). The plaza sits east of the elevator, centered on
 * its axis (z = 0, like the door at (-24, 0)), so the lane ring and the slab line up with the
 * elevator; the walls keep a clear walkway (at least 6 u, owner "more room" 2026-10-19) outside the
 * lane ring. See tests/unit/lobby-layout.test.ts.
 */
export const LOBBY = {
  bounds: LOBBY_BOUNDS,
  /** Session spawn: the kiosk stop, in front of the Rover menu screen (floors/lobby/kiosk.ts `kioskStop`). */
  spawn: LOBBY_SPAWN,
  /** The rover faces the kiosk screen at spawn: heading (sin, cos) along the kiosk axis. */
  spawnHeading: LOBBY_SPAWN_HEADING,
  /**
   * Elevator arrivals (Round 8 J, like L3) roll on east along the elevator axis to (-6, 0), 12 u west of the
   * hologram, just inside the lane ring's west point (more room 2026-10-19 widened the ring, not this view); the
   * camera stands behind the rover and `ELEVATOR_DIAGONAL` to its right (owner 2026-10-23) and looks at the profile
   * hologram, the name above it and the stats ring around it. Zooms stay inside `shaftClearZoom` (the camera east of
   * the glass shaft); a portrait phone also aims `arrivalAimPhone` u to the right, so the whole name stays in frame beside the rover.
   */
  arrival: { x: -6, z: 0 } as Vec2,
  arrivalZoom: 1.03,
  arrivalZoomPhone: 1.03,
  arrivalAimPhone: 4.75,
  hologram: LOBBY_HOLOGRAM,
  /**
   * Name and headline float above the stats tiles and the rover mark (both top out below 5.85), low and
   * small enough that the name clears the HUD top bar at 1440 x 900 (tests/unit/lobby-title.test.ts).
   */
  titleY: 6.4,
  titleFont: { name: 0.58, headline: 0.3, gap: 0.12 },
  statsRadius: 11,
  /** Tiles float above the rover (about 2.8 u tall), so the walkable ring never clips them. */
  statsTile: { w: 3.4, h: 1.9, y: 4.25, stagger: 0.5 },
  /**
   * Raised on a 0.35 u glowing plinth (`d` + 0.4 deep, SkillsWall.tsx) whose back touches the north slab edge; 40 u
   * wide for 4 by 2 groups. The obstacle is the plinth's footprint (`skillsWallRect`). h is the drawn
   * height (skillsWallLayout) for today's skills, used by the hit box and bounds; a unit test fails when content
   * grows the wall past it.
   */
  skillsWall: { x: 6, z: -LOBBY_SLAB.halfZ + 0.7, w: 40, d: 1, h: 11.25, plinth: 0.35 },
  /**
   * Footprint of the curved certification wall (floors/lobby/layout.ts CERT_WALL, an arc of `radius` around the
   * hologram): the obstacle and view zone use it.
   */
  certWall: { x: LOBBY_HOLOGRAM.x + CERT_RADIUS - 0.6, z: 0, w: 2.4, d: 18, h: 6.2, radius: CERT_RADIUS },
  /**
   * Rover menu kiosk on the kiosk axis, turned to face the hologram (`yaw`, forward is (sin, cos)); `depth`
   * runs along the axis, `width` across it (the screen). floors/lobby/kiosk.ts builds its parts and bounds.
   */
  kiosk: { x: KIOSK_CENTER.x, z: KIOSK_CENTER.z, yaw: Math.atan2(-KIOSK_AXIS.x, -KIOSK_AXIS.z), depth: KIOSK_DEPTH, width: KIOSK_WIDTH, stopGap: KIOSK_STOP_GAP },
  kioskAxis: KIOSK_AXIS,
  /** Visitor Observatory (`L1:visits`) footprint; `h` is the globe top, a camera collision column. */
  observatory: { ...LOBBY_OBSERVATORY, h: 7.4 },
  laneRadius: LANE_RADIUS,
  /**
   * The Agent Office wing (owner decision 2026-10-20): a slab wing south of the Lobby with its lead road, plaza and
   * stop, all derived from the Lobby's south edge (floors/lobby/officeLayout.ts `OFFICE_WING`), so it moves with it.
   */
  officeWing: officeWing(LOBBY_BOUNDS.maxZ),
} as const;

/** Rover height used for clearance checks (antenna tip included). */
export const ROVER_HEIGHT = 2.8;

/** L2 corridor length for the placeholder: from x = -20 to -20 + 14 * years + 20. */
export function corridorEnd(yearCount: number): number {
  return -20 + 14 * Math.max(1, yearCount) + 20;
}

function standard(id: FloorId, bounds: Rect, obstacles: Rect[] = [], spawn?: Vec2): FloorLayout {
  const doorX = -24;
  const approach = { x: doorX + 3, z: 0 };
  return {
    id,
    bounds,
    door: { x: doorX, z: 0 },
    approach,
    obstacles,
    spawn: spawn ?? approach,
    accent: FLOOR_COLOR[id],
  };
}

/** L2: the Career Road when its data is known, else the placeholder corridor. */
function careerLayout(yearCount: number, extras: LayoutExtras): FloorLayout {
  if (!extras.career) return standard("L2", { minX: -24, maxX: corridorEnd(yearCount), minZ: -14, maxZ: 14 });
  const road = buildCareerRoad(extras.career);
  return {
    ...standard("L2", road.bounds, road.obstacles),
    arrival: road.arrival,
    doors: road.doors,
    scrubStops: road.stops,
    road: road.network,
    pads: road.pads,
    returnPad: road.returnPad,
    stops: road.roomStops,
    tall: road.tall,
    viewZones: road.viewZones,
  };
}

/**
 * Elevator pad icon yaw per floor: toward the L2 rail camera (+z), elsewhere east, where the follow
 * camera sits when the rover drives up to the shaft.
 */
const ELEVATOR_PAD_FACE: Record<FloorId, number> = { B1: Math.PI / 2, L1: Math.PI / 2, L2: 0, L3: Math.PI / 2, L4: Math.PI / 2, RF: Math.PI / 2 };

/** Return pad icon yaw: toward the L2 rail camera (+z), elsewhere west, where the follow camera sits when the rover heads east to a floor's far end. */
const RETURN_PAD_FACE: Record<FloorId, number> = { B1: -Math.PI / 2, L1: -Math.PI / 2, L2: 0, L3: -Math.PI / 2, L4: -Math.PI / 2, RF: -Math.PI / 2 };

/**
 * Every floor gets the elevator call pad on its approach (3 u in front of the shaft door, so it follows
 * the door constants), then its Express Return pad when the layout sets `returnPad` (fast return), then
 * the floor's own pads (the L2 year teleporters).
 */
function withFloorPads(layout: FloorLayout): FloorLayout {
  const back = returnPad(layout, RETURN_PAD_FACE[layout.id]);
  return { ...layout, pads: [elevatorPad(layout, ELEVATOR_PAD_FACE[layout.id]), ...(back ? [back] : []), ...(layout.pads ?? [])] };
}

/** The Lobby arrival view: behind and to the right of a rover heading east, looking at the hologram (`travel`: eastbound rovers only). */
function lobbyArrivalZone(): ViewZone {
  const { arrival: a } = LOBBY;
  return {
    id: "L1:arrival",
    area: { minX: a.x - 2, maxX: a.x + 2, minZ: a.z - 2, maxZ: a.z + 2 },
    yaw: ARRIVAL_YAW,
    zoom: LOBBY.arrivalZoom,
    classView: { mobile: { zoom: LOBBY.arrivalZoomPhone, lookOffset: { right: LOBBY.arrivalAimPhone } } },
    travel: { x: 1, z: 0 },
    arrivalOnly: true,
  };
}

/** The skills wall's obstacle: its plinth's footprint (0.2 u deeper than the wall on each side), flush with the north slab edge. */
export function skillsWallRect(): Rect {
  const { x, z, w, d } = LOBBY.skillsWall;
  return rect(x, z, w, d + 0.4);
}

/** Axis-aligned bounds of the turned kiosk footprint (its obstacle and point-and-go bounds). */
export function kioskRect(): Rect {
  const { x, z, yaw, depth, width } = LOBBY.kiosk;
  const fx = Math.abs(Math.sin(yaw));
  const fz = Math.abs(Math.cos(yaw));
  return rect(x, z, fx * depth + fz * width, fz * depth + fx * width);
}

/** Floor-local layouts. Floors without content yet are placeholder slabs. `extras` carries per-floor inputs. */
export function buildFloorLayouts(yearCount: number, extras: LayoutExtras = {}): Record<FloorId, FloorLayout> {
  const { hologram, certWall, observatory: o, officeWing: wing } = LOBBY;
  const office = officeRoad(wing);
  const observatory = lobbyObservatory({ rect: o, spawn: LOBBY.spawn, axis: LOBBY.kioskAxis });
  const layouts: Record<FloorId, FloorLayout> = {
    // B1 Engine Room: the aisle, seven bays and the workbench (floors/engine/layout.ts).
    B1: buildEngineLayout().floor,
    L1: {
      ...standard(
        "L1",
        LOBBY.bounds,
        [
          rect(hologram.x, hologram.z, hologram.radius * 2, hologram.radius * 2),
          skillsWallRect(),
          rect(certWall.x, certWall.z, certWall.w, certWall.d),
          kioskRect(),
          ...HALL_LAYOUT.obstacles,
          { minX: o.minX, maxX: o.maxX, minZ: o.minZ, maxZ: o.maxZ },
          // Agent Office wing: the desk row (three touching boxes), the screen wall, the CI tower and the ship dock (floors/lobby/officeLayout.ts).
          ...officeObstacles(wing),
        ],
        LOBBY.spawn,
      ),
      arrival: LOBBY.arrival,
      wings: [wing.rect],
      // From the office wing the camera looks south under the L2 slab edge: the floors above drop their ghost outline there.
      hideGhostAbove: [wing.rect],
      // Highlights Hall: station doors, the passage road (used only for drives into or out of the hall) and camera
      // zones; the Visitor Observatory's door and the spawn and observatory views (floors/lobby/observatoryLayout.ts);
      // the elevator arrival view.
      doors: [...HALL_LAYOUT.doors, observatory.door],
      // The office wing's lead road and plaza join the hall's network (two separate parts; `roadRoute` drives between them).
      road: { ...HALL_LAYOUT.network, roads: [...HALL_LAYOUT.network.roads, office.road], plazas: [...HALL_LAYOUT.network.plazas, office.plaza] },
      roadZone: [HALL_LAYOUT.zone, wing.rect, wing.leadSpan],
      viewZones: [...HALL_LAYOUT.viewZones, ...observatory.zones, lobbyArrivalZone(), officeZone(wing)],
      // Every Agent Office room drives to the office stop (the rooms have no door).
      stops: officeStops(wing),
      // Gallery shapes taller than the camera clearance (gateway arch, monoliths, experience arch, beacon, contact
      // card), the observatory globe, the Agent Office screen wall and its CI tower column.
      tall: [...hallTall(), LOBBY.observatory, officeTall(wing), officeTowerTall(wing)],
    },
    L2: careerLayout(yearCount, extras),
    // Project Roads: hub plaza in front of the shaft door, wing roads looping east (walkable floors plan).
    L3: buildLabsLayout(extras.labs ?? []).floor,
    // Writing: the owner's pick from the L4 concepts (walkable floors plan, part 3).
    L4: buildLibraryLayout(extras.library).floor,
    // RF roof deck: lead road, round plaza, comms and CV stations, free call pad (RF revamp plan).
    RF: buildRoofLayout().floor,
  };
  return Object.fromEntries(FLOOR_IDS.map((id) => [id, withFloorPads(layouts[id])])) as Record<FloorId, FloorLayout>;
}
