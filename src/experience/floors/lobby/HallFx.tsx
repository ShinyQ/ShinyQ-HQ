"use client";

import { Text } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Color,
  DataTexture,
  DoubleSide,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  NormalBlending,
  PlaneGeometry,
  ShaderMaterial,
  SRGBColorSpace,
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
import { useUniformTime } from "../../fx/useUniformTime";
import { roverRuntime } from "../../rover/runtime";
import { FONTS } from "../../tower/primitives";
import type { GpuTier, Vec2 } from "../../types";
import { gateSwept, markGateSwept, sweepProgress } from "./gateSweep";
import { ARCH, experienceArch, gateCrossed, gateOpening, onFace, type StatTile } from "./hallGallery";
import { HALL } from "./hallLayout";

const NO_RAYCAST = () => null;
const TAIL = `
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// ---------------------------------------------------------------- Light curtain (gate sweep, experience portal)

const CURTAIN_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position, 1.); }`;
const CURTAIN_FS = `uniform vec3 uColor; uniform float uProgress; uniform float uMode; uniform float uTime; uniform float uGain;
varying vec2 vUv;
void main(){
  float edge = smoothstep(0., .06, vUv.x)*smoothstep(1., .94, vUv.x);
  float lines = .75 + .25*sin((vUv.y - uTime*.05)*120.);
  float a;
  if (uMode < .5) {
    float band = exp(-pow((vUv.y - (1. - uProgress))*9., 2.));
    a = (band*.9 + (1. - uProgress)*.18)*lines;
  } else {
    a = (.06 + .3*pow(1. - vUv.y, 1.6))*lines;
  }
  gl_FragColor = vec4(uColor, a*edge*uGain);${TAIL}`;

function useCurtainMaterial(color: string, mode: 0 | 1, tier: GpuTier) {
  const material = useMemo(
    () =>
      new ShaderMaterial({
        name: "hall-curtain",
        uniforms: { uColor: { value: neonColor(color, 1.2, tier) }, uProgress: { value: 0 }, uMode: { value: mode }, uTime: { value: 0 }, uGain: { value: tier === "full" ? 1 : 0.85 } },
        vertexShader: CURTAIN_VS,
        fragmentShader: CURTAIN_FS,
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
        blending: tier === "full" ? AdditiveBlending : NormalBlending,
      }),
    [color, mode, tier],
  );
  useDispose(material);
  return material;
}

/**
 * The gateway arch's light curtain: hidden, until the rover first drives through the arch into the hall
 * in this browser session; then one band of light sweeps down the opening in 0.8 s and the curtain
 * hides again. Never under reduced motion. Probe: `__hq.probes.hallGate`.
 */
export function GateCurtain({ tier, reducedMotion }: { tier: GpuTier; reducedMotion: boolean }) {
  const o = gateOpening();
  const material = useCurtainMaterial(HALL.tone.about, 0, tier);
  const geometry = useMemo(() => new PlaneGeometry(o.maxZ - o.minZ, o.top), [o.maxZ, o.minZ, o.top]);
  useDispose(geometry);
  const mesh = useRef<Mesh>(null);
  const state = useRef<{ prev: Vec2 | null; start: number | null; t: number }>({ prev: null, start: null, t: 0 });
  useFrame((_, dt) => {
    const s = state.current;
    const m = mesh.current;
    const onL1 = getHQStore().getState().floor === "L1";
    const now = { x: roverRuntime.x, z: roverRuntime.z };
    if (onL1 && s.prev && s.start === null && !reducedMotion && gateCrossed(s.prev, now) && !gateSwept()) {
      markGateSwept();
      s.start = 0;
      s.t = 0;
      sceneProbes.hallGate.sweeps += 1;
    }
    s.prev = onL1 ? now : null;
    if (s.start !== null) {
      s.t += Math.min(dt, 0.1);
      const p = sweepProgress(s.t);
      if (p === null) s.start = null;
      else if (m) (m.material as ShaderMaterial).uniforms.uProgress.value = p;
    }
    const active = s.start !== null;
    sceneProbes.hallGate.active = active;
    if (m) m.visible = active;
  });
  return <mesh ref={mesh} name="hall-gate-curtain" geometry={geometry} material={material} position={[o.x, o.top / 2, (o.minZ + o.maxZ) / 2]} rotation={[0, Math.PI / 2, 0]} visible={false} raycast={NO_RAYCAST} />;
}

