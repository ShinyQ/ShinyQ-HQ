import type { RideSummary } from "../tower/rideStats";
import type { FrameStats } from "./frames";

/**
 * `?perf=1` turns the local performance overlay on and logs every elevator ride to the console (the
 * Director); without it nothing of the overlay loads or runs. The one parser of the flag.
 */
export const perfOverlayOn = (search: string): boolean => /[?&]perf=1(&|$)/.test(search);

export interface PerfLineInput {
  frames: FrameStats;
  sceneCalls: number;
  postCalls: number;
  triangles: number;
  programs: number;
  geometries: number;
  textures: number;
  tier: string;
  /** Unmasked WebGL renderer from the gate probe (shown locally only, never sent anywhere). */
  renderer: string;
  dpr: number;
  /** Drawing buffer size in device pixels. */
  width: number;
  height: number;
  /** The last finished elevator ride (`ridePrep.lastRide`), null before the first one. */
  ride?: RideSummary | null;
}

const num = (value: number | null, digits = 0): string => (value === null ? "-" : value.toFixed(digits));

/** Short form of `formatRideSummary` that fits the overlay: the numbers to compare between rides. */
function rideLine(r: RideSummary): string {
  const wait = `wait ${r.held.toFixed(2)} s${r.timedOut ? " (gave up)" : ""}`;
  return `ride ${r.from} to ${r.to} | ${r.dollyFrames} dolly frames, jump ${Math.round(r.maxStep * 100)}% | longest ${Math.round(r.longestFrameMs)} ms | ${wait} | ${r.programs} shaders | ${(r.elapsedMs / 1000).toFixed(2)} s`;
}

export function perfLines(i: PerfLineInput): string[] {
  const lines = [
    `fps p50 ${num(i.frames.fpsP50)} | p10 ${num(i.frames.fpsP10)} | frame p95 ${num(i.frames.frameP95, 1)} ms`,
    `calls ${i.sceneCalls} scene + ${i.postCalls} post | tris ${(i.triangles / 1000).toFixed(1)}k`,
    `programs ${i.programs} | geometries ${i.geometries} | textures ${i.textures}`,
    `tier ${i.tier} | ${i.renderer || "renderer unknown"}`,
    `dpr ${i.dpr.toFixed(2)} | ${i.width}x${i.height} (${((i.width * i.height) / 1e6).toFixed(1)} MP)`,
  ];
  if (i.ride) lines.push(rideLine(i.ride));
  return lines;
}
