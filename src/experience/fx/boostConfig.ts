import type { GpuTier } from "../types";
import { BOOST } from "../rover/boost";

/**
 * Boost effects per tier (owner pick, October 2026: "Full package: path-following light trails, rover
 * leans and squats, camera widens and pulls back, speed streaks, wheel sparks"). Lite draws a shorter
 * trail, fewer and fainter streaks and fewer sparks; reduced motion turns every boost effect off (no
 * trail, as before). Pure, so Vitest runs it in node.
 */
export interface BoostFxConfig {
  /** Twin ribbon trail: ring buffer size, sample spacing (u), sample lifetime (s), head half-width (u). */
  trail: { samples: number; spacing: number; maxAge: number; width: number } | null;
  /** Screen-space speed streaks: how many and how bright at boost level 1. */
  streaks: { count: number; opacity: number } | null;
  /** Wheel sparks: pool size and emission rate (per second at boost level 1). */
  sparks: { max: number; rate: number } | null;
  /** Tiny high-frequency body buzz at boost top speed (full tier only). */
  buzz: boolean;
  /** Camera widens and pulls back while boosting. */
  camera: boolean;
  /** Body squat, dip and lean. */
  body: boolean;
}

const FULL: BoostFxConfig = {
  trail: { samples: 40, spacing: 0.25, maxAge: 0.6, width: 0.15 },
  streaks: { count: 28, opacity: 0.32 },
  sparks: { max: 48, rate: 110 },
  buzz: true,
  camera: true,
  body: true,
};

const LITE: BoostFxConfig = {
  trail: { samples: 20, spacing: 0.3, maxAge: 0.35, width: 0.13 },
  streaks: { count: 14, opacity: 0.2 },
  sparks: { max: 16, rate: 40 },
  buzz: false,
  camera: true,
  body: true,
};

const OFF: BoostFxConfig = { trail: null, streaks: null, sparks: null, buzz: false, camera: false, body: false };

export function boostFxConfig(tier: GpuTier, reduced: boolean): BoostFxConfig {
  if (reduced) return OFF;
  return tier === "full" ? FULL : LITE;
}

/** Boost meshes draw only above the trail threshold; below it they are invisible (no draw call). */
export function fxActive(level: number): boolean {
  return level > BOOST.trailMin;
}
