"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { InstancedBufferAttribute, Object3D, PlaneGeometry, Vector3, type Group, type InstancedMesh } from "three";
import { labelFade } from "../floors/career/layout";
import { roverRuntime } from "../rover/runtime";
import { FONTS } from "../tower/primitives";
import type { GpuTier } from "../types";
import { BatchedLabels, type BatchedLabelsHandle } from "./BatchedLabels";
import { signFacing, signFacingDot, signPlate, type SignSpec } from "./signLayout";
import { createHoloMaterial, HOLO_MODE } from "./holoFx";
import type { BatchedLabel } from "./labelProps";
import { neonColor } from "./materials";
import { sceneProbes } from "./probes";
import { useDispose } from "./useDispose";

const NO_RAYCAST = () => null;
/** Text sits this far in front of its plate (u). */
const TEXT_LIFT = 0.03;

/**
 * Floating signs for one floor in two draw calls: every plate in one instanced mesh (the holo `plate`
 * mode: a dark fill with a neon rim in the sign color) and every text in one `BatchedLabels`. Each
 * frame every sign turns to the camera (yaw only, `signFacing`), so it reads left to right from any
 * camera yaw and never shows its back, and fades with the rover's distance along x when it has a
 * `fadeX` (L2). `name` keys the `__hq.probes.signs` entry e2e reads. Not raycast: clickable signs are
 * point-and-go targets (interact/registry.ts).
 */
export function FloatingSigns({ signs, name, tier }: { signs: readonly SignSpec[]; name: string; tier: GpuTier }) {
  const group = useRef<Group>(null);
  const plates = useRef<InstancedMesh>(null);
  const batch = useRef<BatchedLabelsHandle>(null);
  const sizes = useMemo(() => signs.map(signPlate), [signs]);
  const labels = useMemo<BatchedLabel[]>(
    () =>
      signs.map((s) => ({
        text: s.text,
        position: [s.x, s.y, s.z],
        font: s.font ?? FONTS.monoBold,
        fontSize: s.fontSize,
        letterSpacing: s.letterSpacing ?? 0,
        lineHeight: 1.15,
        textAlign: "center",
        color: s.color,
        fillOpacity: s.opacity ?? 1,
      })),
    [signs],
  );
  const alpha = useMemo(() => new InstancedBufferAttribute(new Float32Array(Math.max(1, signs.length)).fill(1), 1), [signs.length]);
  const geometry = useMemo(() => {
    const g = new PlaneGeometry(1, 1);
    g.setAttribute("aAlpha", alpha);
    return g;
  }, [alpha]);
  useDispose(geometry);
  const material = useMemo(() => createHoloMaterial({ mode: HOLO_MODE.plate, color: neonColor("#ffffff", 1.5, tier) }), [tier]);
  useDispose(material);
  const dummy = useMemo(() => new Object3D(), []);
  const origin = useMemo(() => new Vector3(), []);
  const colorsSet = useRef<InstancedMesh | null>(null);

  useEffect(
    () => () => {
      delete sceneProbes.signs[name];
    },
    [name],
  );

  useFrame(({ camera }) => {
    const g = group.current;
    const mesh = plates.current;
    if (!g || !mesh) return;
    if (colorsSet.current !== mesh) {
      signs.forEach((s, i) => mesh.setColorAt(i, neonColor(s.color, 1.5, tier)));
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      colorsSet.current = mesh;
    }
    const alphas = mesh.geometry.getAttribute("aAlpha") as InstancedBufferAttribute;
    g.getWorldPosition(origin);
    const cam = { x: camera.position.x, z: camera.position.z };
    const members = batch.current?.members;
    const probe: { text: string; facing: number }[] = [];
    signs.forEach((s, i) => {
      const at = { x: origin.x + s.x, z: origin.z + s.z };
      const yaw = signFacing(at, cam);
      const k = s.fadeX === undefined ? 1 : labelFade(s.fadeX - roverRuntime.x);
      const shown = k > 0.01;
      dummy.position.set(s.x, s.y, s.z);
      dummy.rotation.set(-(s.tilt ?? 0), yaw, 0, "YXZ");
      dummy.scale.set(shown ? sizes[i].w : 0, shown ? sizes[i].h : 0, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      alphas.setX(i, k);
      const member = members?.[i];
      if (member) {
        member.position.copy(dummy.position);
        member.rotation.copy(dummy.rotation);
        member.translateZ(TEXT_LIFT);
        member.fillOpacity = shown ? k * (s.opacity ?? 1) : 0;
      }
      if (shown) probe.push({ text: s.text, facing: signFacingDot(yaw, at, cam) });
    });
    mesh.instanceMatrix.needsUpdate = true;
    alphas.needsUpdate = true;
    sceneProbes.signs[name] = probe;
  });

  if (!signs.length) return null;
  return (
    <group ref={group} name={name}>
      <instancedMesh ref={plates} args={[geometry, material, signs.length]} frustumCulled={false} raycast={NO_RAYCAST} renderOrder={1} />
      <BatchedLabels ref={batch} labels={labels} name={`${name}-text`} renderOrder={2} exactColors />
    </group>
  );
}
