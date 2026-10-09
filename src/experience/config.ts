import type { FloorId } from "@/content/schema";
import { buildLabsLayout } from "./floors/labs/layout";
import type { FloorLayout, LayoutExtras, Rect, Vec2 } from "./types";

/** Tower constants from spec appendix 01 section 1. */
export const FLOOR_GAP = 14;
export const FLOOR_IDS = ["L1", "L2", "L3", "L4", "RF"] as const satisfies readonly FloorId[];
export const SLAB_THICKNESS = 0.4;

/** Floors whose 3D content is built. Others are placeholders and keep the URL at /{locale}. */
export const READY_FLOORS: readonly FloorId[] = ["L1", "L3"];

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

/** Lobby element positions (appendix 01 section 2). */
export const LOBBY = {
  spawn: { x: 0, z: 6 },
  hologram: { x: 0, z: -6, radius: 3 },
  statsRadius: 7,
  skillsWall: { x: 0, z: -15, w: 30, d: 1, h: 6 },
  certWall: { x: 21, z: -4, w: 1, d: 14, h: 5 },
  kiosk: { x: -8, z: 8, w: 3, d: 2 },
  laneRadius: 10,
} as const;

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

/** Floor-local layouts. Floors without content yet are placeholder slabs. `extras` carries per-floor inputs. */
export function buildFloorLayouts(yearCount: number, extras: LayoutExtras = {}): Record<FloorId, FloorLayout> {
  const { hologram, skillsWall, certWall, kiosk } = LOBBY;
  return {
    L1: standard(
      "L1",
      { minX: -24, maxX: 24, minZ: -16, maxZ: 16 },
      [
        rect(hologram.x, hologram.z, hologram.radius * 2, hologram.radius * 2),
        rect(skillsWall.x, skillsWall.z, skillsWall.w, skillsWall.d),
        rect(certWall.x, certWall.z, certWall.w, certWall.d),
        rect(kiosk.x, kiosk.z, kiosk.w, kiosk.d),
      ],
      LOBBY.spawn,
    ),
    L2: standard("L2", { minX: -24, maxX: corridorEnd(yearCount), minZ: -14, maxZ: 14 }),
    // Atrium in front of the shaft door, wings as mirror halls running east (Phase 4 plan, decision 1).
    L3: buildLabsLayout(extras.labs ?? []).floor,
    L4: standard("L4", { minX: -24, maxX: 24, minZ: -16, maxZ: 16 }),
    RF: standard("RF", { minX: -20, maxX: 20, minZ: -20, maxZ: 20 }),
  };
}
