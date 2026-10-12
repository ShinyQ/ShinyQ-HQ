import { beforeEach, describe, expect, it } from "vitest";
import { closeFrame, instrumentRenderer, renderStats, resetPeaks, resetRenderStats, type RendererLike } from "@/experience/perf/renderStats";

/** A renderer double: each render() adds the draws registered for that scene (2 triangles each), like three.js with autoReset off. */
function fakeRenderer() {
  const info = {
    autoReset: true,
    render: { calls: 0, triangles: 0 },
    memory: { geometries: 7, textures: 3 },
    programs: [{}, {}] as unknown[],
    reset() {
      info.render.calls = 0;
      info.render.triangles = 0;
    },
  };
  const draws = new Map<unknown, number>();
  const gl: RendererLike = {
    info,
    render(scene) {
      const calls = draws.get(scene) ?? 0;
      info.render.calls += calls;
      info.render.triangles += calls * 2;
    },
  };
  return { gl, info, draws };
}

const SCENE = { name: "r3f scene" };
const QUAD = { name: "full-screen pass" };

beforeEach(() => resetRenderStats());

describe("render stats", () => {
  it("splits a frame into scene calls and post passes and turns autoReset off", () => {
    const { gl, info, draws } = fakeRenderer();
    draws.set(SCENE, 100);
    draws.set(QUAD, 1);
    const uninstall = instrumentRenderer(gl, (s) => s === SCENE);
    expect(info.autoReset).toBe(false);
    gl.render(SCENE, null);
    for (let i = 0; i < 18; i++) gl.render(QUAD, null);
    closeFrame();
    expect(renderStats).toMatchObject({ sceneCalls: 100, postCalls: 18, triangles: 236, programs: 2, geometries: 7, textures: 3, frames: 1 });
    expect(info.render.calls).toBe(0);
    uninstall();
  });

  it("keeps the worst and the lightest frame since resetPeaks", () => {
    const { gl, draws } = fakeRenderer();
    instrumentRenderer(gl, (s) => s === SCENE);
    for (const calls of [50, 120, 80]) {
      draws.set(SCENE, calls);
      gl.render(SCENE, null);
      closeFrame();
    }
    expect(renderStats).toMatchObject({ peakSceneCalls: 120, minSceneCalls: 50, peakFrames: 3, sceneCalls: 80 });
    resetPeaks();
    draws.set(SCENE, 60);
    gl.render(SCENE, null);
    closeFrame();
    expect(renderStats).toMatchObject({ peakSceneCalls: 60, minSceneCalls: 60, peakFrames: 1, frames: 4 });
  });

  it("does not count a frame that rendered nothing", () => {
    const { gl } = fakeRenderer();
    instrumentRenderer(gl, () => true);
    closeFrame();
    closeFrame();
    expect(renderStats).toMatchObject({ frames: 0, peakFrames: 0, sceneCalls: 0, programs: 2 });
  });

  it("reports an unbounded draw as non-finite instead of hiding it", () => {
    const { gl, info } = fakeRenderer();
    gl.render = () => {
      info.render.calls += 1;
      info.render.triangles = Number.POSITIVE_INFINITY;
    };
    instrumentRenderer(gl, () => true);
    gl.render(SCENE, null);
    closeFrame();
    expect(Number.isFinite(renderStats.peakTriangles)).toBe(false);
  });

  it("restores the original render on uninstall and stops counting", () => {
    const { gl, draws } = fakeRenderer();
    const original = gl.render;
    const uninstall = instrumentRenderer(gl, () => true);
    expect(gl.render).not.toBe(original);
    uninstall();
    expect(gl.render).toBe(original);
    draws.set(SCENE, 5);
    gl.render(SCENE, null);
    closeFrame();
    expect(renderStats.frames).toBe(0);
  });
});
