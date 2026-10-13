"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { BoxGeometry, CylinderGeometry, Object3D, PlaneGeometry, type Material } from "three";
import { useHQStore } from "@/store/useHQStore";
import { floorY } from "../../config";
import { createHoloMaterial, HOLO_MODE } from "../../fx/holoFx";
import { HoloMesh } from "../../fx/HoloMesh";
import { neonColor } from "../../fx/materials";
import { sceneProbes } from "../../fx/probes";
import { useDispose } from "../../fx/useDispose";
import { useUniformTime } from "../../fx/useUniformTime";
import { buildHorizon, HORIZON } from "./horizonLayout";
import type { CareerRoadLayout } from "./layout";

const NO_RAYCAST = () => null;
const TOWER_TINTS = ["#22d3ee", "#a78bfa", "#f472b6", "#38bdf8"] as const;
const BRIDGE = "#fbbf24";
const SUNRISE = "#fb923c";
const ORIGIN = "#fde68a";
/** Towers fade out over this height above their base (world units). */
const TOWER_FADE = 45;

/** One instanced mesh from a geometry, its per-instance matrices and colors, set at creation (so the floor precompile sees the final program). */
function useInstanced(geometry: BoxGeometry | PlaneGeometry, matrices: Object3D[], colors: string[]) {
  return useMemo(() => {
    const color = new Float32Array(colors.flatMap((c) => neonColor(c, 1, "lite").toArray()));
    const matrix = new Float32Array(matrices.length * 16);
    matrices.forEach((o, i) => {
      o.updateMatrix();
      o.matrix.toArray(matrix, i * 16);
    });
    return { color, matrix, count: matrices.length, geometry };
  }, [geometry, matrices, colors]);
}

/**
 * L2 floor ends (spectacle round): the "Horizon" past the annex window (a light bridge running off the
 * slab, a holographic skyline far below and beyond the tower, a sunrise glow, glow strips in the empty
 * corners leading to the bridge) and the "Origin" light pillar at the west end. Five draw calls, all on
 * the shared holo shader (fog exempt: the skyline reads from the rail camera and the annex). Lite has
 * fewer towers and strips; reduced motion stops every flow.
 */
export function Horizon({ layout }: { layout: CareerRoadLayout }) {
  const tier = useHQStore((s) => s.tier);
  const full = tier === "full";
  const h = useMemo(() => buildHorizon(layout, !full), [layout, full]);

  const plane = useMemo(() => new PlaneGeometry(1, 1).rotateX(-Math.PI / 2), []);
  useDispose(plane);
  const glowPlane = useMemo(() => new PlaneGeometry(1, 1), []);
  useDispose(glowPlane);
  const box = useMemo(() => new BoxGeometry(1, 1, 1).translate(0, 0.5, 0), []);
  useDispose(box);
  const pillar = useMemo(() => new CylinderGeometry(h.pillar.radius, h.pillar.radius * 0.7, h.pillar.height, 32, 1, true), [h.pillar]);
  useDispose(pillar);

  const base = floorY("L2") + HORIZON.skyline.base;
  const mats = useMemo(
    () => ({
      bridge: createHoloMaterial({ mode: HOLO_MODE.flow, color: neonColor(BRIDGE, 1.8, tier), params: [HORIZON.bridge.dashes, 0, 0, 0] }),
      skyline: createHoloMaterial({ mode: HOLO_MODE.skyline, color: neonColor("#ffffff", 1.4, tier), opacity: full ? 0.5 : 0.42, params: [base, TOWER_FADE, 0, 0], fade: [260, 620] }),
      glow: createHoloMaterial({ mode: HOLO_MODE.glow, color: neonColor(SUNRISE, 1.1, tier), opacity: full ? 0.6 : 0.45 }),
      strips: createHoloMaterial({ mode: HOLO_MODE.strip, color: neonColor(BRIDGE, 1.6, tier), opacity: full ? 0.9 : 0.7 }),
      pillar: createHoloMaterial({ mode: HOLO_MODE.pillar, color: neonColor(ORIGIN, 1.8, tier), opacity: full ? 1 : 0.8 }),
    }),
    [tier, full, base],
  );
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);
  const list = useMemo(() => Object.values(mats), [mats]);
  useUniformTime(list);
  useFrame(() => {
    sceneProbes.spectacle["horizon.time"] = mats.bridge.uniforms.uTime.value;
  });
  useEffect(
    () => () => {
      delete sceneProbes.spectacle["horizon.time"];
    },
    [],
  );

  const towerXf = useMemo(
    () =>
      h.towers.map((t) => {
        const o = new Object3D();
        o.position.set(t.x, HORIZON.skyline.base, t.z);
        o.scale.set(t.w, t.top - HORIZON.skyline.base, t.d);
        return o;
      }),
    [h.towers],
  );
  const towerTints = useMemo(() => h.towers.map((_, i) => TOWER_TINTS[i % TOWER_TINTS.length]), [h.towers]);
  const towers = useInstanced(box, towerXf, towerTints);

  const stripXf = useMemo(
    () =>
      h.strips.map((s) => {
        const o = new Object3D();
        o.position.set((s.from.x + s.to.x) / 2, 0.035, s.from.z);
        o.scale.set(Math.abs(s.to.x - s.from.x), 1, s.width);
        return o;
      }),
    [h.strips],
  );
  const stripTints = useMemo(() => h.strips.map(() => "#ffffff"), [h.strips]);
  const strips = useInstanced(plane, stripXf, stripTints);

  const bridgeLength = h.bridge.maxX - h.bridge.minX;
  return (
    <group name="career-horizon">
      <HoloMesh name="career-bridge" geometry={plane} material={mats.bridge} position={[(h.bridge.minX + h.bridge.maxX) / 2, 0.03, 0]} scale={[bridgeLength, 1, h.bridge.maxZ - h.bridge.minZ]} />
      <InstancedSet name="career-skyline" set={towers} material={mats.skyline} />
      <HoloMesh name="career-sunrise" geometry={glowPlane} material={mats.glow} position={[h.glow.x, h.glow.y, h.glow.z]} rotation={[0, -Math.PI / 2, 0]} scale={[h.glow.w, h.glow.h, 1]} />
      <InstancedSet name="career-corner-strips" set={strips} material={mats.strips} />
      <HoloMesh name="career-origin" geometry={pillar} material={mats.pillar} position={[h.pillar.at.x, h.pillar.height / 2, h.pillar.at.z]} />
    </group>
  );
}

function InstancedSet({ name, set, material }: { name: string; set: ReturnType<typeof useInstanced>; material: Material }) {
  return (
    // Frustum culled: the instance matrices exist from creation, so the bounds cover every instance.
    <instancedMesh key={set.count} name={name} args={[set.geometry, material, set.count]} raycast={NO_RAYCAST}>
      <instancedBufferAttribute attach="instanceMatrix" args={[set.matrix, 16]} />
      <instancedBufferAttribute attach="instanceColor" args={[set.color, 3]} />
    </instancedMesh>
  );
}
