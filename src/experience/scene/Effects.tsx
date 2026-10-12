"use client";

import { Bloom, EffectComposer, ToneMapping } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import { sceneSettings } from "./settings";

const BLOOM = sceneSettings("full").bloom!;

/**
 * Full tier only: mipmap bloom (threshold 0.6, intensity 0.9, radius 0.45) on HDR neon, then ACES. The
 * composer turns off renderer tone mapping, so ACES runs as the last effect here. `multisampling` and
 * `levels` come from `renderBudget`.
 */
export default function Effects({ multisampling, levels }: { multisampling: number; levels: number }) {
  return (
    <EffectComposer multisampling={multisampling}>
      <Bloom mipmapBlur levels={levels} luminanceThreshold={BLOOM.threshold} intensity={BLOOM.intensity} radius={BLOOM.radius} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  );
}
