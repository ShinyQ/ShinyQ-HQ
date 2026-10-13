"use client";

import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef, type RefObject } from "react";
import { CylinderGeometry, InstancedBufferAttribute, Object3D, PlaneGeometry, RingGeometry, type BufferGeometry, type InstancedMesh, type ShaderMaterial, type Texture } from "three";
import { getHQStore } from "@/store/useHQStore";
import type { BatchedLabelsHandle } from "../../fx/BatchedLabels";
import { BLANK_MAP, createHoloMaterial, HOLO_MODE } from "../../fx/holoFx";
import { sceneProbes } from "../../fx/probes";
import { useDispose } from "../../fx/useDispose";
import { roverRuntime } from "../../rover/runtime";
import type { GpuTier, Vec2 } from "../../types";
import { gateSwept, markGateSwept, sweepProgress } from "./gateSweep";
import { FOUNTAIN, gateCrossed } from "./hallGallery";
import { curtainInstance, portalInstance, stageAttributes, type StageInstance } from "./hallStage";

const NO_RAYCAST = () => null;

/**
 * A holo material in the stage mode (`HOLO_MODE.stage`): every option is GL state or a uniform value, so
 * all hall effects share the one holo program with the floating signs and the other floors' spectacle.
 */
export function createStageMaterial(o: { additive: boolean; depthWrite?: boolean }): ShaderMaterial {
  const m = createHoloMaterial({ mode: HOLO_MODE.stage, additive: o.additive, depthWrite: o.depthWrite ?? false });
  m.uniforms.uCenter.value.set(FOUNTAIN.x, FOUNTAIN.z);
  m.uniforms.uSpin.value = FOUNTAIN.spin;
  return m;
}

const cylinder = () => new CylinderGeometry(1, 1, 1, 20, 1, true);
const square = () => new PlaneGeometry(1, 1);
const ring = () => new RingGeometry(0.5, 0.62, 40).rotateX(-Math.PI / 2);

/**
 * One instanced draw of stage effects over a base shape: the instance matrix holds each instance's
 * position and yaw, the instance color its tint, `aStage*` its kind and shape. `frame` runs every frame
 * with the uniforms (`uTime` advances only while `animate`). Never frustum culled (the base geometry's
 * bounds do not cover the instances; `HallView` hides the hall out of view) and never raycast.
 */
function StageMesh({
  base,
  instances,
  additive,
  depthWrite,
  animate,
  frame,
  name,
  visible = true,
}: {
  base: () => BufferGeometry;
  instances: readonly StageInstance[];
  additive: boolean;
  depthWrite?: boolean;
  animate: boolean;
  frame?: (u: ShaderMaterial["uniforms"], dt: number, mesh: InstancedMesh) => void;
  name: string;
  visible?: boolean;
}) {
  const attributes = useMemo(() => stageAttributes(instances), [instances]);
  const geometry = useMemo(() => {
    const g = base();
    g.setAttribute("aStage", new InstancedBufferAttribute(attributes.aStage, 4));
    g.setAttribute("aStage2", new InstancedBufferAttribute(attributes.aStage2, 4));
    g.setAttribute("aStageUv", new InstancedBufferAttribute(attributes.aStageUv, 4));
    return g;
  }, [base, attributes]);
  useDispose(geometry);
  const material = useMemo(() => createStageMaterial({ additive, depthWrite }), [additive, depthWrite]);
  useDispose(material);
  const mesh = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const o = new Object3D();
    instances.forEach((inst, i) => {
      o.position.set(...inst.at);
      o.rotation.set(0, inst.yaw, 0);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  }, [instances, geometry, material]);
  useFrame((_, dt) => {
    const m = mesh.current;
    if (!m) return;
    const u = (m.material as ShaderMaterial).uniforms;
    if (animate) u.uTime.value += Math.min(dt, 0.1);
    frame?.(u, dt, m);
  });
  if (!instances.length) return null;
  return (
    <instancedMesh key={instances.length} ref={mesh} name={name} args={[geometry, material, instances.length]} visible={visible} frustumCulled={false} raycast={NO_RAYCAST}>
      <instancedBufferAttribute attach="instanceColor" args={[attributes.color, 3]} />
    </instancedMesh>
  );
}

/**
 * Fake stage lighting in one draw call: spotlight cones, uplights, the turning fountain beams and the
 * glow pools. Additive on the full tier, normal blending on lite; reduced motion freezes the fountain.
 */
export function StageLights({ instances, tier, reducedMotion }: { instances: readonly StageInstance[]; tier: GpuTier; reducedMotion: boolean }) {
  return <StageMesh name="hall-lights" base={cylinder} instances={instances} additive={tier === "full"} animate={!reducedMotion} />;
}

