import type { GpuTier } from "./types";

let replacedInCommit = false;

/**
 * Called from the unmount cleanup of the canvas. A key change remount runs the old canvas cleanup and the
 * new canvas session start in the same commit, so the flag is still set; a Page View round trip happens
 * after the timeout cleared it.
 */
export function markCanvasReplaced(): void {
  replacedInCommit = true;
  setTimeout(() => {
    replacedInCommit = false;
  }, 0);
}

export function canvasReplacedInCommit(): boolean {
  return replacedInCommit;
}

/**
 * True when a session start is the remount a graphics quality change causes: not the first start, the tier
 * moved between two 3D tiers, and the start replaces a live canvas within the same commit. A crash recovery
 * remount keeps its tier, and a Back to 3D after a Page View round trip is a re-entry, so neither is one.
 */
export function isQualityRemount(first: boolean, prevTier: GpuTier, nextTier: GpuTier, replacedLiveCanvas: boolean): boolean {
  return !first && replacedLiveCanvas && prevTier !== "static" && prevTier !== nextTier;
}
