"use client";

import { useMemo } from "react";
import { BoxGeometry, MeshBasicMaterial } from "three";
import { useDispose } from "../../fx/useDispose";
import type { Box } from "../roof/solids";

const NO_RAYCAST = () => null;

/**
 * B1's depth-only boxes (one plain draw each, on the basic program the slab fills already use; neither instanced nor
 * opaque, so no new program variant): they write depth and never color, so they hide what stands behind them (the
 * slab outline's far east edge, `endMask`) without showing themselves. Kept apart from the holo meshes, which must
 * stay instanced (`tests/unit/floating-sign.test.ts`).
 */
export function DepthMask({ boxes }: { boxes: readonly Box[] }) {
  const geometry = useMemo(() => new BoxGeometry(1, 1, 1), []);
  useDispose(geometry);
  // Transparent like the slab fills (three compiles an opaque basic material as another program); drawn first among
  // the transparent draws (`renderOrder`), so the outline after it is hidden.
  const material = useMemo(() => new MeshBasicMaterial({ transparent: true, colorWrite: false }), []);
  useDispose(material);
  return boxes.map((b, i) => (
    <mesh key={i} name="engine-depth-mask" geometry={geometry} material={material} position={[b.x, b.y + b.h / 2, b.z]} scale={[b.w, b.h, b.d]} renderOrder={-1} raycast={NO_RAYCAST} />
  ));
}
