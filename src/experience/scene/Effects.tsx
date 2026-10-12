"use client";

import { Bloom, EffectComposer, ToneMapping } from "@react-three/postprocessing";
import { ToneMappingMode, type BloomEffect, type EffectComposer as Composer } from "postprocessing";
import { useEffect, useRef } from "react";
import { postHandle } from "./postHandle";
import { sceneSettings } from "./settings";

const BLOOM = sceneSettings("full").bloom!;

/**
 * Full tier only: mipmap bloom (threshold 0.6, intensity 0.9, radius 0.45) on HDR neon, then ACES. The
 * composer turns off renderer tone mapping, so ACES runs as the last effect here. `multisampling` and
 * `levels` are the starting values from `renderBudget`; later changes go through `postHandle`
 * (QualityController), which never rebuilds the composer or recompiles the effect pass.
 */
export default function Effects({ multisampling, levels }: { multisampling: number; levels: number }) {
  const composer = useRef<Composer>(null);
  const bloom = useRef<BloomEffect>(null);
  useEffect(() => {
    postHandle.set({ composer: () => composer.current, bloom: () => bloom.current });
    return () => postHandle.set(null);
  }, []);
  return (
    <EffectComposer ref={composer} multisampling={multisampling}>
      <Bloom ref={bloom} mipmapBlur levels={levels} luminanceThreshold={BLOOM.threshold} intensity={BLOOM.intensity} radius={BLOOM.radius} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  );
}
