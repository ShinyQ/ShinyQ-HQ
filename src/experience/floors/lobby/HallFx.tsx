"use client";

import { Text } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, useState, type RefObject } from "react";
import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DataTexture,
  DoubleSide,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  NormalBlending,
  PlaneGeometry,
  RingGeometry,
  ShaderMaterial,
  Vector2,
  Vector3,
  type Group,
  type Mesh,
  type Texture,
} from "three";
import { getHQStore } from "@/store/useHQStore";
import type { BatchedLabelsHandle } from "../../fx/BatchedLabels";
import { yawTowards } from "../../fx/facing";
import { neonColor } from "../../fx/materials";
import { sceneProbes } from "../../fx/probes";
import { useDispose } from "../../fx/useDispose";
import { roverRuntime } from "../../rover/runtime";
import { FONTS } from "../../tower/primitives";
import type { GpuTier, Vec2 } from "../../types";
import { gateSwept, markGateSwept, sweepProgress } from "./gateSweep";
import { FOUNTAIN, gateCrossed, gateOpening } from "./hallGallery";
import { HALL } from "./hallLayout";
import { curtainInstance, portalInstance, stageAttributes, STAGE_FS, STAGE_KIND, STAGE_VS, type StageInstance } from "./hallStage";

const NO_RAYCAST = () => null;

// ---------------------------------------------------------------- One stage shader for every hall effect

export interface StageMaterialOptions {
  additive: boolean;
  /** Plates, screenshots and the portrait write depth (they read as solid). */
  depthWrite?: boolean;
  map?: Texture | null;
}

/** A 1 x 1 placeholder, so the map sampler is bound before the atlas loads (`uLoaded` 0 draws the fill color). */
const BLANK = (() => {
  const t = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  t.needsUpdate = true;
  return t;
})();

/**
 * A material on the hall's one stage program (`hallStage.ts`): every option here is GL state or a
 * uniform value, never a program key (same source, double sided, transparent, tone mapped), so all
 * hall effects compile to one program per output color space.
 */
export function createStageMaterial(o: StageMaterialOptions): ShaderMaterial {
  return new ShaderMaterial({
    name: "hall-stage",
    uniforms: {
      uTime: { value: 0 },
      uCenter: { value: new Vector2(FOUNTAIN.x, FOUNTAIN.z) },
      uSpin: { value: FOUNTAIN.spin },
      uDrift: { value: 0 },
      uPulse: { value: 1 },
      uProgress: { value: 0 },
      uFlicker: { value: 0 },
      uLoaded: { value: o.map ? 1 : 0 },
      uMap: { value: o.map ?? BLANK },
      uFill: { value: new Color("#0b1020") },
    },
    vertexShader: STAGE_VS,
    fragmentShader: STAGE_FS,
    transparent: true,
    depthWrite: o.depthWrite ?? false,
    side: DoubleSide,
    blending: o.additive ? AdditiveBlending : NormalBlending,
  });
}

