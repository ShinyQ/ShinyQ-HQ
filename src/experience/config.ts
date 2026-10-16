import type { FloorId } from "@/content/schema";
import { yawLooking } from "./camera/look";
import type { ViewZone } from "./camera/orbit";
import { buildCareerRoad } from "./floors/career/layout";
import { buildLabsLayout } from "./floors/labs/layout";
import { buildLibraryLayout } from "./floors/library/layout";
import { hallTall } from "./floors/lobby/hallGallery";
import { HALL, HALL_LAYOUT } from "./floors/lobby/hallLayout";
import { lobbyObservatory } from "./floors/lobby/observatoryLayout";
import { buildRoofLayout } from "./floors/roof/layout";
import { returnPad } from "./nav/fastReturn";
import { elevatorPad } from "./nav/pads";
import type { FloorLayout, LayoutExtras, Rect, Vec2 } from "./types";

/** Tower constants from spec appendix 01 section 1. */
export const FLOOR_GAP = 14;
export const FLOOR_IDS = ["L1", "L2", "L3", "L4", "RF"] as const satisfies readonly FloorId[];
export const SLAB_THICKNESS = 0.4;

/** Floors whose 3D content is built. Others are placeholders and keep the URL at /{locale}. */
export const READY_FLOORS: readonly FloorId[] = ["L1", "L2", "L3", "L4", "RF"];

export const SHAFT = { x: -28, z: 0, size: 6 } as const;
export const SHAFT_EAST_FACE = SHAFT.x + SHAFT.size / 2;
export const CAR: Vec2 = { x: SHAFT.x, z: SHAFT.z };

