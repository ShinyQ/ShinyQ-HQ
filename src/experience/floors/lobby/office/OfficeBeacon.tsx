"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { Color, CylinderGeometry, InstancedBufferAttribute, type InstancedMesh } from "three";
import { getHQStore } from "@/store/useHQStore";
import { COLORS } from "../../../config";
import { sceneProbes } from "../../../fx/probes";
import { useDispose } from "../../../fx/useDispose";
import { createStageMaterial } from "../HallFx";
import { atOfficeStop } from "../officeShell";
import { BEACON, beaconGain, beaconInstances, beaconOrigin, type BeaconInstance } from "./beacon";
import { officeSignal } from "./officeSignal";

const NO_RAYCAST = () => null;
const INST = Array.from({ length: BEACON.slots }, (): BeaconInstance => ({ y: 0, r: 0, h: 0, alpha: 0 }));
const PINK = new Color(COLORS.pink).toArray();
const stage = () => new InstancedBufferAttribute(new Float32Array(BEACON.slots * 4), 4);

/**
 * The Needs Kurniadi beacon over the wing (main path): one instanced draw of `STAGE_KIND.beam` (0) instances on the
 * hall's stage program (instance colors like the hall, so the same defines; additive is GL state), the column and its
 * rising bands, in the asking state's pink. The stage shader takes only the position from the instance matrix and the
 * shape from `aStage` (beams never read `aStageUv`), so every instance starts as a zero-size beam (all zeros) and slot 4
 * (stage B's deploy beam) stays one. No React state: the frame reads the signal and keeps the mesh out of the draw while
 * nobody asks. `OfficeMount` mounts it once `ready` (the full tier's composer exists), so no canvas-target program compiles.
 */
export function OfficeBeacon() {
  const geometry = useMemo(() => new CylinderGeometry(1, 1, 1, 20, 1, true).setAttribute("aStage", stage()).setAttribute("aStage2", stage()), []);
  useDispose(geometry);
  const material = useMemo(() => createStageMaterial({ additive: true }), []);
  useDispose(material);
  const color = useMemo(() => new Float32Array(BEACON.slots * 3).map((_, i) => PINK[i % 3]), []);
  const mesh = useRef<InstancedMesh>(null);
  const t = useRef(0);
  useFrame((_, dt) => {
    const m = mesh.current;
    if (!m) return;
    sceneProbes.office.beacon = m.visible = officeSignal.needsKurniadi;
    if (!m.visible) return;
    beaconInstances((t.current += Math.min(dt, 0.1)), getHQStore().getState().reducedMotion, INST);
    const o = beaconOrigin(officeSignal.asking);
    const gain = beaconGain(atOfficeStop());
    const at = m.instanceMatrix.array;
    const { aStage, aStage2 } = m.geometry.attributes;
    const s = aStage.array;
    for (let i = 0; i <= BEACON.bands; i++) {
      const b = INST[i];
      at[i * 16 + 12] = o.x;
      at[i * 16 + 13] = b.y;
      at[i * 16 + 14] = o.z;
      s[i * 4 + 1] = b.h;
      s[i * 4 + 2] = s[i * 4 + 3] = b.r;
      aStage2.array[i * 4 + 3] = b.alpha * gain;
    }
    m.instanceMatrix.needsUpdate = aStage.needsUpdate = aStage2.needsUpdate = true;
  });
  return (
    <instancedMesh ref={mesh} name="office-beacon" args={[geometry, material, BEACON.slots]} visible={false} frustumCulled={false} raycast={NO_RAYCAST}>
      <instancedBufferAttribute attach="instanceColor" args={[color, 3]} />
    </instancedMesh>
  );
}
