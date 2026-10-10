"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { AdditiveBlending, BufferGeometry, Float32BufferAttribute, type Points } from "three";

/** Ambient dust motes from the prototype: drifting additive points over the current floor (full tier only). */
export function Motes({ count = 260, area = 50, height = 6, center = [0, 0, 0] }: { count?: number; area?: number; height?: number; center?: [number, number, number] }) {
  const points = useRef<Points>(null);
  const geometry = useMemo(() => {
    // Deterministic scatter so renders stay pure.
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (rand() - 0.5) * area;
      pos[i * 3 + 1] = 0.3 + rand() * height;
      pos[i * 3 + 2] = (rand() - 0.5) * area;
    }
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(pos, 3));
    return g;
  }, [count, area, height]);
  useFrame((_, dt) => {
    if (points.current) points.current.rotation.y += Math.min(dt, 0.1) * 0.01;
  });
  return (
    <points ref={points} geometry={geometry} position={center} raycast={() => null}>
      <pointsMaterial color="#818cf8" size={0.06} transparent opacity={0.6} blending={AdditiveBlending} depthWrite={false} />
    </points>
  );
}
