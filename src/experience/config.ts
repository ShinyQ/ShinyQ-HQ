import type { FloorId } from "@/content/schema";
import { buildCorridor } from "./floors/career/layout";
import { buildLabsLayout } from "./floors/labs/layout";
import { LIBRARY_DOORS, libraryObstacles } from "./floors/library/layout";
import { ROOF_DOORS, roofObstacles } from "./floors/roof/layout";
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
  skillsWall: { x: 6, z: -22.5, w: 40, d: 1, h: 6.5 },
  certWall: { x: 25.5, z: -4, w: 1, d: 16, h: 5 },
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

/** L2: the Career Archive corridor when its data is known, else the placeholder corridor. */
function careerLayout(yearCount: number, extras: LayoutExtras): FloorLayout {
  if (!extras.career) return standard("L2", { minX: -24, maxX: corridorEnd(yearCount), minZ: -14, maxZ: 14 });
  const corridor = buildCorridor(extras.career);
  return { ...standard("L2", corridor.bounds, corridor.obstacles), doors: corridor.doors, scrubStops: corridor.stops };
}

/** Floor-local layouts. Floors without content yet are placeholder slabs. `extras` carries per-floor inputs. */
export function buildFloorLayouts(yearCount: number, extras: LayoutExtras = {}): Record<FloorId, FloorLayout> {
  const { hologram, skillsWall, certWall, kiosk } = LOBBY;
  return {
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
    // Atrium in front of the shaft door, wings as mirror halls running east (Phase 4 plan, decision 1).
    L3: buildLabsLayout(extras.labs ?? []).floor,
    // Deep links spawn L4 and RF in front of their content (the follow camera looks toward -x, -z).
    L4: { ...standard("L4", { minX: -24, maxX: 24, minZ: -16, maxZ: 16 }, libraryObstacles(), { x: 4, z: 3.5 }), doors: LIBRARY_DOORS },
    RF: { ...standard("RF", { minX: -20, maxX: 20, minZ: -20, maxZ: 20 }, roofObstacles(), { x: 4, z: 12 }), doors: ROOF_DOORS },
  };
}
