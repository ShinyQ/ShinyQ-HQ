"use client";

import { Bloom, EffectComposer, ToneMapping } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import { sceneSettings } from "./settings";

const BLOOM = sceneSettings("full").bloom!;

/**
 * Full tier only: prototype bloom (threshold 0.32, radius 0.4) on HDR neon, then ACES. The composer
 * turns off renderer tone mapping, so ACES runs as the last effect here. `multisampling` comes from
 * `renderBudget` (4 on desktops, 0 on touch devices).
 */
export default function Effects({ multisampling }: { multisampling: number }) {
  return (
    <EffectComposer multisampling={multisampling}>
      <Bloom mipmapBlur luminanceThreshold={BLOOM.threshold} intensity={BLOOM.intensity} radius={BLOOM.radius} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  );
}
