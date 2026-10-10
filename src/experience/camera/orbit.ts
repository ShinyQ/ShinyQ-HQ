import type { FloorId } from "@/content/schema";
import { LOBBY } from "../config";
import type { Rect, Vec2 } from "../types";
import { springFactor } from "./rigs";

/**
 * Horizontal orbit state for the follow rig (appendix 03 section 2): unbounded yaw around the
 * rover, a small tilt (about 9 degrees either way), clamped zoom, eased steps and reset, and a
 * gentle auto-face toward walls that user rotation cancels.
 * Pure TypeScript so it can be unit tested.
 */
export interface OrbitState {
  /** Yaw offset from the default follow angle, radians, unbounded. */
  yaw: number;
  yawTarget: number;
  /** Pitch offset from the rig's default elevation, radians. */
  pitch: number;
  pitchTarget: number;
  zoom: number;
  zoomTarget: number;
  /** Limited yaw for the L2 rail camera. */
  railYaw: number;
  railYawTarget: number;
  /** True while easing toward the targets (steps, reset, auto-face). */
  easing: boolean;
  /** View zone the rover is in, if any. */
  zone: string | null;
  /** Zone in which the visitor rotated by hand; no auto-face there until the rover leaves it. */
  suppressedZone: string | null;
  /** Zoom set by a view zone; restored to 1 on exit unless the visitor zoomed by hand meanwhile. */
  zoneZoom: number | null;
}

/** Tilt allowed around the default elevation (owner decision: left/right free, up/down a little). */
export const PITCH_RANGE = [-0.16, 0.16] as const;
export const ZOOM_RANGE = [0.6, 1.5] as const;
export const RAIL_MAX_YAW = (35 * Math.PI) / 180;
/** Q/E rotation speed (Shift doubles it). */
export const KEY_ROTATE_SPEED = 1.7;
/** One press of an on-screen rotate button. */
export const ROTATE_STEP = Math.PI / 4;
const EASE_HALF_LIFE = 0.14;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export const wrapPi = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
/** The angle equivalent to `target` (mod 2 PI) that is closest to `current`. */
export const nearestAngle = (target: number, current: number) => current + wrapPi(target - current);

export function createOrbitState(): OrbitState {
  return {
    yaw: 0,
    yawTarget: 0,
    pitch: 0,
    pitchTarget: 0,
    zoom: 1,
    zoomTarget: 1,
    railYaw: 0,
    railYawTarget: 0,
    easing: false,
    zone: null,
    suppressedZone: null,
    zoneZoom: null,
  };
}

/** Direct manipulation (drag, twist, trackpad, held keys): applies immediately and cancels easing. */
export function rotate(s: OrbitState, dyaw: number, dpitch = 0, rail = false): void {
  if (rail) {
    s.railYaw = clamp(s.railYaw + dyaw, -RAIL_MAX_YAW, RAIL_MAX_YAW);
    s.railYawTarget = s.railYaw;
  } else {
    s.yaw += dyaw;
    s.yawTarget = s.yaw;
  }
  s.pitch = clamp(s.pitch + dpitch, PITCH_RANGE[0], PITCH_RANGE[1]);
  s.pitchTarget = s.pitch;
  s.zoomTarget = s.zoom;
  s.easing = false;
  if (s.zone) s.suppressedZone = s.zone;
}

/** Eased step (on-screen buttons). */
export function rotateStep(s: OrbitState, direction: number, rail = false): void {
  if (rail) {
    s.railYawTarget = clamp(s.railYawTarget + direction * ROTATE_STEP, -RAIL_MAX_YAW, RAIL_MAX_YAW);
  } else {
    s.yawTarget = (s.easing ? s.yawTarget : s.yaw) + direction * ROTATE_STEP;
  }
  s.easing = true;
  if (s.zone) s.suppressedZone = s.zone;
}

/** Eases back to the default angle, pitch and zoom (the nearest full turn, never a long spin). */
export function resetView(s: OrbitState): void {
  s.yawTarget = s.yaw - wrapPi(s.yaw);
  s.pitchTarget = 0;
  s.zoomTarget = 1;
  s.railYawTarget = 0;
  s.zoneZoom = null;
  s.easing = true;
  if (s.zone) s.suppressedZone = s.zone;
}