/** The work experience arch's lit opening: a still band of amber light, slow scanlines on the full tier. */
export function PortalGlow({ tier }: { tier: GpuTier }) {
  const arch = experienceArch();
  const material = useCurtainMaterial(HALL.tone.experience, 1, tier);
  const materials = useMemo(() => (tier === "full" ? [material] : []), [material, tier]);
  useUniformTime(materials);
  const geometry = useMemo(() => new PlaneGeometry(arch.opening.w, arch.opening.h), [arch.opening.w, arch.opening.h]);
  useDispose(geometry);
  const position = onFace(arch.face, 0, ARCH.h / 2, -ARCH.depth / 2);
  return <mesh name="hall-portal" geometry={geometry} material={material} position={position} rotation={[0, arch.face.yaw, 0]} raycast={NO_RAYCAST} />;
}

// ---------------------------------------------------------------- Stat tiles

const TILE_VS = `attribute vec3 aCenter; attribute vec3 aRight; attribute vec2 aSize; attribute float aPhase;
uniform float uTime; uniform float uDrift;
varying vec2 vLocal; varying vec2 vSize;
void main(){
  vec3 p = aCenter + aRight*(position.x*aSize.x) + vec3(0., position.y*aSize.y + uDrift*.08*sin(uTime*.6 + aPhase), 0.);
  vLocal = (position.xy + .5)*aSize; vSize = aSize;
  gl_Position = projectionMatrix*modelViewMatrix*vec4(p, 1.);
}`;
const TILE_FS = `uniform vec3 uFill; uniform vec3 uLine;
varying vec2 vLocal; varying vec2 vSize;
void main(){
  vec2 d2 = min(vLocal, vSize - vLocal);
  float d = min(d2.x, d2.y);
  float line = 1. - smoothstep(.025, .05, d);
  float glow = (1. - smoothstep(.05, .3, d))*.25;
  gl_FragColor = vec4(mix(uFill + uLine*glow, uLine, line), 1.);${TAIL}`;

/** Stat tile drift in floor units at time `t` (matches the tile shader), so the tile texts move with their plates. */
export function tileDrift(t: number, phase: number): number {
  return 0.08 * Math.sin(t * 0.6 + phase);
}

/**
 * The four About me stat tiles: one instanced, opaque plate per tile with a neon rim drawn in the shader
 * (one draw call). On the full tier they drift slowly up and down and their texts in the hall's
 * `BatchedLabels` follow (`tile[i]` marks them); lite and reduced motion hold them still.
 */
