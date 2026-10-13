"use client";

import { advance, useThree } from "@react-three/fiber";
import { useEffect } from "react";
import { audio } from "@/lib/audio";
import { watchCover } from "./coverWatch";
import { framePacer, pacerTick, pauseFrames, resetPacer } from "./framePacer";

/**
 * Drives the canvas (`frameloop="never"`): one R3F `advance` per paced frame, so `useFrame`
 * callbacks, the composer and the render run at most FRAME_CAP_FPS (framePacer.ts), and nothing
 * runs while a `data-hq-cover` panel hides the world (coverWatch.ts). Mount it once, inside the Canvas.
 */
export function FrameLoop() {
  const get = useThree((s) => s.get);
  useEffect(() => {
    resetPacer(framePacer);
    let raf = 0;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const t = pacerTick(framePacer, now);
      if (t !== null) advance(t, true, get());
    };
    raf = requestAnimationFrame(loop);
    const stopWatching = watchCover((covered) => {
      pauseFrames(covered);
      // The Director sets the rumble every frame; while it is paused the engine hum must not hang on.
      if (covered) audio.setRumble(0);
    });
    return () => {
      cancelAnimationFrame(raf);
      stopWatching();
      pauseFrames(false);
    };
  }, [get]);
  return null;
}
