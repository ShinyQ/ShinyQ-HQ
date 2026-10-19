"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { getHQStore } from "@/store/useHQStore";
import type { GpuTier } from "../types";
import { createMonitor, MONITOR_FULL, MONITOR_LITE, type FrameMonitor } from "./frameMonitor";
import { framePacer } from "./framePacer";
import { postHandle } from "./postHandle";
import { qualityAt, qualityLadder } from "./quality";
import { qualityDebug, qualityStore } from "./qualityStore";
import { renderBudget, withOverride, type GfxOverride } from "./settings";

/**
 * Runtime safety net (REPORT SP5, Area 8). Recomputes the pixel budget when the canvas resizes, runs
 * the frame monitor in explore, room and hologram phases, and applies the level: the DPR through the
 * store (Experience passes it to `Canvas`), composer MSAA and bloom levels directly on the existing
 * objects. Off under automation and `?gfx=probe` unless `?gfx=monitor-on`.
 */
export function QualityController({ tier, coarse, gfx }: { tier: GpuTier; coarse: boolean; gfx: GfxOverride }) {
  const width = useThree((s) => s.size.width);
  const height = useThree((s) => s.size.height);
  const snapshot = useSyncExternalStore(qualityStore.subscribe, qualityStore.get, qualityStore.get);
  const deviceDpr = window.devicePixelRatio || 1;
  const base = useMemo(() => withOverride(renderBudget(tier, coarse, { width, height, dpr: deviceDpr }), gfx), [tier, coarse, width, height, deviceDpr, gfx]);
  const ladder = useMemo(() => qualityLadder(base, tier, deviceDpr), [base, tier, deviceDpr]);
  const level = Math.min(snapshot.level, ladder.length);
  // The black-frame probe reads pixels back every frame; the monitor would take that stall for a slow GPU.
  const enabled = gfx.monitor ?? (!gfx.probe && !navigator.webdriver);
  const monitor = useRef<FrameMonitor | null>(null);
  const last = useRef<number | null>(null);

  useEffect(() => {
    qualityStore.setApplied(qualityAt(base, tier, deviceDpr, level));
  }, [base, tier, deviceDpr, level]);

  useEffect(() => {
    const saved = qualityStore.get();
    monitor.current = enabled ? createMonitor(tier === "full" ? MONITOR_FULL : MONITOR_LITE, ladder.length, { level: Math.min(saved.level, ladder.length), locked: saved.locked }) : null;
  }, [enabled, tier, ladder.length]);

  useEffect(() => () => qualityStore.setApplied(null), []);

  useFrame(() => {
    // Keep the composer in step with the level (it may load after the first apply).
    const q = qualityStore.applied();
    const post = postHandle.get();
    const composer = post?.composer();
    if (q && composer && composer.multisampling !== q.multisampling) composer.multisampling = q.multisampling;
    const bloom = post?.bloom();
    if (q && bloom && bloom.mipmapBlurPass.levels !== q.bloomLevels) bloom.mipmapBlurPass.levels = q.bloomLevels;

    const m = monitor.current;
    if (!m) return;
    const now = performance.now();
    // Wall-clock time between rendered frames: a paced loop (60 fps cap) renders fewer frames than the
    // display refreshes, and a paused loop shows up as one long gap, which restarts the monitor.
    const dt = last.current === null ? 0 : now - last.current;
    last.current = now;
    const s = getHQStore().getState();
    // Idle cadence frames (30 fps or on demand, idle.ts) are not slow frames.
    if (document.hidden || framePacer.cadence < 60 || s.phase === "boot" || s.phase === "intro" || s.ride || s.beam) {
      m.hold(now);
      return;
    }
    const action = m.push(qualityDebug.simulateFrameMs ?? dt, now);
    if (action) qualityStore.set({ level: m.level, locked: m.locked, flips: qualityStore.get().flips + 1, last: action });
  });

  return null;
}