export function zoomBy(s: OrbitState, factor: number): void {
  s.zoom = clamp(s.zoom * factor, ZOOM_RANGE[0], ZOOM_RANGE[1]);
  s.zoomTarget = s.zoom;
  s.zoneZoom = null;
}

/** A floor area where the camera turns to face something (a wall) when the rover walks in. */
export interface ViewZone {
  id: string;
  area: Rect;
  /** Follow yaw (offset from the default angle) that faces the feature head on. */
  yaw: number;
  /** Optional zoom so a wide feature fits the view. */
  zoom?: number;
}

/**
 * Lobby view zones. The default camera looks along (-1, -1); a yaw of -PI/4 looks north at the
 * skills wall, -PI/2 looks east at the louvered certification badges.
 */
export const VIEW_ZONES: Partial<Record<FloorId, ViewZone[]>> = {
  L1: [
    {
      id: "L1:certifications",
      area: { minX: LOBBY.certWall.x - 7, maxX: LOBBY.certWall.x, minZ: LOBBY.certWall.z - 10, maxZ: LOBBY.certWall.z + 10 },
      yaw: -Math.PI / 2,
    },
    {
      id: "L1:skills",
      area: {
        minX: LOBBY.skillsWall.x - LOBBY.skillsWall.w / 2,
        maxX: LOBBY.skillsWall.x + LOBBY.skillsWall.w / 2,
        minZ: LOBBY.skillsWall.z,
        maxZ: LOBBY.skillsWall.z + 6,
      },
      yaw: -Math.PI / 4,
      // The 40 u by 8.5 u wall needs a wider view than the default follow distance.
      zoom: 1.7,
    },
  ],
};

export function zoneAt(floor: FloorId, p: Vec2): ViewZone | null {
  return VIEW_ZONES[floor]?.find((z) => p.x >= z.area.minX && p.x <= z.area.maxX && p.z >= z.area.minZ && p.z <= z.area.maxZ) ?? null;
}

/**
 * Tracks the zone the rover is in. Entering a zone eases the camera to face its feature, unless
 * reduced motion is on or the visitor already rotated by hand inside it. Leaving clears the block.
 */
export function updateZone(s: OrbitState, zone: ViewZone | null, reduced: boolean): void {
  const id = zone?.id ?? null;
  if (id === s.zone) return;
  s.zone = id;
  if (!zone) {
    s.suppressedZone = null;
    if (s.zoneZoom !== null) {
      s.zoomTarget = 1;
      s.zoneZoom = null;
      s.easing = true;
    }
    return;
  }
  if (reduced || s.suppressedZone === zone.id) return;
  s.yawTarget = nearestAngle(zone.yaw, s.yaw);
  s.pitchTarget = 0;
  if (zone.zoom) {
    s.zoomTarget = zone.zoom;
    s.zoneZoom = zone.zoom;
  }
  s.easing = true;
}

/** Advances easing. Reduced motion jumps straight to the targets. */
export function stepOrbit(s: OrbitState, dt: number, reduced: boolean): void {
  if (!s.easing) return;
  const k = reduced ? 1 : springFactor(dt, EASE_HALF_LIFE);
  s.yaw += (s.yawTarget - s.yaw) * k;
  s.pitch += (s.pitchTarget - s.pitch) * k;
  s.zoom += (s.zoomTarget - s.zoom) * k;
  s.railYaw += (s.railYawTarget - s.railYaw) * k;
  const done =
    Math.abs(s.yawTarget - s.yaw) < 1e-3 &&
    Math.abs(s.pitchTarget - s.pitch) < 1e-3 &&
    Math.abs(s.zoomTarget - s.zoom) < 1e-3 &&
    Math.abs(s.railYawTarget - s.railYaw) < 1e-3;
  if (done) {
    s.yaw = s.yawTarget;
    s.pitch = s.pitchTarget;
    s.zoom = s.zoomTarget;
    s.railYaw = s.railYawTarget;
    s.easing = false;
  }
}
