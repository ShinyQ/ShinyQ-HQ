import type { GpuTier } from "./types";

/**
 * True when a session start is the remount a graphics quality change causes: not the first start,
 * and the tier moved between two 3D tiers. A crash recovery remount keeps its tier, so it is not one.
 */
export function isQualityRemount(first: boolean, prevTier: GpuTier, nextTier: GpuTier): boolean {
  return !first && prevTier !== "static" && prevTier !== nextTier;
}
