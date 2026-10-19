"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useState } from "react";
import { useHQStore } from "@/store/useHQStore";
import { framePacer } from "../scene/framePacer";
import { ridePrep } from "../tower/ridePrep";
import { FrameSampler } from "./frames";
import { perfLines } from "./lines";
import { renderStats } from "./renderStats";

/** Shared by the probe (inside the canvas) and the panel (HTML): the newest 240 frame times and the buffer size. */
const live = { sampler: new FrameSampler(240), dpr: 1, width: 0, height: 0 };

/** Inside the Canvas (`?perf=1` only): one frame time per frame, the pixel ratio and the drawing buffer size. */
export function PerfProbe() {
  const gl = useThree((s) => s.gl);
  useFrame((_, dt) => {
    // FPS is the active rate: idle cadence frames (30 fps or on demand) are left out.
    if (framePacer.cadence === 60) live.sampler.push(dt * 1000);
    live.dpr = gl.getPixelRatio();
    live.width = gl.domElement.width;
    live.height = gl.domElement.height;
  });
  return null;
}

/**
 * `?perf=1` panel for real-device checks (appendix 08 section 2, frame rate row): FPS p50/p10, frame
 * p95, scene and post calls, GPU objects, tier and renderer, DPR and pixels, plus the last elevator
 * ride once one ended (the Director's ride stats, also logged to the console), 4 updates a second.
 * Decorative for assistive tech; never shown without the flag.
 */
export default function PerfOverlay() {
  const tier = useHQStore((s) => s.tier);
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 250);
    return () => window.clearInterval(id);
  }, []);
  const renderer = (window as { __hqProbe?: { renderer?: string } }).__hqProbe?.renderer ?? "";
  const lines = perfLines({
    frames: live.sampler.stats(),
    sceneCalls: renderStats.sceneCalls,
    postCalls: renderStats.postCalls,
    triangles: renderStats.triangles,
    programs: renderStats.programs,
    geometries: renderStats.geometries,
    textures: renderStats.textures,
    tier,
    renderer,
    dpr: live.dpr,
    width: live.width,
    height: live.height,
    ride: ridePrep.lastRide,
  });
  return (
    <div data-testid="perf-overlay" aria-hidden="true" className="pointer-events-none fixed bottom-2 left-2 z-[60] rounded bg-void/85 px-2 py-1 font-mono text-[11px] leading-4 text-ink">
      {lines.map((line, i) => (
        <p key={i} data-perf-line={i}>
          {line}
        </p>
      ))}
    </div>
  );
}
