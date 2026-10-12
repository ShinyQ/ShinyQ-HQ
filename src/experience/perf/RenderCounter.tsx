"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useLayoutEffect } from "react";
import { closeFrame, instrumentRenderer, resetRenderStats, type RendererLike } from "./renderStats";

/**
 * Counts scene draw calls and post-processing passes per frame (renderStats). The negative priority
 * runs it before every other frame callback without taking over rendering (R3F switches to manual
 * rendering only for priorities above 0).
 */
export function RenderCounter() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  useLayoutEffect(() => {
    resetRenderStats();
    return instrumentRenderer(gl as unknown as RendererLike, (s) => s === scene);
  }, [gl, scene]);
  useFrame(() => closeFrame(), -100);
  return null;
}
