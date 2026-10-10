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
  rail: [30, 70],
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
    bloom: tier === "full" ? { intensity: 1.0, threshold: 0.32, radius: 0.4 } : null,
  };
}
