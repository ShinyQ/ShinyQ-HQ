import type { Camera, Scene, WebGLRenderer } from "three";
import { postHandle } from "./postHandle";
import { listWarm } from "./warmState";

function shortHash(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/**
 * Read-only renderer handle for tests (`window.__hq.render`), the perf script, the quality safety net
 * and precompile. The Director records every frame's totals (all render passes), so peaks in the
 * intro and during rides are visible, not just the 10 Hz `drawCalls` mirror.
 */
export const renderProbe = {
  gl: null as WebGLRenderer | null,
  scene: null as Scene | null,
  camera: null as Camera | null,
  /** Highest whole-frame draw call count since `resetPeak` (every render pass, like `drawCalls`). */
  peakCalls: 0,
  peakTriangles: 0,
  /** Frames recorded since `resetPeak`. */
  frames: 0,
  /** The scene has drawn at least once on this canvas (before that, a precompile has no target to match). */
  rendered: false,
  record(calls: number, triangles: number): void {
    this.frames += 1;
    if (calls > 0) this.rendered = true;
    if (calls > this.peakCalls) this.peakCalls = calls;
    if (triangles > this.peakTriangles) this.peakTriangles = triangles;
  },
  resetPeak(): void {
    this.peakCalls = 0;
    this.peakTriangles = 0;
    this.frames = 0;
  },
  /** Shader programs three holds right now (`renderer.info.programs`). */
  programs(): number {
    return this.gl?.info.programs?.length ?? 0;
  },
  /** `Material#hash` per program, sorted (cache keys hold whole shader sources, so they are hashed). */
  programNames(): string[] {
    return (this.gl?.info.programs ?? []).map((p) => `${(p as { name?: string }).name ?? "program"}#${shortHash(p.cacheKey)}`).sort();
  },
  /** What the frame really uses now: canvas DPR, composer MSAA and bloom MIP levels (null on lite). */
  graphics(): { pixelRatio: number; multisampling: number | null; bloomLevels: number | null } {
    const post = postHandle.get();
    return {
      pixelRatio: this.gl?.getPixelRatio() ?? 0,
      multisampling: post?.composer()?.multisampling ?? null,
      bloomLevels: post?.bloom()?.mipmapBlurPass.levels ?? null,
    };
  },
  /** Floors whose programs are compiled and pinned (boot warm-up, neighbours, ride prepare). */
  warmFloors(): string[] {
    return listWarm();
  },
};
