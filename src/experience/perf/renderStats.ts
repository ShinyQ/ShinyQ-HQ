/**
 * Per-frame render counters (appendix 08 section 2), split into the scene pass and post-processing
 * passes. `instrumentRenderer` wraps `renderer.render` once: a call that renders the R3F scene is scene
 * work, any other call (the full tier's composer: bloom mip passes, the effect pass) is a post pass.
 * `closeFrame` runs first in every R3F frame and publishes the previous frame. Pure (no React, no
 * three import) so Vitest runs it in node. Read through `window.__hq.perf` (e2e) and by the `?perf=1`
 * overlay.
 */
export interface RendererLike {
  render: (scene: unknown, camera: unknown) => void;
  info: {
    autoReset: boolean;
    render: { calls: number; triangles: number };
    memory: { geometries: number; textures: number };
    programs?: readonly unknown[] | null;
    reset: () => void;
  };
}

export interface RenderStats {
  /** Last whole frame: scene draw calls, post-processing passes, triangles of both. */
  sceneCalls: number;
  postCalls: number;
  triangles: number;
  /** Worst frame since `resetPeaks()`, and the lightest scene frame (a frame that drew nothing is not counted). */
  peakSceneCalls: number;
  peakPostCalls: number;
  peakTriangles: number;
  minSceneCalls: number;
  /** Frames counted since `resetPeaks()`. */
  peakFrames: number;
  /** Live GPU objects from `renderer.info` (three.js has no material count). */
  programs: number;
  geometries: number;
  textures: number;
  /** Frames counted since the counter was installed. */
  frames: number;
}

const initial = (): RenderStats => ({
  sceneCalls: 0,
  postCalls: 0,
  triangles: 0,
  peakSceneCalls: 0,
  peakPostCalls: 0,
  peakTriangles: 0,
  minSceneCalls: Number.POSITIVE_INFINITY,
  peakFrames: 0,
  programs: 0,
  geometries: 0,
  textures: 0,
  frames: 0,
});

export const renderStats: RenderStats = initial();

const pending = { sceneCalls: 0, postCalls: 0, triangles: 0, rendered: false };
let active: RendererLike | null = null;

export function resetPeaks(): void {
  renderStats.peakSceneCalls = 0;
  renderStats.peakPostCalls = 0;
  renderStats.peakTriangles = 0;
  renderStats.minSceneCalls = Number.POSITIVE_INFINITY;
  renderStats.peakFrames = 0;
}

/** Everything back to zero: a remounted canvas (or a test) starts its own count. */
export function resetRenderStats(): void {
  Object.assign(renderStats, initial());
  pending.sceneCalls = 0;
  pending.postCalls = 0;
  pending.triangles = 0;
  pending.rendered = false;
}

/** Wraps `gl.render` so every call adds its draws to the scene or the post total. Returns the uninstall. */
export function instrumentRenderer(gl: RendererLike, isScene: (scene: unknown) => boolean): () => void {
  const original = gl.render;
  // Totals span every pass of a frame; three's autoReset would clear them at each render() call.
  gl.info.autoReset = false;
  active = gl;
  gl.render = (scene, camera) => {
    const calls = gl.info.render.calls;
    const triangles = gl.info.render.triangles;
    original.call(gl, scene, camera);
    const drawn = gl.info.render.calls - calls;
    if (isScene(scene)) pending.sceneCalls += drawn;
    else pending.postCalls += drawn;
    pending.triangles += gl.info.render.triangles - triangles;
    pending.rendered = true;
  };
  return () => {
    gl.render = original;
    if (active === gl) active = null;
  };
}

/** Publishes the frame that just rendered and starts the next one (call first in every frame). */
export function closeFrame(): void {
  const gl = active;
  if (!gl) return;
  const s = renderStats;
  if (pending.rendered) {
    s.sceneCalls = pending.sceneCalls;
    s.postCalls = pending.postCalls;
    s.triangles = pending.triangles;
    s.frames += 1;
    s.peakSceneCalls = Math.max(s.peakSceneCalls, pending.sceneCalls);
    s.peakPostCalls = Math.max(s.peakPostCalls, pending.postCalls);
    s.peakTriangles = Math.max(s.peakTriangles, pending.triangles);
    s.minSceneCalls = Math.min(s.minSceneCalls, pending.sceneCalls);
    s.peakFrames += 1;
  }
  s.programs = gl.info.programs?.length ?? 0;
  s.geometries = gl.info.memory.geometries;
  s.textures = gl.info.memory.textures;
  pending.sceneCalls = 0;
  pending.postCalls = 0;
  pending.triangles = 0;
  pending.rendered = false;
  gl.info.reset();
}
