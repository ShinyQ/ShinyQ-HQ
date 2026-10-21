"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { Color, CylinderGeometry, InstancedBufferAttribute, type InstancedMesh } from "three";
import { getHQStore } from "@/store/useHQStore";
import { COLORS, LOBBY } from "../../../config";
import { sceneProbes } from "../../../fx/probes";
import { useDispose } from "../../../fx/useDispose";
import { createStageMaterial } from "../HallFx";
import { officeDockPad } from "../officeLayout";
import { atOfficeStop } from "../officeShell";
import { BEAM, BEACON, beaconGain, beaconInstances, beaconOrigin, beamInstance, beamSince, putInstance, type BeaconInstance, type BeamClock } from "./beacon";
import { officeSignal } from "./officeSignal";

const NO_RAYCAST = () => null;
const INST = Array.from({ length: BEACON.slots }, (): BeaconInstance => ({ y: 0, r: 0, h: 0, alpha: 0 }));
const PINK = new Color(COLORS.pink).toArray();
const GREEN = new Color(COLORS.green).toArray();
const DOCK = officeDockPad(LOBBY.officeWing);
const ORIGIN = { x: 0, z: 0 };
const stage = () => new InstancedBufferAttribute(new Float32Array(BEACON.slots * 4), 4);

/**
 * The Needs Kurniadi beacon over the wing and the production deploy beam over the ship dock (beacon chunk,
 * `beaconChunk.ts`): one instanced draw of `STAGE_KIND.beam` (0) instances on the hall's stage program (instance colors
 * like the hall, so the same defines; additive is GL state), the column and its rising bands in the asking state's pink
 * (0 to 3) and the beam in green (`BEAM.slot`). The stage shader takes only the position from the instance matrix and
 * the shape from `aStage` (beams never read `aStageUv`), so every instance starts as a zero-size beam (all zeros). No
 * React state: the frame reads the signal and draws the mesh while a Rover asks or a beam runs (1 call either way),
 * else keeps it out of the draw. The bands pulse on clamped frame deltas; the beam times its 8 s on the R3F clock (rendered
 * time, `__hq.clock()`), never on clamped deltas, which on frames over 0.1 s (a slow GPU, SwiftShader) would stretch it to 80
 * frames. `OfficeMount`
 * mounts it once the chunk loaded (the watch chunk loads it on the first ask or the first fresh deploy) and `ready`
 * (the full tier's composer exists), so no canvas-target program compiles; it stays mounted.
 */
export function OfficeBeacon() {
  const geometry = useMemo(() => new CylinderGeometry(1, 1, 1, 20, 1, true).setAttribute("aStage", stage()).setAttribute("aStage2", stage()), []);
  useDispose(geometry);
  const material = useMemo(() => createStageMaterial({ additive: true }), []);
  useDispose(material);
  const color = useMemo(() => new Float32Array(BEACON.slots * 3).map((_, i) => (i >= BEAM.slot * 3 ? GREEN : PINK)[i % 3]), []);
  const mesh = useRef<InstancedMesh>(null);
  const t = useRef(0);
  const beam = useRef<BeamClock>({ deployAt: null, t0: 0 });
  useFrame(({ clock }, dt) => {
    const m = mesh.current;
    if (!m) return;
    const now = (t.current += Math.min(dt, 0.1));
    const asking = officeSignal.needsKurniadi;
    const since = beamSince(officeSignal.deployAt, clock.elapsedTime, beam.current);
    sceneProbes.office.beacon = asking;
    sceneProbes.office.beam = since !== null;
    m.visible = asking || since !== null;
    if (!m.visible) return;
    const stop = atOfficeStop();
    const reduced = getHQStore().getState().reducedMotion;
    const gain = beaconGain(stop);
    beaconInstances(now, reduced, INST, gain.reach);
    if (!asking) for (let i = 0; i <= BEACON.bands; i++) putInstance(INST[i], 0, 0, 0, 0);
    beamInstance(since, reduced, stop, INST[BEAM.slot]);
    const o = beaconOrigin(officeSignal.asking, ORIGIN);
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
      aStage2.array[i * 4 + 3] = b.alpha * (i === 0 ? gain.column : gain.bands);
    }
    const b = INST[BEAM.slot];
    const k = BEAM.slot;
    at[k * 16 + 12] = DOCK.x;
    at[k * 16 + 13] = b.y;
    at[k * 16 + 14] = DOCK.z;
    s[k * 4 + 1] = b.h;
    s[k * 4 + 2] = s[k * 4 + 3] = b.r;
    aStage2.array[k * 4 + 3] = b.alpha;
    m.instanceMatrix.needsUpdate = aStage.needsUpdate = aStage2.needsUpdate = true;
  });
  return (
    <instancedMesh ref={mesh} name="office-beacon" args={[geometry, material, BEACON.slots]} visible={false} frustumCulled={false} raycast={NO_RAYCAST}>
      <instancedBufferAttribute attach="instanceColor" args={[color, 3]} />
    </instancedMesh>
  );
}
