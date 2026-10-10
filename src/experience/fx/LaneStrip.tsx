"use client";

import { useEffect, useMemo } from "react";
import { Object3D, type InstancedMesh } from "three";
import { laneRibbonGeometry } from "./geometry";
import { createLaneMaterial } from "./materials";
import { useUniformTime } from "./useUniformTime";

type P = [number, number];
export const LANE_COLOR = "#6366f1";

/**
 * Prototype data lanes: every polyline of a floor as one additive ribbon with edge lines and dashes
 * flowing along it (one draw call), plus junction rings at the path ends (one instanced draw call).
 */
export function LaneStrip({ paths, color = LANE_COLOR, width = 0.75, junctions = true }: { paths: P[][]; color?: string; width?: number; junctions?: boolean }) {
  const geometry = useMemo(() => laneRibbonGeometry(paths, width), [paths, width]);
  const material = useMemo(() => createLaneMaterial(color, 1), [color]);
  const ends = useMemo(() => {
    if (!junctions) return [];
    const seen = new Map<string, P>();
    for (const p of paths) for (const q of [p[0], p[p.length - 1]]) if (q) seen.set(`${q[0].toFixed(1)},${q[1].toFixed(1)}`, q);
    return [...seen.values()];
  }, [paths, junctions]);
  const materials = useMemo(() => [material], [material]);
  useUniformTime(materials);
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );
  const setRings = (mesh: InstancedMesh | null) => {
    if (!mesh) return;
    const d = new Object3D();
    ends.forEach(([x, z], i) => {
      d.position.set(x, 0.02, z);
      d.rotation.set(-Math.PI / 2, 0, 0);
      d.updateMatrix();
      mesh.setMatrixAt(i, d.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  };
  return (
    <group>
      <mesh geometry={geometry} material={material} raycast={() => null} />
      {ends.length > 0 && (
        <instancedMesh key={ends.length} ref={setRings} args={[undefined, undefined, ends.length]} raycast={() => null} frustumCulled={false}>
          <ringGeometry args={[0.42, 0.55, 32]} />
          <meshBasicMaterial color="#818cf8" transparent opacity={0.6} depthWrite={false} toneMapped={false} />
        </instancedMesh>
      )}
    </group>
  );
}
