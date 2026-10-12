import type { FloorId } from "@/content/schema";
import { buildCareerRoad } from "./floors/career/layout";
import { buildLabsLayout } from "./floors/labs/layout";
import { buildLibraryLayout } from "./floors/library/layout";
import { ROOF_DOORS, roofObstacles } from "./floors/roof/layout";
import { elevatorPad } from "./nav/pads";
import type { FloorLayout, LayoutExtras, Rect, Vec2 } from "./types";

/** Tower constants from spec appendix 01 section 1. */
export const FLOOR_GAP = 14;
export const FLOOR_IDS = ["L1", "L2", "L3", "L4", "RF"] as const satisfies readonly FloorId[];
export const SLAB_THICKNESS = 0.4;

/** Floors whose 3D content is built. Others are placeholders and keep the URL at /{locale}. */
export const READY_FLOORS: readonly FloorId[] = ["L1", "L2", "L3", "L4", "RF"];

/**
 * Floors that offer their guided walk (first-visit prompt and Walk HUD, see missions/walks.ts) once
 * their road ships; `?walk=on` turns every walk on for tests and previews, `?walk=off` turns them off.
 */
export const WALK_FLOORS: readonly FloorId[] = ["L2", "L3", "L4"];

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

/**
 * Lobby element positions (appendix 01 section 2). The plaza sits east of the elevator so the walls
 * keep a clear walkway (at least 4 u) outside the lane ring; see tests/unit/lobby-layout.test.ts.
 */
export const LOBBY = {
  bounds: { minX: -24, maxX: 28, minZ: -24, maxZ: 18 },
  /** On the default camera diagonal from the plaza, so the hologram is centered on arrival. */
  spawn: { x: 14, z: 6 },
  hologram: { x: 6, z: -4, radius: 3 },
  /** Name and headline float above the stats tiles. */
  titleY: 7.6,
  statsRadius: 10,
  /** Tiles float above the rover (about 2.8 u tall), so the walkable ring never clips them. */
  statsTile: { w: 3.4, h: 1.9, y: 4.25, stagger: 0.5 },
  /** Raised on a 0.35 u glowing plinth; 8.5 u tall so the longest column (12 items) reads at a larger size. */
  skillsWall: { x: 6, z: -22.5, w: 40, d: 1, h: 8.5, plinth: 0.35 },
  /** Footprint of the curved certification wall (floors/lobby/layout.ts CERT_WALL): the obstacle and view zone use it. */
  certWall: { x: 25, z: -4, w: 2.4, d: 18, h: 6.2 },
  kiosk: { x: 2, z: 15, w: 3, d: 2 },
  laneRadius: 12,
} as const;

/** Rover height used for clearance checks (antenna tip included). */
export const ROVER_HEIGHT = 2.8;

/** L2 corridor length for the placeholder: from x = -20 to -20 + 14 * years + 20. */
export function corridorEnd(yearCount: number): number {
  return -20 + 14 * Math.max(1, yearCount) + 20;
}

function standard(id: FloorId, bounds: Rect, obstacles: Rect[] = [], spawn?: Vec2): FloorLayout {
  const doorX = id === "RF" ? -20 : -24;
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
  return { ...standard("L2", road.bounds, road.obstacles), doors: road.doors, scrubStops: road.stops, road: road.network, pads: road.pads };
}

/**
 * Elevator pad icon yaw per floor: toward the L2 rail camera (+z), elsewhere east, where the follow
 * camera sits when the rover drives up to the shaft.
 */
const ELEVATOR_PAD_FACE: Record<FloorId, number> = { L1: Math.PI / 2, L2: 0, L3: Math.PI / 2, L4: Math.PI / 2, RF: Math.PI / 2 };

/**
 * Every floor gets the elevator call pad on its approach (3 u in front of the shaft door, so it follows
 * the door constants), ahead of the floor's own pads (the L2 year teleporters).
 */
function withElevatorPad(layout: FloorLayout): FloorLayout {
  return { ...layout, pads: [elevatorPad(layout, ELEVATOR_PAD_FACE[layout.id]), ...(layout.pads ?? [])] };
}

/** Floor-local layouts. Floors without content yet are placeholder slabs. `extras` carries per-floor inputs. */
export function buildFloorLayouts(yearCount: number, extras: LayoutExtras = {}): Record<FloorId, FloorLayout> {
  const { hologram, skillsWall, certWall, kiosk } = LOBBY;
  const layouts: Record<FloorId, FloorLayout> = {
    L1: standard(
      "L1",
      LOBBY.bounds,
      [
        rect(hologram.x, hologram.z, hologram.radius * 2, hologram.radius * 2),
        rect(skillsWall.x, skillsWall.z, skillsWall.w, skillsWall.d),
        rect(certWall.x, certWall.z, certWall.w, certWall.d),
        rect(kiosk.x, kiosk.z, kiosk.w, kiosk.d),
      ],
      LOBBY.spawn,
    ),
    L2: careerLayout(yearCount, extras),
    // Project Roads: hub plaza in front of the shaft door, wing roads looping east (walkable floors plan).
    L3: buildLabsLayout(extras.labs ?? []).floor,
    // Writing: the owner's pick from the L4 concepts (walkable floors plan, part 3).
    L4: buildLibraryLayout(extras.library).floor,
    // Deep links spawn RF in front of its content (the follow camera looks toward -x, -z).
    RF: { ...standard("RF", { minX: -20, maxX: 20, minZ: -20, maxZ: 20 }, roofObstacles(), { x: 4, z: 12 }), doors: ROOF_DOORS },
  };
  return Object.fromEntries(FLOOR_IDS.map((id) => [id, withElevatorPad(layouts[id])])) as Record<FloorId, FloorLayout>;
}
