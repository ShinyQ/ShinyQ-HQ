"use client";

import { ToneMappingMode } from "postprocessing";
import { useLayoutEffect } from "react";
import { postHandle } from "./postHandle";
import { usePostComposer } from "./postComposer";
import { sceneSettings } from "./settings";

const BLOOM = sceneSettings("full").bloom!;

/**
 * Full tier only: mipmap bloom (threshold 0.6, intensity 0.9, radius 0.45) on HDR neon, then ACES. The
 * composer turns off renderer tone mapping, so ACES runs as the last effect here. `multisampling` and
 * `levels` are the starting values from `renderBudget`; later changes go through `postHandle`
 * (QualityController), which never rebuilds the composer or recompiles the effect pass. The handle is
 * published before the first composer frame, so `sceneTarget()` is the composer input from then on.
 */
export default function Effects({ multisampling, levels }: { multisampling: number; levels: number }) {
  const { composer, bloom } = usePostComposer({ multisampling, levels, bloom: BLOOM, toneMapping: ToneMappingMode.ACES_FILMIC });
  useLayoutEffect(() => {
    postHandle.set({ composer: () => composer, bloom: () => bloom });
    return () => postHandle.set(null);
  }, [composer, bloom]);
  return null;
}