/** The beacon's pulse rings (one draw call); reduced motion holds them at a third of their growth. */
export function StageRings({ instances, tier, reducedMotion }: { instances: readonly StageInstance[]; tier: GpuTier; reducedMotion: boolean }) {
  return <StageMesh name="hall-rings" base={ring} instances={instances} additive={tier === "full"} animate={!reducedMotion} frame={(u) => (u.uPulse.value = reducedMotion ? 0 : 1)} />;
}

/** The work experience arch's lit opening: a still band of amber light, slow scanlines on the full tier. */
export function StagePortal({ tier, reducedMotion }: { tier: GpuTier; reducedMotion: boolean }) {
  const instances = useMemo(() => [portalInstance(tier)], [tier]);
  return <StageMesh name="hall-portal" base={square} instances={instances} additive={tier === "full"} animate={tier === "full" && !reducedMotion} />;
}

/** Stat tile drift in floor units at time `t` (matches the stage shader), so the tile texts move with their plates. */
export function tileDrift(t: number, phase: number): number {
  return 0.08 * Math.sin(t * 0.6 + phase);
}

/**
 * Stat tile plates, the screenshots on the monoliths and the portrait hologram in one draw call (the
 * atlas is the map; the cells draw the fill color until it loads). On the full tier the tiles drift
 * slowly and their texts in the hall's `BatchedLabels` follow (`tile[i]` marks them), the portrait's
 * scanlines run and it flickers softly; lite and reduced motion hold everything still.
 */
export function StagePanels({ instances, phases, map, tier, reducedMotion, labels, tile }: { instances: readonly StageInstance[]; phases: readonly number[]; map: Texture | null; tier: GpuTier; reducedMotion: boolean; labels: RefObject<BatchedLabelsHandle | null>; tile: readonly number[] }) {
  const animate = tier === "full" && !reducedMotion;
  // Rest heights of the batch members this frame loop moves (reset when the batch rebuilds).
  const base = useRef<{ members: readonly unknown[]; ys: number[] } | null>(null);
  const frame = (u: ShaderMaterial["uniforms"]) => {
    u.uMap.value = map ?? BLANK_MAP;
    u.uLoaded.value = map ? 1 : 0;
    u.uDrift.value = animate ? 1 : 0;
    u.uFlicker.value = animate ? 1 : 0;
    const t = animate ? u.uTime.value : 0;
    const members = labels.current?.members;
    if (!members || members.length !== tile.length) return;
    if (base.current?.members !== members) base.current = { members, ys: members.map((m) => m.position.y) };
    const ys = base.current.ys;
    members.forEach((m, i) => {
      const k = tile[i];
      if (k >= 0) m.position.y = ys[i] + (animate ? tileDrift(t, phases[k]) : 0);
    });
  };
  return <StageMesh name="hall-panels" base={square} instances={instances} additive={false} depthWrite animate={animate} frame={frame} />;
}

/**
 * The gateway arch's light curtain: hidden, until the rover first drives through the arch into the hall
 * in this browser session; then one band of light sweeps down the opening in 0.8 s and the curtain
 * hides again. Never under reduced motion. Probe: `__hq.probes.hallGate`.
 */
export function GateCurtain({ tier, reducedMotion }: { tier: GpuTier; reducedMotion: boolean }) {
  const instances = useMemo(() => [curtainInstance(tier)], [tier]);
  const state = useRef<{ prev: Vec2 | null; t: number | null }>({ prev: null, t: null });
  const frame = (u: ShaderMaterial["uniforms"], dt: number, m: InstancedMesh) => {
    const s = state.current;
    const onL1 = getHQStore().getState().floor === "L1";
    const now = { x: roverRuntime.x, z: roverRuntime.z };
    if (onL1 && s.prev && s.t === null && !reducedMotion && gateCrossed(s.prev, now) && !gateSwept()) {
      markGateSwept();
      s.t = 0;
      sceneProbes.hallGate.sweeps += 1;
    }
    s.prev = onL1 ? now : null;
    if (s.t !== null) {
      s.t += Math.min(dt, 0.1);
      const p = sweepProgress(s.t);
      if (p === null) s.t = null;
      else u.uProgress.value = p;
    }
    const active = s.t !== null;
    sceneProbes.hallGate.active = active;
    m.visible = active;
  };
  return <StageMesh name="hall-gate-curtain" base={square} instances={instances} additive={tier === "full"} animate frame={frame} visible={false} />;
}
