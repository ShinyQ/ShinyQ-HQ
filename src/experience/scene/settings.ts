import type { RigKind } from "../camera/rigs";
import type { GpuTier } from "../types";

export interface SceneSettings {
  fog: { color: string; near: number; far: number };
  exposure: number;
  hemisphere: [string, string, number];
  directional: { color: string; intensity: number; position: [number, number, number] };
  bloom: { intensity: number; threshold: number; radius: number } | null;
}

const FOG_COLOR = "#0a0a0f";

/** Linear fog range per camera rig: the prototype's 38 to 80 on follow, tighter on the L2 rail, far for the exterior intro. */
const FOG_RANGE: Record<RigKind, [number, number]> = {
  follow: [38, 80],
  focus: [38, 80],
  rail: [40, 95],
  intro: [90, 200],
};

/** Lighting, fog, tone mapping and bloom (prototype values, docs/prototypes/README.md). Bloom is full tier only. */
export function sceneSettings(tier: GpuTier, rig: RigKind = "follow"): SceneSettings {
  const [near, far] = FOG_RANGE[rig];
  return {
    fog: { color: FOG_COLOR, near, far },
    exposure: 1.05,
    hemisphere: ["#8b8cff", FOG_COLOR, 0.7],
    directional: { color: "#dfe3ff", intensity: 1.4, position: [10, 22, 12] },
    bloom: tier === "full" ? { intensity: 0.9, threshold: 0.6, radius: 0.45 } : null,
  };
}

export interface RenderBudget {
  /** Device pixel ratio range for the canvas (R3F clamps window.devicePixelRatio into it). */
  dpr: [number, number];
  /** MSAA samples of the full-tier EffectComposer (the canvas itself never multisamples). */
  multisampling: number;
}

/**
 * Pixel budget per tier and device. Fill rate is the main cost on phones and weak GPUs (measured:
 * the full-tier composer at 4x MSAA and DPR 2 costs 4 to 7x the lite frame), so touch devices
 * (`coarse` pointer) render fewer pixels and skip composer MSAA; desktops keep the full look.
 * The canvas never multisamples: on full the composer renders into its own targets, and lite has
 * always run without antialiasing.
 */
export function renderBudget(tier: GpuTier, coarse: boolean): RenderBudget {
  if (tier === "full") return coarse ? { dpr: [1, 1.5], multisampling: 0 } : { dpr: [1, 2], multisampling: 4 };
  return { dpr: coarse ? [1, 1.25] : [1, 1.5], multisampling: 0 };
}
