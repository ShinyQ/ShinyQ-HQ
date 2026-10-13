import { describe, expect, it } from "vitest";
import { FrameSampler } from "@/experience/perf/frames";
import { perfLines, perfOverlayOn, type PerfLineInput } from "@/experience/perf/lines";
import type { RideSummary } from "@/experience/tower/rideStats";

describe("FrameSampler", () => {
  it("reports FPS p50, FPS p10 and frame p95 from frame times", () => {
    const s = new FrameSampler(100);
    for (let i = 0; i < 90; i++) s.push(16);
    for (let i = 0; i < 10; i++) s.push(50);
    expect(s.stats()).toEqual({ count: 100, fpsP50: 62.5, fpsP10: 20, frameP95: 50 });
  });

  it("keeps only the newest frames and ignores invalid ones", () => {
    const s = new FrameSampler(4);
    for (const ms of [10, 20, 30, 40, 50, 60, 0, -5, Number.NaN, Number.POSITIVE_INFINITY]) s.push(ms);
    expect(s.count).toBe(4);
    expect(s.stats().frameP95).toBe(60);
    expect(s.stats().fpsP50).toBe(1000 / 50);
    s.clear();
    expect(s.stats()).toEqual({ count: 0, fpsP50: null, fpsP10: null, frameP95: null });
  });
});

const input: PerfLineInput = {
  frames: { count: 240, fpsP50: 58.4, fpsP10: 51.7, frameP95: 21.34 },
  sceneCalls: 116,
  postCalls: 18,
  triangles: 16_103,
  programs: 52,
  geometries: 410,
  textures: 37,
  tier: "full",
  renderer: "ANGLE (Apple, Apple M4, OpenGL 4.1)",
  dpr: 2,
  width: 2880,
  height: 1800,
};

const ride: RideSummary = {
  from: "L1",
  to: "L3",
  frames: 140,
  dollyFrames: 96,
  distinctY: 96,
  maxStep: 0.031,
  longestFrameMs: 33.4,
  held: 0.2,
  timedOut: false,
  programs: 0,
  elapsedMs: 2340,
};

describe("perf overlay", () => {
  it("turns on only with ?perf=1", () => {
    expect(perfOverlayOn("?perf=1")).toBe(true);
    expect(perfOverlayOn("?tier=full&perf=1")).toBe(true);
    expect(perfOverlayOn("?perf=1&tier=lite")).toBe(true);
    expect(perfOverlayOn("?perf=10")).toBe(false);
    expect(perfOverlayOn("?perf=0")).toBe(false);
    expect(perfOverlayOn("?superperf=1")).toBe(false);
    expect(perfOverlayOn("")).toBe(false);
  });

  it("formats the five overlay lines", () => {
    expect(perfLines(input)).toEqual([
      "fps p50 58 | p10 52 | frame p95 21.3 ms",
      "calls 116 scene + 18 post | tris 16.1k",
      "programs 52 | geometries 410 | textures 37",
      "tier full | ANGLE (Apple, Apple M4, OpenGL 4.1)",
      "dpr 2.00 | 2880x1800 (5.2 MP)",
    ]);
  });

  it("adds the last elevator ride (P6 ride stats) as a sixth line once a ride ended", () => {
    expect(perfLines({ ...input, ride: null })).toHaveLength(5);
    expect(perfLines({ ...input, ride })[5]).toBe("ride L1 to L3 | 96 dolly frames, jump 3% | longest 33 ms | wait 0.20 s | 0 shaders | 2.34 s");
    expect(perfLines({ ...input, ride: { ...ride, held: 1.5, timedOut: true, programs: 4 } })[5]).toBe(
      "ride L1 to L3 | 96 dolly frames, jump 3% | longest 33 ms | wait 1.50 s (gave up) | 4 shaders | 2.34 s",
    );
  });

  it("shows dashes before any frame was sampled", () => {
    const lines = perfLines({ frames: { count: 0, fpsP50: null, fpsP10: null, frameP95: null }, sceneCalls: 0, postCalls: 0, triangles: 0, programs: 0, geometries: 0, textures: 0, tier: "lite", renderer: "", dpr: 1, width: 0, height: 0 });
    expect(lines[0]).toBe("fps p50 - | p10 - | frame p95 - ms");
    expect(lines[3]).toBe("tier lite | renderer unknown");
  });
});