export function StatTiles({ tiles, tier, reducedMotion, labels, tile }: { tiles: readonly StatTile[]; tier: GpuTier; reducedMotion: boolean; labels: RefObject<BatchedLabelsHandle | null>; tile: readonly number[] }) {
  const geometry = useMemo(() => {
    const unit = new PlaneGeometry(1, 1);
    const g = new InstancedBufferGeometry();
    g.index = unit.index;
    g.setAttribute("position", unit.getAttribute("position"));
    g.setAttribute("aCenter", new InstancedBufferAttribute(new Float32Array(tiles.flatMap((t) => onFace(t.face, 0, t.y, 0))), 3));
    g.setAttribute("aRight", new InstancedBufferAttribute(new Float32Array(tiles.flatMap((t) => [t.face.right.x, 0, t.face.right.z])), 3));
    g.setAttribute("aSize", new InstancedBufferAttribute(new Float32Array(tiles.flatMap((t) => [t.w, t.h])), 2));
    g.setAttribute("aPhase", new InstancedBufferAttribute(new Float32Array(tiles.map((t) => t.phase)), 1));
    g.instanceCount = tiles.length;
    unit.dispose();
    return g;
  }, [tiles]);
  useDispose(geometry);
  const drift = tier === "full" && !reducedMotion;
  const material = useMemo(
    () =>
      new ShaderMaterial({
        name: "hall-tiles",
        uniforms: { uTime: { value: 0 }, uDrift: { value: 0 }, uFill: { value: new Color("#0b1020") }, uLine: { value: neonColor(HALL.tone.about, 1.4, tier) } },
        vertexShader: TILE_VS,
        fragmentShader: TILE_FS,
        side: DoubleSide,
      }),
    [tier],
  );
  useDispose(material);
  // Rest heights of the batch members this frame loop moves (reset when the batch rebuilds).
  const base = useRef<{ members: readonly unknown[]; ys: number[] } | null>(null);
  const mesh = useRef<Mesh>(null);
  useFrame((_, dt) => {
    const u = (mesh.current?.material as ShaderMaterial | undefined)?.uniforms;
    if (!u) return;
    u.uDrift.value = drift ? 1 : 0;
    const t = drift ? (u.uTime.value += Math.min(dt, 0.1)) : 0;
    const members = labels.current?.members;
    if (!members || members.length !== tile.length) return;
    if (base.current?.members !== members) base.current = { members, ys: members.map((m) => m.position.y) };
    const ys = base.current.ys;
    members.forEach((m, i) => {
      const k = tile[i];
      if (k >= 0) m.position.y = ys[i] + (drift ? tileDrift(t, tiles[k].phase) : 0);
    });
  });
  if (!tiles.length) return null;
  return <mesh ref={mesh} name="hall-tiles" geometry={geometry} material={material} frustumCulled={false} raycast={NO_RAYCAST} />;
}

// ---------------------------------------------------------------- Portrait hologram

const HOLO_VS = `uniform vec4 uCell; varying vec2 vUv; varying vec2 vDisc;
void main(){ vDisc = uv*2. - 1.; vUv = vec2(mix(uCell.x, uCell.z, uv.x), mix(uCell.y, uCell.w, uv.y)); gl_Position = projectionMatrix*modelViewMatrix*vec4(position, 1.); }`;
const HOLO_FS = `uniform sampler2D uMap; uniform float uTime; uniform float uFlicker; uniform vec3 uTint;
varying vec2 vUv; varying vec2 vDisc;
void main(){
  vec3 c = texture2D(uMap, vUv).rgb;
  c = mix(c, c*uTint, .35);
  float scan = .86 + .14*sin(vDisc.y*90. - uTime*2.);
  float flick = 1. - uFlicker*.08*step(.93, fract(sin(floor(uTime*9.)*43.7)*4375.85));
  float r = length(vDisc);
  float rim = smoothstep(.8, 1., r)*.6;
  gl_FragColor = vec4(c*scan*flick + uTint*rim*.35, 1.);${TAIL}`;