/** Instanced geometry over a base shape with the stage attributes (`stageAttributes`). */
function useStageGeometry(base: () => BufferGeometry, instances: readonly StageInstance[]) {
  const geometry = useMemo(() => {
    const unit = base();
    const g = new InstancedBufferGeometry();
    g.index = unit.index;
    for (const name of ["position", "normal", "uv"]) g.setAttribute(name, unit.getAttribute(name));
    for (const [name, array] of Object.entries(stageAttributes(instances))) g.setAttribute(name, new InstancedBufferAttribute(array, 4));
    g.instanceCount = instances.length;
    return g;
    // `base` is a stable module-level factory.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instances]);
  useDispose(geometry);
  return geometry;
}

const cylinder = () => new CylinderGeometry(1, 1, 1, 20, 1, true);
const square = () => new PlaneGeometry(1, 1);
const ring = () => new RingGeometry(0.5, 0.62, 40).rotateX(-Math.PI / 2);

/** Per-frame uniforms of a stage mesh: `uTime` (frozen when `animate` is off) and anything `extra` sets. */
function useStageFrame(animate: boolean, extra?: (u: ShaderMaterial["uniforms"], dt: number, mesh: Mesh) => void) {
  const mesh = useRef<Mesh>(null);
  useFrame((_, dt) => {
    const u = (mesh.current?.material as ShaderMaterial | undefined)?.uniforms;
    if (!u) return;
    if (animate) u.uTime.value += Math.min(dt, 0.1);
    extra?.(u, dt, mesh.current!);
  });
  return mesh;
}

/**
 * Fake stage lighting in one draw call: spotlight cones, uplights, the turning fountain beams and the
 * glow pools. Additive on the full tier, normal blending on lite; reduced motion freezes the fountain.
 */
export function StageLights({ instances, tier, reducedMotion }: { instances: readonly StageInstance[]; tier: GpuTier; reducedMotion: boolean }) {
  const geometry = useStageGeometry(cylinder, instances);
  const material = useMemo(() => createStageMaterial({ additive: tier === "full" }), [tier]);
  useDispose(material);
  const mesh = useStageFrame(!reducedMotion);
  // The unit geometry's bounds do not cover the instances: never frustum culled (HallView hides the hall out of view).
  return <mesh ref={mesh} name="hall-lights" geometry={geometry} material={material} frustumCulled={false} raycast={NO_RAYCAST} />;
}

/** The beacon's pulse rings (one draw call); reduced motion holds them at a third of their growth. */
export function StageRings({ instances, tier, reducedMotion }: { instances: readonly StageInstance[]; tier: GpuTier; reducedMotion: boolean }) {
  const geometry = useStageGeometry(ring, instances);
  const material = useMemo(() => createStageMaterial({ additive: tier === "full" }), [tier]);
  useDispose(material);
  const mesh = useStageFrame(!reducedMotion, (u) => (u.uPulse.value = reducedMotion ? 0 : 1));
  return <mesh ref={mesh} name="hall-rings" geometry={geometry} material={material} frustumCulled={false} raycast={NO_RAYCAST} />;
}

/** The work experience arch's lit opening: a still band of amber light, slow scanlines on the full tier. */
export function StagePortal({ tier, reducedMotion }: { tier: GpuTier; reducedMotion: boolean }) {
  const instances = useMemo(() => [portalInstance(tier)], [tier]);
  const geometry = useStageGeometry(square, instances);
  const material = useMemo(() => createStageMaterial({ additive: tier === "full" }), [tier]);
  useDispose(material);
  const mesh = useStageFrame(tier === "full" && !reducedMotion);
  return <mesh ref={mesh} name="hall-portal" geometry={geometry} material={material} frustumCulled={false} raycast={NO_RAYCAST} />;
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
  const geometry = useStageGeometry(square, instances);
  const material = useMemo(() => createStageMaterial({ additive: false, depthWrite: true }), []);
  useDispose(material);
  const animate = tier === "full" && !reducedMotion;
  // Rest heights of the batch members this frame loop moves (reset when the batch rebuilds).
  const base = useRef<{ members: readonly unknown[]; ys: number[] } | null>(null);
  const mesh = useStageFrame(animate, (u) => {
    u.uMap.value = map ?? BLANK;
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
  });
  return <mesh ref={mesh} name="hall-panels" geometry={geometry} material={material} frustumCulled={false} raycast={NO_RAYCAST} />;
}

/**
 * The gateway arch's light curtain: hidden, until the rover first drives through the arch into the hall
 * in this browser session; then one band of light sweeps down the opening in 0.8 s and the curtain
 * hides again. Never under reduced motion. Probe: `__hq.probes.hallGate`.
 */
export function GateCurtain({ tier, reducedMotion }: { tier: GpuTier; reducedMotion: boolean }) {
  const instances = useMemo(() => [curtainInstance(tier)], [tier]);
  const geometry = useStageGeometry(square, instances);
  const material = useMemo(() => createStageMaterial({ additive: tier === "full" }), [tier]);
  useDispose(material);
  const state = useRef<{ prev: Vec2 | null; t: number | null }>({ prev: null, t: null });
  const mesh = useStageFrame(true, (u, dt, m) => {
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
  });
  return <mesh ref={mesh} name="hall-gate-curtain" geometry={geometry} material={material} visible={false} frustumCulled={false} raycast={NO_RAYCAST} />;
}

// ---------------------------------------------------------------- Gateway sign

/** troika's laid-out text block: [minX, minY, maxX, maxY] in local units. */
type TextSync = { textRenderInfo?: { blockBounds?: number[] } };

/** The sign's plate in its own frame: a stage tile (dark fill, neon rim) around the text block. */
export function signPlate(box: readonly number[], tier: GpuTier): StageInstance {
  const w = box[2] - box[0] + 0.8;
  const h = box[3] - box[1] + 0.4;
  const line = neonColor(HALL.tone.about, 1.4, tier);
  return { p: [(box[0] + box[2]) / 2, (box[1] + box[3]) / 2, -0.02, STAGE_KIND.tile], s: [w, h, 0, 0], r: [1, 0, 0, 0], c: [line.r, line.g, line.b, 1], u: [0, 0, 1, 1] };
}

function SignPlate({ box, tier }: { box: readonly number[]; tier: GpuTier }) {
  const instances = useMemo(() => [signPlate(box, tier)], [box, tier]);
  const geometry = useStageGeometry(square, instances);
  const material = useMemo(() => createStageMaterial({ additive: false, depthWrite: false }), []);
  useDispose(material);
  return <mesh geometry={geometry} material={material} frustumCulled={false} raycast={NO_RAYCAST} />;
}

/**
 * "HIGHLIGHTS HALL" floating above the gateway arch (owner request 2026-10-13: no words on the floor),
 * in the style of the L3 wing signs: it turns to the camera every frame (yaw only, never mirrored) on a
 * dark plate with a neon rim in the hall's accent (the stage shader's tile).
 */
export function GateSign({ text, tier }: { text: string; tier: GpuTier }) {
  const g = HALL.gate;
  const o = gateOpening();
  const group = useRef<Group>(null);
  const world = useMemo(() => new Vector3(), []);
  const [box, setBox] = useState<number[] | null>(null);
  useFrame(({ camera }) => {
    const grp = group.current;
    if (!grp) return;
    grp.getWorldPosition(world);
    grp.rotation.y = yawTowards({ x: world.x, z: world.z }, { x: camera.position.x, z: camera.position.z });
  });
  return (
    <group ref={group} name="hall-gate-sign" position={[g.x, g.signY, (o.minZ + o.maxZ) / 2]}>
      {box && <SignPlate box={box} tier={tier} />}
      <Text
        font={FONTS.monoBold}
        fontSize={0.75}
        color={HALL.tone.about}
        anchorX="center"
        anchorY="bottom"
        letterSpacing={0.08}
        whiteSpace="nowrap"
        renderOrder={1}
        material-toneMapped={false}
        onSync={(t: TextSync) => {
          const b = t.textRenderInfo?.blockBounds;
          if (b && (!box || b.some((v, i) => Math.abs(v - box[i]) > 1e-4))) setBox([b[0], b[1], b[2], b[3]]);
        }}
      >
        {text.toUpperCase()}
      </Text>
    </group>
  );
}
