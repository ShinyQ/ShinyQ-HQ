"use client";

import { advance, useThree } from "@react-three/fiber";
import { useEffect } from "react";
import { audio } from "@/lib/audio";
import { subscribeDayNight } from "@/lib/day-night";
import { getHQStore } from "@/store/useHQStore";
import { ACTIVITY_EVENTS } from "../rover/activity";
import { roverRuntime } from "../rover/runtime";
import { watchCover } from "./coverWatch";
import { framePacer, invalidateFrames, pacerTick, pauseFrames, resetPacer, setPacerCadence, wakeFrameAt } from "./framePacer";
import { IDLE_HEARTBEAT_MS, idleCadence, idleRuntime, noteActivity, observeFrame, resetIdle, sceneBusy } from "./idle";

/** Input that wakes the canvas to 60 fps (window, capture phase). */
const WAKE_EVENTS = [...ACTIVITY_EVENTS, "resize"] as const;

/**
 * Drives the canvas (`frameloop="never"`): one R3F `advance` per paced frame, so `useFrame`
 * callbacks, the composer and the render run at most FRAME_CAP_FPS (framePacer.ts), at the idle
 * cadence while nothing moves (idle.ts), and not at all while a `data-hq-cover` panel hides the world
 * (coverWatch.ts). Mount it once, inside the Canvas.
 */
export function FrameLoop() {
  const get = useThree((s) => s.get);
  const set = useThree((s) => s.set);
  useEffect(() => {
    resetPacer(framePacer);
    resetIdle(performance.now());
    // R3F invalidates on prop changes, mounts and text syncs (a no-op with frameloop "never"): render them at any cadence.
    const r3fInvalidate = get().invalidate;
    set({ invalidate: invalidateFrames });
    const pose = [0, 0, 0, 0];
    let raf = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const s = getHQStore().getState();
      setPacerCadence(framePacer, idleCadence(idleRuntime, now, s.reducedMotion, s.floor), now);
      const t = pacerTick(framePacer, now);
      if (t === null) return;
      const state = get();
      advance(t, true, state);
      const r = roverRuntime;
      pose[0] = r.x;
      pose[1] = r.y;
      pose[2] = r.z;
      pose[3] = r.heading;
      observeFrame(state.camera, pose, sceneBusy(s, r), now);
      wakeFrameAt(t + IDLE_HEARTBEAT_MS / 1000);
    };
    raf = requestAnimationFrame(loop);
    // Any input, store change, resize or Day and night change: 60 fps from the next animation frame.
    const wake = () => {
      const now = performance.now();
      noteActivity(now);
      setPacerCadence(framePacer, 60, now);
    };
    const options = { capture: true, passive: true } as const;
    for (const type of WAKE_EVENTS) window.addEventListener(type, wake, options);
    const stopStore = getHQStore().subscribe(wake);
    const stopDayNight = subscribeDayNight(wake);
    const stopWatching = watchCover((covered) => {
      pauseFrames(covered);
      // The Director sets the rumble every frame; while it is paused the engine hum must not hang on.
      if (covered) audio.setRumble(0);
    });
    return () => {
      cancelAnimationFrame(raf);
      for (const type of WAKE_EVENTS) window.removeEventListener(type, wake, options);
      stopStore();
      stopDayNight();
      stopWatching();
      pauseFrames(false);
      set({ invalidate: r3fInvalidate });
    };
  }, [get, set]);
  return null;
}
