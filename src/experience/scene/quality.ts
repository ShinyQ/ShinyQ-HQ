import type { GpuTier } from "../types";
import { BLOOM_LEVELS, type RenderBudget } from "./settings";

/** Look-preserving steps of the safety net, cheapest visual change first. */
export type QualityStep = "dpr-85" | "dpr-70" | "msaa-off" | "bloom-lite";

export interface QualityState {
  /** Steps taken (0 = the plain budget). */
  level: number;
  /** Exact canvas DPR. */
  dpr: number;
  multisampling: number;
  bloomLevels: number;
}

const MIN_BLOOM_LEVELS = 5;
const round2 = (v: number) => Math.round(v * 100) / 100;

/** Canvas DPR at level 0: what R3F picks from the budget's range on this screen. */
export function startDpr(base: RenderBudget, deviceDpr: number): number {
  return round2(Math.min(base.dpr[1], Math.max(base.dpr[0], deviceDpr)));
}

/**
 * Bloom MIP levels that keep the glow's on-screen size when the canvas renders `scale` times fewer
 * pixels per side (each level halves the size, so one level less per halving).
 */
export function bloomLevelsFor(scale: number, levels = BLOOM_LEVELS): number {
  const clamped = Math.min(1, Math.max(0.01, scale));
  return Math.max(MIN_BLOOM_LEVELS, Math.min(levels, levels + Math.round(Math.log2(clamped))));
}

/** Steps for this device: DPR 85% and 70% (not below 1), composer MSAA off, then bloom 2 levels lighter. Steps that would change nothing are left out. */
export function qualityLadder(base: RenderBudget, tier: GpuTier, deviceDpr: number): QualityStep[] {
  const d0 = startDpr(base, deviceDpr);
  const d85 = Math.max(1, round2(d0 * 0.85));
  const d70 = Math.max(1, round2(d0 * 0.7));
  const steps: QualityStep[] = [];
  if (d85 < d0) steps.push("dpr-85");
  if (d70 < d85) steps.push("dpr-70");
  if (base.multisampling > 0) steps.push("msaa-off");
  if (tier === "full") steps.push("bloom-lite");
  return steps;
}

export function qualityAt(base: RenderBudget, tier: GpuTier, deviceDpr: number, level: number): QualityState {
  const ladder = qualityLadder(base, tier, deviceDpr);
  const taken = new Set(ladder.slice(0, Math.max(0, Math.min(level, ladder.length))));
  const d0 = startDpr(base, deviceDpr);
  const dpr = taken.has("dpr-70") ? Math.max(1, round2(d0 * 0.7)) : taken.has("dpr-85") ? Math.max(1, round2(d0 * 0.85)) : d0;
  const tracked = bloomLevelsFor(dpr / d0, base.bloomLevels);
  return {
    level: taken.size,
    dpr,
    multisampling: taken.has("msaa-off") ? 0 : base.multisampling,
    bloomLevels: taken.has("bloom-lite") ? Math.max(MIN_BLOOM_LEVELS, tracked - 2) : tracked,
  };
}