/** Floor accent colors (appendix 05). */
export const FLOOR_COLOR: Record<FloorId, string> = {
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

export function floorIndex(id: FloorId): number {
  return FLOOR_IDS.indexOf(id);
}

export function floorY(id: FloorId): number {
  return floorIndex(id) * FLOOR_GAP;
}

export function floorAt(index: number): FloorId | undefined {
  return FLOOR_IDS[index];
}

const rect = (cx: number, cz: number, w: number, d: number): Rect => ({
  minX: cx - w / 2,
  maxX: cx + w / 2,
  minZ: cz - d / 2,
  maxZ: cz + d / 2,
});

const LOBBY_HOLOGRAM = { x: 6, z: 0, radius: 3 } as const;
/**
 * Visitor Observatory footprint (public visit stats, owner decision 2026-10-14): the south-west corner,
 * flush with the west and south slab edges, between the elevator and the Ask Rover kiosk.
 */
const LOBBY_OBSERVATORY = { minX: -24, maxX: -18, minZ: 14, maxZ: 21 } as const;
/**
 * The kiosk axis (owner review 2026-10-14: "the rover kiosk not straight line into the circle"): the unit
 * direction from the hologram to the observatory. The kiosk sits on it facing the hologram, its lane spoke
 * runs along it from the ring into the kiosk front, and the session spawn stands on it in front of the
 * screen, so the spawn view looks down one line: hologram, rover, kiosk, observatory.
 */
const KIOSK_AXIS: Vec2 = (() => {
  const dx = (LOBBY_OBSERVATORY.minX + LOBBY_OBSERVATORY.maxX) / 2 - LOBBY_HOLOGRAM.x;
  const dz = (LOBBY_OBSERVATORY.minZ + LOBBY_OBSERVATORY.maxZ) / 2 - LOBBY_HOLOGRAM.z;
  const l = Math.hypot(dx, dz);
  return { x: dx / l, z: dz / l };
})();
/** Kiosk center distance from the hologram along the axis, its depth (along the axis) and width (the screen). */
const KIOSK_RADIUS = 19.2;
const KIOSK_DEPTH = 2;
const KIOSK_WIDTH = 3.4;
/**
 * The rover stops this far in front of the screen (point-and-go `L1:kiosk:ask-rover`, the session spawn):
 * 0.5 u more than when the kiosk stood square to the grid, because its obstacle is the axis-aligned box
 * of the turned footprint, whose corner reaches toward the stop.
 */
const KIOSK_STOP_GAP = 3;
const onAxis = (d: number): Vec2 => ({ x: LOBBY_HOLOGRAM.x + KIOSK_AXIS.x * d, z: LOBBY_HOLOGRAM.z + KIOSK_AXIS.z * d });
const KIOSK_CENTER = onAxis(KIOSK_RADIUS);
/** Owner 2026-10-14: "first rover placement should be infront of his kiosk". */
const LOBBY_SPAWN = onAxis(KIOSK_RADIUS - KIOSK_DEPTH / 2 - KIOSK_STOP_GAP);

/**
 * Lobby element positions (appendix 01 section 2). The plaza sits east of the elevator, centered on
 * its axis (z = 0, like the door at (-24, 0)), so the lane ring and the slab line up with the
 * elevator; the walls keep a clear walkway (at least 4 u) outside the lane ring. See
 * tests/unit/lobby-layout.test.ts.
 */
export const LOBBY = {
  /** The plaza ends at x = 28; the Highlights Hall (floors/lobby/hallLayout.ts) extends the slab east to `HALL.maxX`. */
  bounds: { minX: -24, maxX: HALL.maxX, minZ: -21, maxZ: 21 },
  /** Session spawn: the kiosk stop, in front of the Ask Rover screen (floors/lobby/kiosk.ts `kioskStop`). */
  spawn: LOBBY_SPAWN,
  /** The rover faces the kiosk screen at spawn: heading (sin, cos) along the kiosk axis. */
  spawnHeading: Math.atan2(KIOSK_AXIS.x, KIOSK_AXIS.z),
  /**
   * Elevator arrivals (Round 8 J, like L3) roll on east along the elevator axis to the west point of the lane
   * ring; the camera stands behind the rover and looks east at the profile hologram, the name above it and the
   * stats ring around it. Zooms: the widest view whose camera stays east of the glass shaft (`shaftClearZoom`).
   */
  arrival: { x: -6, z: 0 } as Vec2,
  arrivalZoom: 1.03,
  arrivalZoomPhone: 0.88,
  hologram: LOBBY_HOLOGRAM,
  /**
   * Name and headline float above the stats tiles and the rover mark (both top out below 5.85), low and
   * small enough that the name clears the HUD top bar at 1440 x 900 (tests/unit/lobby-title.test.ts).
   */
  titleY: 6.4,
  titleFont: { name: 0.58, headline: 0.3, gap: 0.12 },
  statsRadius: 10,
  /** Tiles float above the rover (about 2.8 u tall), so the walkable ring never clips them. */
  statsTile: { w: 3.4, h: 1.9, y: 4.25, stagger: 0.5 },
  /** Raised on a 0.35 u glowing plinth; 8.5 u tall so the longest column (12 items) reads at a larger size. */
  skillsWall: { x: 6, z: -18.5, w: 40, d: 1, h: 8.5, plinth: 0.35 },
  /** Footprint of the curved certification wall (floors/lobby/layout.ts CERT_WALL): the obstacle and view zone use it. */
  certWall: { x: 25, z: 0, w: 2.4, d: 18, h: 6.2 },
  /**
   * Ask Rover kiosk on the kiosk axis, turned to face the hologram (`yaw`, forward is (sin, cos)); `depth`
   * runs along the axis, `width` across it (the screen). floors/lobby/kiosk.ts builds its parts and bounds.
   */
  kiosk: { x: KIOSK_CENTER.x, z: KIOSK_CENTER.z, yaw: Math.atan2(-KIOSK_AXIS.x, -KIOSK_AXIS.z), depth: KIOSK_DEPTH, width: KIOSK_WIDTH, stopGap: KIOSK_STOP_GAP },
  kioskAxis: KIOSK_AXIS,
  /** Visitor Observatory (`L1:visits`) footprint; `h` is the globe top, a camera collision column. */
  observatory: { ...LOBBY_OBSERVATORY, h: 7.4 },
  laneRadius: 12,
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
const ELEVATOR_PAD_FACE: Record<FloorId, number> = { L1: Math.PI / 2, L2: 0, L3: Math.PI / 2, L4: Math.PI / 2, RF: Math.PI / 2 };

/** Return pad icon yaw: toward the L2 rail camera (+z), elsewhere west, where the follow camera sits when the rover heads east to a floor's far end. */
const RETURN_PAD_FACE: Record<FloorId, number> = { L1: -Math.PI / 2, L2: 0, L3: -Math.PI / 2, L4: -Math.PI / 2, RF: -Math.PI / 2 };

/**
 * Every floor gets the elevator call pad on its approach (3 u in front of the shaft door, so it follows
 * the door constants), then its Express Return pad when the layout sets `returnPad` (fast return), then
 * the floor's own pads (the L2 year teleporters).
 */
function withFloorPads(layout: FloorLayout): FloorLayout {
  const back = returnPad(layout, RETURN_PAD_FACE[layout.id]);
  return { ...layout, pads: [elevatorPad(layout, ELEVATOR_PAD_FACE[layout.id]), ...(back ? [back] : []), ...(layout.pads ?? [])] };
}

/** The Lobby arrival view: behind a rover heading east, looking east at the hologram (`travel`: eastbound rovers only). */
function lobbyArrivalZone(): ViewZone {
  const { arrival: a } = LOBBY;
  return {
    id: "L1:arrival",
    area: { minX: a.x - 2, maxX: a.x + 2, minZ: a.z - 2, maxZ: a.z + 2 },
    yaw: yawLooking({ x: 1, z: 0 }),
    zoom: LOBBY.arrivalZoom,
    classView: { mobile: { zoom: LOBBY.arrivalZoomPhone } },
    travel: { x: 1, z: 0 },
  };
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
  const { hologram, skillsWall, certWall, observatory: o } = LOBBY;
  const observatory = lobbyObservatory({ rect: o, spawn: LOBBY.spawn, axis: LOBBY.kioskAxis });
  const layouts: Record<FloorId, FloorLayout> = {
    L1: {
      ...standard(
        "L1",
        LOBBY.bounds,
        [
          rect(hologram.x, hologram.z, hologram.radius * 2, hologram.radius * 2),
          rect(skillsWall.x, skillsWall.z, skillsWall.w, skillsWall.d),
          rect(certWall.x, certWall.z, certWall.w, certWall.d),
          kioskRect(),
          ...HALL_LAYOUT.obstacles,
          { minX: o.minX, maxX: o.maxX, minZ: o.minZ, maxZ: o.maxZ },
        ],
        LOBBY.spawn,
      ),
      arrival: LOBBY.arrival,
      // Highlights Hall: station doors, the passage road (used only for drives into or out of the hall) and camera
      // zones; the Visitor Observatory's door and the spawn and observatory views (floors/lobby/observatoryLayout.ts);
      // the elevator arrival view.
      doors: [...HALL_LAYOUT.doors, observatory.door],
      road: HALL_LAYOUT.network,
      roadZone: HALL_LAYOUT.zone,
      viewZones: [...HALL_LAYOUT.viewZones, ...observatory.zones, lobbyArrivalZone()],
      // Gallery shapes taller than the camera clearance (gateway arch, monoliths, experience arch, beacon, contact
      // card) and the observatory globe.
      tall: [...hallTall(), LOBBY.observatory],
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