/** A 1 x 1 dark texture, so the portrait's program compiles with the hall (before the atlas loads). */
function placeholder(): DataTexture {
  const t = new DataTexture(new Uint8Array([11, 16, 32, 255]), 1, 1);
  t.colorSpace = SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

/**
 * The owner's portrait as a hologram disc over the pedestal: the atlas photo cell on a circle, a cyan
 * tint, scanlines (moving on the full tier) and a soft flicker on the full tier only. Opaque, so it
 * never sorts against the texts.
 */
export function PortraitHolo({ center, yaw, radius, map, cell, tier }: { center: [number, number, number]; yaw: number; radius: number; map: Texture | null; cell: [number, number, number, number]; tier: GpuTier }) {
  const dark = useMemo(() => placeholder(), []);
  useDispose(dark);
  const geometry = useMemo(() => new CircleGeometry(radius, 48), [radius]);
  useDispose(geometry);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        name: "hall-portrait",
        uniforms: { uMap: { value: dark }, uCell: { value: [0, 0, 1, 1] }, uTime: { value: 0 }, uFlicker: { value: tier === "full" ? 1 : 0 }, uTint: { value: new Color("#7dd3fc") } },
        vertexShader: HOLO_VS,
        fragmentShader: HOLO_FS,
      }),
    [dark, tier],
  );
  useDispose(material);
  const mesh = useRef<Mesh>(null);
  useEffect(() => {
    const u = (mesh.current?.material as ShaderMaterial | undefined)?.uniforms;
    if (!u) return;
    u.uMap.value = map ?? dark;
    u.uCell.value = cell;
  }, [map, dark, cell, material]);
  const materials = useMemo(() => (tier === "full" ? [material] : []), [material, tier]);
  useUniformTime(materials);
  return <mesh ref={mesh} name="hall-portrait" geometry={geometry} material={material} position={center} rotation={[0, yaw, 0]} raycast={NO_RAYCAST} />;
}

// ---------------------------------------------------------------- Gateway sign

/** troika's laid-out text block: [minX, minY, maxX, maxY] in local units. */
type TextSync = { textRenderInfo?: { blockBounds?: number[] } };

function outline(w: number, h: number): BufferGeometry {
  const [x, y] = [w / 2, h / 2];
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array([-x, -y, 0, x, -y, 0, x, -y, 0, x, y, 0, x, y, 0, -x, y, 0, -x, y, 0, -x, -y, 0]), 3));
  return g;
}

/**
 * "HIGHLIGHTS HALL" floating above the gateway arch (owner request 2026-10-13: no words on the floor),
 * in the style of the L3 wing signs: it turns to the camera every frame (yaw only, never mirrored) on a
 * dark backing with a neon outline in the hall's accent.
 */
export function GateSign({ text, tier }: { text: string; tier: GpuTier }) {
  const g = HALL.gate;
  const o = gateOpening();
  const group = useRef<Group>(null);
  const world = useMemo(() => new Vector3(), []);
  const [box, setBox] = useState<number[] | null>(null);
  const neon = useMemo(() => neonColor(HALL.tone.about, 1.4, tier), [tier]);
  const size = box ? { w: box[2] - box[0] + 0.8, h: box[3] - box[1] + 0.4, x: (box[0] + box[2]) / 2, y: (box[1] + box[3]) / 2 } : null;
  const edge = useMemo(() => (size ? outline(size.w, size.h) : null), [size?.w, size?.h]); // eslint-disable-line react-hooks/exhaustive-deps
  useDispose(edge);
  useFrame(({ camera }) => {
    const grp = group.current;
    if (!grp) return;
    grp.getWorldPosition(world);
    grp.rotation.y = yawTowards({ x: world.x, z: world.z }, { x: camera.position.x, z: camera.position.z });
  });
  return (
    <group ref={group} name="hall-gate-sign" position={[g.x, g.signY, (o.minZ + o.maxZ) / 2]}>
      {size && (
        <>
          <mesh position={[size.x, size.y, -0.02]} raycast={NO_RAYCAST}>
            <planeGeometry args={[size.w, size.h]} />
            <meshBasicMaterial color="#05050c" transparent opacity={0.9} depthWrite={false} toneMapped={false} />
          </mesh>
          {edge && (
            <lineSegments geometry={edge} position={[size.x, size.y, -0.01]} raycast={NO_RAYCAST}>
              <lineBasicMaterial color={neon} toneMapped={false} />
            </lineSegments>
          )}
        </>
      )}
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
          if (b) setBox([b[0], b[1], b[2], b[3]]);
        }}
      >
        {text.toUpperCase()}
      </Text>
    </group>
  );
}
