"use client";

import { advance, useThree } from "@react-three/fiber";
import { useEffect } from "react";
import { audio } from "@/lib/audio";
import { getHQStore } from "@/store/useHQStore";
import { activity } from "../rover/activity";
import { roverRuntime } from "../rover/runtime";
import { watchCover } from "./coverWatch";
import { framePacer, idleRuntime, invalidateFrames, pacerTick, pauseFrames, resetPacer, setPacerCadence } from "./framePacer";
import { idleCadence, observeFrame, resetIdle, sceneBusy } from "./idle";

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
    set({ invalidate: () => invalidateFrames() });
    let raf = 0;
    let seq = activity.seq;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      // Input (the rover's activity counter: keys, pointer, wheel, touch, intents) counts from this frame on.
      if (activity.seq !== seq) {
        seq = activity.seq;
        idleRuntime.lastActivity = now;
      }
      const s = getHQStore().getState();
      setPacerCadence(framePacer, idleCadence(idleRuntime, now, s.reducedMotion, s.floor), now);
      const t = pacerTick(framePacer, now);
      if (t === null) return;
      const state = get();
      advance(t, true, state);
      observeFrame(state.camera, sceneBusy(s, roverRuntime), now);
    };
    raf = requestAnimationFrame(loop);
    // A store change (hover, ride, room, setting) or a resize: 60 fps from the next animation frame.
    const wake = () => {
      idleRuntime.lastActivity = performance.now();
    };
    addEventListener("resize", wake);
    const stopStore = getHQStore().subscribe(wake);
    const stopWatching = watchCover((covered) => {
      pauseFrames(covered);
      // The Director sets the rumble every frame; while it is paused the engine hum must not hang on.
      if (covered) audio.setRumble(0);
    });
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener("resize", wake);
      stopStore();
      stopWatching();
      pauseFrames(false);
    };
  }, [get, set]);
  return null;
}
