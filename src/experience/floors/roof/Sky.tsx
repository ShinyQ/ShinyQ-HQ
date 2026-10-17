"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { BufferGeometry, Float32BufferAttribute, type Group, type PointsMaterial } from "three";
import { getHQStore } from "@/store/useHQStore";
import { FLOOR_COLOR } from "../../config";
import { useDispose } from "../../fx/useDispose";
import { skyRuntime } from "../../sky/skyRuntime";
import type { GpuTier } from "../../types";
import { mulberry32 } from "./solids";

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
  useDispose(stars);
  useDispose(clouds);
  const drift = useRef<Group>(null);
  const starMaterial = useRef<PointsMaterial>(null);

  useFrame((_, dt) => {
    if (starMaterial.current) starMaterial.current.opacity = 0.85 * skyRuntime.stars;
    if (!drift.current || getHQStore().getState().reducedMotion) return;
    drift.current.rotation.y += Math.min(dt, 0.1) * 0.012;
  });

  return (
    <group name="sky">
      <points geometry={stars}>
        <pointsMaterial ref={starMaterial} color="#e0e7ff" size={2} sizeAttenuation={false} transparent opacity={0.85} fog={false} depthWrite={false} />
      </points>
      <group ref={drift}>
        <points geometry={clouds}>
          <pointsMaterial color={FLOOR_COLOR.RF} size={5} sizeAttenuation={false} transparent opacity={0.35} fog={false} depthWrite={false} toneMapped={false} />
        </points>
      </group>
    </group>
  );
}
