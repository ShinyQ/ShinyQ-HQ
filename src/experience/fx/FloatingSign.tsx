"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { InstancedBufferAttribute, Object3D, PlaneGeometry, Vector3, type Group, type InstancedMesh } from "three";
import { labelFade } from "../floors/career/layout";
import { roverRuntime } from "../rover/runtime";
import { FONTS } from "../tower/primitives";
import type { GpuTier } from "../types";
import { BatchedLabels, type BatchedLabelsHandle } from "./BatchedLabels";
import { orbitXZ, signFacing, signFacingDot, signPlate, type SignSpec } from "./signLayout";
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
 * `fadeX` (L2); with every sign faded out the group draws nothing. `name` keys the `__hq.probes.signs` entry e2e reads. Not raycast: clickable signs are
 * point-and-go targets (interact/registry.ts).
 */
export function FloatingSigns({
  signs,
  name,
  tier,
  orbit,
  visibility,
}: {
  signs: readonly SignSpec[];
  name: string;
  tier: GpuTier;
  /** Orbit angle (rad) for signs marked `orbit` (the L4 topic labels ride the constellation). */
  orbit?: { readonly current: number };
  /** Per-sign opacity multiplier, 0 to 1, written by the caller every frame (the L4 label placement); missing entries count as 1. */
  visibility?: { readonly current: ArrayLike<number> };
}) {
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
  // Instance colors exist from creation, so the floor's precompile builds the instanced-color program.
  const colors = useMemo(() => new Float32Array(signs.flatMap((s) => neonColor(s.color, 1.5, tier).toArray())), [signs, tier]);

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
    const alphas = mesh.geometry.getAttribute("aAlpha") as InstancedBufferAttribute;
    g.getWorldPosition(origin);
    const cam = { x: camera.position.x, z: camera.position.z };
    const members = batch.current?.members;
    const probe: { text: string; facing: number }[] = [];
    let any = false;
    const angle = orbit?.current ?? 0;
    signs.forEach((s, i) => {
      const local = s.orbit && angle ? orbitXZ(s.x, s.z, angle) : { x: s.x, z: s.z };
      const at = { x: origin.x + local.x, z: origin.z + local.z };
      const yaw = signFacing(at, cam);
      const k = (s.fadeX === undefined ? 1 : labelFade(s.fadeX - roverRuntime.x)) * (visibility?.current[i] ?? 1);
      const shown = k > 0.01;
      dummy.position.set(local.x, s.y, local.z);
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
      if (shown) {
        any = true;
        probe.push({ text: s.text, facing: signFacingDot(yaw, at, cam) });
      }
    });
    mesh.instanceMatrix.needsUpdate = true;
    alphas.needsUpdate = true;
    // Every sign faded out (L2 far from its plazas): skip both draw calls.
    mesh.visible = any;
    if (batch.current) batch.current.batch.visible = any;
    sceneProbes.signs[name] = probe;
  });

  if (!signs.length) return null;
  return (
    <group ref={group} name={name}>
      <instancedMesh key={signs.length} ref={plates} args={[geometry, material, signs.length]} frustumCulled={false} raycast={NO_RAYCAST} renderOrder={1}>
        <instancedBufferAttribute attach="instanceColor" args={[colors, 3]} />
      </instancedMesh>
      <BatchedLabels ref={batch} labels={labels} name={`${name}-text`} renderOrder={2} exactColors />
    </group>
  );
}
