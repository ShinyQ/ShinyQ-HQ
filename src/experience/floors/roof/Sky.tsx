"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { BufferGeometry, Float32BufferAttribute, type Group } from "three";
import { getHQStore } from "@/store/useHQStore";
import { FLOOR_COLOR } from "../../config";
import type { GpuTier } from "../../types";

/** Deterministic PRNG so screenshots and tests see the same sky. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function starGeometry(count: number) {
  const rand = mulberry32(7);
  const pts: number[] = [];
  for (let i = 0; i < count; i++) {
    const theta = rand() * Math.PI * 2;
    const y = 0.08 + rand() * 0.92;
    const r = Math.sqrt(1 - y * y);
    const radius = 150 + rand() * 40;
    pts.push(Math.cos(theta) * r * radius, y * radius, Math.sin(theta) * r * radius);
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pts, 3));
  return g;
}

function cloudGeometry(count: number) {
  const rand = mulberry32(11);
  const pts: number[] = [];
  for (let i = 0; i < count; i++) {
    const theta = rand() * Math.PI * 2;
    const radius = 26 + rand() * 46;
    pts.push(Math.cos(theta) * radius, -8 + rand() * 14, Math.sin(theta) * radius);
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pts, 3));
  return g;
}

/** Open sky over the Roof: a star dome and a slow ring of particle clouds (frozen under reduced motion). */
export function Sky({ tier }: { tier: GpuTier }) {
  const stars = useMemo(() => starGeometry(tier === "full" ? 900 : 500), [tier]);
  const clouds = useMemo(() => cloudGeometry(tier === "full" ? 260 : 120), [tier]);
  const drift = useRef<Group>(null);

  useFrame((_, dt) => {
    if (!drift.current || getHQStore().getState().reducedMotion) return;
    drift.current.rotation.y += Math.min(dt, 0.1) * 0.012;
  });

  return (
    <group name="sky">
      <points geometry={stars}>
        <pointsMaterial color="#e0e7ff" size={2} sizeAttenuation={false} transparent opacity={0.85} fog={false} depthWrite={false} />
      </points>
      <group ref={drift}>
        <points geometry={clouds}>
          <pointsMaterial color={FLOOR_COLOR.RF} size={5} sizeAttenuation={false} transparent opacity={0.35} fog={false} depthWrite={false} toneMapped={false} />
        </points>
      </group>
    </group>
  );
}
