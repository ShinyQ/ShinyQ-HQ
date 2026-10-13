"use client";

import { useMemo } from "react";
import type { BufferGeometry, ShaderMaterial } from "three";

const NO_RAYCAST = () => null;
type V3 = [number, number, number];

/**
 * A single holo-fx mesh drawn as a one-instance `InstancedMesh` with a white instance color, so it
 * shares the one instanced holo program with every other spectacle effect (`fx/holoFx.ts`) instead of
 * adding a non-instanced variant. Never raycast.
 */
export function HoloMesh({ geometry, material, name, position, rotation, scale }: { geometry: BufferGeometry; material: ShaderMaterial; name?: string; position?: V3; rotation?: V3; scale?: V3 }) {
  const color = useMemo(() => new Float32Array([1, 1, 1]), []);
  return (
    <instancedMesh name={name} args={[geometry, material, 1]} position={position} rotation={rotation} scale={scale} frustumCulled={false} raycast={NO_RAYCAST}>
      <instancedBufferAttribute attach="instanceColor" args={[color, 3]} />
    </instancedMesh>
  );
}
