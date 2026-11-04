import { Color } from "three";
import { neonColor } from "../../../fx/materials";
import type { GpuTier, Rect } from "../../../types";
import { HEADER } from "../hallContent";
import { HALL, type HallStation } from "../hallLayout";
import { HIGHLIGHT_STATIONS } from "../stations";
import { ORIENT, PREMIUM_MODE } from "./shader";

/** One interior effect instance (`shader.ts`): position and yaw, tint and the three attribute groups. */
export interface PremiumInstance {
  at: [number, number, number];
  yaw: number;
  color: [number, number, number];
  /** mode, width, height, station (1 to 7, 0 for none) */
  a: [number, number, number, number];
  /** tilt, spin, phase, alpha */
  b: [number, number, number, number];
  /** grow, ripple, orientation (tokens: orbit radius), mode value */
  c: [number, number, number, number];
}

/** B4 accents (owner decision 2026-11-04): stations alternate cyan (odd numbers) and violet (even). */
export const ACCENT = { cyan: "#6ee7ff", violet: "#a78bfa" } as const;

export function accentOf(s: HallStation): string {
  return (HIGHLIGHT_STATIONS.indexOf(s.station) + 1) % 2 ? ACCENT.cyan : ACCENT.violet;
}

/** Station number (1 to 7), the wake slot in `uWake`. */
export const stationNo = (s: HallStation) => HIGHLIGHT_STATIONS.indexOf(s.station) + 1;

export const tint = (hex: string, k: number, tier: GpuTier): [number, number, number] => {
  const c: Color = neonColor(hex, k, tier);
  return [c.r, c.g, c.b];
};

/**
 * Glass case (B4, quiet): inset from the station's back and sides, its front on the station's face, its top under the
 * station header (`HEADER.over` above the station's height); thin edges at about 55%, a faint face tint.
 */
export const CASE = { inset: 0.15, fill: 0.01, alpha: 0.55 } as const;

export interface CaseFrame {
  /** The case's footprint (inside the station's) and height. */
  box: Rect & { h: number };
  panes: PremiumInstance[];
}

/**
 * The shared frame of one station (owner decision 2026-11-04): a glass display case of four panes (faint tinted faces,
 * thin lit edges that brighten with the wake). The light cone and the door-pad halo are the main path's.
 */
export function caseFrame(s: HallStation, tier: GpuTier): CaseFrame {
  const r = s.rect;
  const f = s.facing;
  const i = CASE.inset;
  // The face side keeps the station's edge; the other three sides come in by the inset.
  const box = {
    minX: r.minX + (f.x < 0 ? 0 : i),
    maxX: r.maxX - (f.x > 0 ? 0 : i),
    minZ: r.minZ + (f.z < 0 ? 0 : i),
    maxZ: r.maxZ - (f.z > 0 ? 0 : i),
    h: HALL.height[s.station] + HEADER.over,
  };
  const no = stationNo(s);
  const accent = accentOf(s);
  const edge = tint(accent, 1.1, tier);
  const cx = (box.minX + box.maxX) / 2;
  const cz = (box.minZ + box.maxZ) / 2;
  const w = box.maxX - box.minX;
  const d = box.maxZ - box.minZ;
  const pane = (x: number, z: number, yaw: number, width: number, fill: number): PremiumInstance => ({
    at: [x, box.h / 2, z],
    yaw,
    color: edge,
    a: [PREMIUM_MODE.pane, width, box.h, no],
    b: [0, 0, 0, CASE.alpha],
    c: [0, 0, ORIENT.upright, fill],
  });
  const panes = [
    pane(cx, box.minZ, 0, w, CASE.fill),
    pane(cx, box.maxZ, 0, w, CASE.fill),
    pane(box.minX, cz, Math.PI / 2, d, CASE.fill),
    pane(box.maxX, cz, Math.PI / 2, d, CASE.fill),
  ];
  return { box, panes };
}
