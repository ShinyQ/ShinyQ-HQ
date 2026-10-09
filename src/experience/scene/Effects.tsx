"use client";

import { Bloom, EffectComposer } from "@react-three/postprocessing";

/** Bloom for the full tier only (appendix 05: threshold 0.2, strength 0.9, radius 0.6, mipmap blur). */
export default function Effects() {
  return (
    <EffectComposer multisampling={0}>
      <Bloom mipmapBlur luminanceThreshold={0.2} intensity={0.9} radius={0.6} />
    </EffectComposer>
  );
}
