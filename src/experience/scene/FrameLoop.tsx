"use client";

import { advance, useThree } from "@react-three/fiber";
import { useEffect } from "react";
import { framePacer, pacerTick, resetPacer } from "./framePacer";

/**
 * Drives the canvas (`frameloop="never"`): one R3F `advance` per paced frame, so `useFrame`
 * callbacks, the composer and the render run at most FRAME_CAP_FPS (framePacer.ts). Mount it once,
 * inside the Canvas.
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
    return () => cancelAnimationFrame(raf);
  }, [get]);
  return null;
}
