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

/**
 * Linear fog range per camera rig: the prototype's 38 to 80 on follow, tighter on the L2 rail, far for
 * the exterior intro. First person (round 5) keeps about the same visible distance around the rover as
 * the follow camera, measured from the rover's eyes instead of 29 u behind it.
 */
const FOG_RANGE: Record<RigKind, [number, number]> = {
  follow: [38, 80],
  focus: [38, 80],
  rail: [40, 95],
  intro: [90, 200],
  first: [14, 64],
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
  /** MIP levels of the full tier's mipmap bloom (postprocessing's default, the look the owner signed off). */
  bloomLevels: number;
}

export const BLOOM_LEVELS = 8;

/** CSS viewport and the device pixel ratio the browser reports. */
export interface ScreenSize {
  width: number;
  height: number;
  dpr: number;
}

/**
 * Most pixels one frame may render (canvas and composer targets). 8.3 MP (4K UHD) keeps every MacBook
 * (up to 1728x1117 at DPR 2 = 7.7 MP) and a 2560x1440 monitor at DPR 1 unchanged; only larger canvases
 * (5K, 4K at DPR 2) get a lower DPR.
 */
export const PIXEL_BUDGET = 8_300_000;
/** From this DPR on the screen itself antialiases, so the composer skips MSAA (owner decision, round 5). */
export const RETINA_DPR = 1.5;

/** Highest DPR the pixel budget allows for this CSS size (never below 1, never above `max`). */
export function budgetDpr(cssWidth: number, cssHeight: number, max: number): number {
  const cap = Math.floor(Math.sqrt(PIXEL_BUDGET / Math.max(1, cssWidth * cssHeight)) * 100) / 100;
  return Math.max(1, Math.min(max, cap));
}

/**
 * Pixel budget per tier, device and screen. Fill rate is the main cost on phones and weak GPUs (the
 * full-tier composer at 4x MSAA HalfFloat and DPR 2 costs 4 to 7x the lite frame, REPORT F5.1), so:
 * touch devices render fewer pixels and skip composer MSAA; desktops keep DPR up to 2 but skip MSAA from
 * DPR 1.5 up; very large canvases get a DPR cap from `PIXEL_BUDGET`. Bloom keeps 8 MIP levels (the
 * safety net in quality.ts lowers them only together with the DPR, so the glow keeps its on-screen size).
 * The canvas never multisamples.
 */
export function renderBudget(tier: GpuTier, coarse: boolean, screen: ScreenSize): RenderBudget {
  const tierMax = tier === "full" ? (coarse ? 1.5 : 2) : coarse ? 1.25 : 1.5;
  const max = budgetDpr(screen.width, screen.height, tierMax);
  const multisampling = tier === "full" && !coarse && screen.dpr < RETINA_DPR ? 4 : 0;
  return { dpr: [1, max], multisampling, bloomLevels: BLOOM_LEVELS };
}

/** `?gfx=` debug override (perf measurements and tests): `dpr1.5`, `msaa0|2|4|8`, `bloom1..8`, `monitor-on|off`. */
export interface GfxOverride {
  dprMax?: number;
  multisampling?: number;
  bloomLevels?: number;
  monitor?: boolean;
}

export function parseGfxOverride(search: string): GfxOverride {
  const raw = new URLSearchParams(search).get("gfx");
  const out: GfxOverride = {};
  if (!raw) return out;
  for (const part of raw.split(",").map((p) => p.trim())) {
    if (part === "monitor-off") out.monitor = false;
    else if (part === "monitor-on") out.monitor = true;
    const m = /^(dpr|msaa|bloom)(\d+(?:\.\d+)?)$/.exec(part);
    if (!m) continue;
    const v = Number(m[2]);
    if (m[1] === "dpr" && v >= 0.5 && v <= 3) out.dprMax = v;
    if (m[1] === "msaa" && [0, 2, 4, 8].includes(v)) out.multisampling = v;
    if (m[1] === "bloom" && Number.isInteger(v) && v >= 1 && v <= 8) out.bloomLevels = v;
  }
  return out;
}

export function withOverride(budget: RenderBudget, o: GfxOverride): RenderBudget {
  return {
    dpr: o.dprMax === undefined ? budget.dpr : [Math.min(1, o.dprMax), o.dprMax],
    multisampling: o.multisampling ?? budget.multisampling,
    bloomLevels: o.bloomLevels ?? budget.bloomLevels,
  };
}
