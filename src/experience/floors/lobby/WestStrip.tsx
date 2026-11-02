"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { Box3, Frustum, Matrix4, Vector3, type Group } from "three";
import { getHQStore } from "@/store/useHQStore";
import type { GpuTier } from "../../types";
import { StageLights } from "./HallFx";
import { lightInstances } from "./hallStage";
import { WEST_STRIP, westStripLights } from "./westStripLayout";

const BOUNDS = new Box3(new Vector3(WEST_STRIP.rect.minX, 0, WEST_STRIP.rect.minZ), new Vector3(WEST_STRIP.rect.maxX, Math.max(...WEST_STRIP.h) + 0.5, WEST_STRIP.rect.maxZ));

/**
 * The west strip's light columns (`westStripLayout.ts`): one instanced draw on the hall's stage lights program (no new program).
 * Hidden during elevator rides (the ride peaks never see it) and while its bounds are out of view (the stage mesh is never
 * frustum culled); reduced motion holds it still.
 */
export function WestStrip({ tier, reducedMotion }: { tier: GpuTier; reducedMotion: boolean }) {
  const group = useRef<Group>(null);
  const instances = useMemo(() => lightInstances(westStripLights(), tier), [tier]);
  const tmp = useMemo(() => ({ box: new Box3(), frustum: new Frustum(), m: new Matrix4() }), []);
  useFrame(({ camera }) => {
    const g = group.current;
    if (!g?.parent) return;
    if (getHQStore().getState().ride) {
      g.visible = false;
      return;
    }
    g.parent.updateWorldMatrix(true, false);
    tmp.frustum.setFromProjectionMatrix(tmp.m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    g.visible = tmp.frustum.intersectsBox(tmp.box.copy(BOUNDS).applyMatrix4(g.parent.matrixWorld));
  });
  return (
    <group ref={group} name="west-strip">
      <StageLights instances={instances} tier={tier} reducedMotion={reducedMotion} />
    </group>
  );
}
