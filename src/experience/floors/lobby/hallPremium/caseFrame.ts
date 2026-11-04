import { Color } from "three";
import { neonColor } from "../../../fx/materials";
import type { GpuTier, Rect } from "../../../types";
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

/** Glass case: inset from the station's back and sides, its front on the station's face, this tall (the contact beacon's mast is taller). */
export const CASE = { inset: 0.15, h: 8.6, over: 1.6, fill: 0.018, alpha: 0.9, halo: 1.6 } as const;

export interface CaseFrame {
  /** The case's footprint (inside the station's) and height. */
  box: Rect & { h: number };
  panes: PremiumInstance[];
  cone: PremiumInstance;
  halo: PremiumInstance;
}

/**
 * The shared frame of one station (owner decision 2026-11-04): a glass display case of four panes (faint tinted faces,
 * lit edges that brighten with the wake), a light cone from above and a halo ring on the floor around its door pad.
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
    h: Math.max(CASE.h, HALL.height[s.station] + CASE.over),
  };
  const no = stationNo(s);
  const accent = accentOf(s);
  const edge = tint(accent, 1.3, tier);
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
  const coneH = box.h + 3;
  return {
    box,
    panes,
    cone: { at: [cx, coneH / 2, cz], yaw: 0, color: tint(accent, 1, tier), a: [PREMIUM_MODE.cone, Math.min(Math.max(w, d), 9) * 0.8, coneH, no], b: [0, 0, 0, 0.16], c: [0, 0, ORIENT.column, 0] },
    halo: { at: [s.pad.x, 0.03, s.pad.z], yaw: 0, color: tint(accent, 1.4, tier), a: [PREMIUM_MODE.ring, CASE.halo * 2, CASE.halo * 2, no], b: [0, 0, 0, 0.9], c: [0, 0, ORIENT.lying, 0.12] },
  };
}
