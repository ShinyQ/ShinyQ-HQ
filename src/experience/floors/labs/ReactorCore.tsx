"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { CylinderGeometry, Object3D, PlaneGeometry, RingGeometry, type InstancedMesh } from "three";
import { useHQStore } from "@/store/useHQStore";
import { createHoloMaterial, HOLO_MODE } from "../../fx/holoFx";
import { HoloMesh } from "../../fx/HoloMesh";
import { neonColor } from "../../fx/materials";
import { sceneProbes } from "../../fx/probes";
import { useDispose } from "../../fx/useDispose";
import { useUniformTime } from "../../fx/useUniformTime";
import type { Rect, Vec2 } from "../../types";
import { WING_TINT } from "./layout";
import { REACTOR, reactorSpin, waterfallPanels, WATERFALL } from "./reactor";

const NO_RAYCAST = () => null;
const CORE_COLOR = "#67e8f9";
/** The floor ring around the core's base (one more instance of the orbit ring mesh). */
const BASE_RING = { r: 2.4, y: 0.06 } as const;

/**
 * L3 "Reactor core" in the east plaza (spectacle round): a glowing column with bands rising through it
 * and orbit rings above the rover, in two draw calls (the column, and every ring plus the floor ring in
 * one instanced mesh). The packet-lane spine runs into its west face. Lite shows fewer rings; reduced
 * motion stops the spin and the flow. Both use the shared holo shader (`fx/holoFx.ts`).
 */
export function Reactor({ center }: { center: Vec2 }) {
  const tier = useHQStore((s) => s.tier);
  const reducedMotion = useHQStore((s) => s.reducedMotion);
  const full = tier === "full";
  const column = useMemo(() => new CylinderGeometry(REACTOR.radius * 0.8, REACTOR.radius, REACTOR.height, 32, 1, true), []);
  useDispose(column);
  const ringGeo = useMemo(() => new RingGeometry(0.86, 1, 64, 1), []);
  useDispose(ringGeo);
  const coreMat = useMemo(() => createHoloMaterial({ mode: HOLO_MODE.core, color: neonColor(CORE_COLOR, 2.2, tier), opacity: full ? 0.95 : 0.8 }), [tier, full]);
  useDispose(coreMat);
  const ringMat = useMemo(() => createHoloMaterial({ mode: HOLO_MODE.ring, color: neonColor("#ffffff", 2, tier), opacity: full ? 1 : 0.9, params: [12, 0, 0, 0] }), [tier, full]);
  useDispose(ringMat);
  const materials = useMemo(() => [coreMat, ringMat], [coreMat, ringMat]);
  useUniformTime(materials);

  const rings = useMemo(() => REACTOR.rings.slice(0, full ? REACTOR.rings.length : REACTOR.liteRings), [full]);
  const count = rings.length + 1;
  const mesh = useRef<InstancedMesh>(null);
  const dummy = useMemo(() => new Object3D(), []);
  const angle = useRef(0);
  // Instance colors exist from creation, so the floor's precompile builds the instanced-color program.
  const colors = useMemo(
    () => new Float32Array([...rings.flatMap((_, i) => neonColor(i % 2 ? WING_TINT.ai : WING_TINT.software, 1, "lite").toArray()), ...neonColor(CORE_COLOR, 1, "lite").toArray()]),
    [rings],
  );
  useFrame((_, dt) => {
    const m = mesh.current;
    if (!m) return;
    angle.current += reactorSpin(reducedMotion) * Math.min(dt, 0.1);
    rings.forEach((ring, i) => {
      dummy.position.set(0, ring.y, 0);
      // Lie flat (ring geometry faces +z), tilt, then spin about the column; alternate directions.
      dummy.rotation.set(-Math.PI / 2 + ring.tilt, (i % 2 ? -1 : 1) * angle.current, 0, "YXZ");
      dummy.scale.setScalar(ring.r);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    dummy.position.set(0, BASE_RING.y, 0);
    dummy.rotation.set(-Math.PI / 2, angle.current * 0.5, 0, "YXZ");
    dummy.scale.setScalar(BASE_RING.r);
    dummy.updateMatrix();
    m.setMatrixAt(rings.length, dummy.matrix);
    m.instanceMatrix.needsUpdate = true;
    sceneProbes.spectacle["reactor.spin"] = angle.current;
    sceneProbes.spectacle["reactor.time"] = coreMat.uniforms.uTime.value;
  });
  useEffect(
    () => () => {
      delete sceneProbes.spectacle["reactor.spin"];
      delete sceneProbes.spectacle["reactor.time"];
    },
    [],
  );

  return (
    <group name="labs-reactor" position={[center.x, 0, center.z]}>
      <HoloMesh name="labs-reactor-core" geometry={column} material={coreMat} position={[0, REACTOR.height / 2, 0]} />
      <instancedMesh key={count} ref={mesh} args={[ringGeo, ringMat, count]} frustumCulled={false} raycast={NO_RAYCAST}>
        <instancedBufferAttribute attach="instanceColor" args={[colors, 3]} />
      </instancedMesh>
    </group>
  );
}

/**
 * Data waterfalls pouring off the four slab corners (spectacle round): two panels per corner (one on
 * lite) hanging under the rim, drops falling down columns that fade toward the bottom. One instanced
 * draw. Reduced motion freezes the drops.
 */
export function Waterfalls({ bounds }: { bounds: Rect }) {
  const tier = useHQStore((s) => s.tier);
  const lite = tier !== "full";
  const panels = useMemo(() => waterfallPanels(bounds, lite), [bounds, lite]);
  const geometry = useMemo(() => {
    const g = new PlaneGeometry(1, 1);
    // Top edge at the origin: the panel hangs from the slab rim.
    g.translate(0, -0.5, 0);
    return g;
  }, []);
  useDispose(geometry);
  const material = useMemo(
    () => createHoloMaterial({ mode: HOLO_MODE.fall, color: neonColor("#ffffff", 1.7, tier), opacity: lite ? 0.75 : 1, params: [26, 3, 0, 0] }),
    [tier, lite],
  );
  useDispose(material);
  const materials = useMemo(() => [material], [material]);
  useUniformTime(materials);
  // Matrices exist from creation, so the mesh is frustum culled with bounds that cover every panel.
  const matrices = useMemo(() => {
    const dummy = new Object3D();
    const out = new Float32Array(panels.length * 16);
    panels.forEach((p, i) => {
      dummy.position.set((p.a.x + p.b.x) / 2, 0.08, (p.a.z + p.b.z) / 2);
      dummy.rotation.set(0, Math.atan2(p.out.x, p.out.z), 0);
      dummy.scale.set(WATERFALL.length, WATERFALL.drop, 1);
      dummy.updateMatrix();
      dummy.matrix.toArray(out, i * 16);
    });
    return out;
  }, [panels]);
  const colors = useMemo(() => new Float32Array(panels.flatMap((_, i) => neonColor(i % 2 ? WING_TINT.ai : WING_TINT.software, 1, "lite").toArray())), [panels]);
  useFrame(() => {
    sceneProbes.spectacle["waterfall.time"] = material.uniforms.uTime.value;
  });
  useEffect(
    () => () => {
      delete sceneProbes.spectacle["waterfall.time"];
    },
    [],
  );
  return (
    <instancedMesh key={panels.length} name="labs-waterfalls" args={[geometry, material, panels.length]} raycast={NO_RAYCAST}>
      <instancedBufferAttribute attach="instanceMatrix" args={[matrices, 16]} />
      <instancedBufferAttribute attach="instanceColor" args={[colors, 3]} />
    </instancedMesh>
  );
}
