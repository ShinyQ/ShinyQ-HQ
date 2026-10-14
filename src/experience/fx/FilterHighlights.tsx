"use client";

import { useEffect, useMemo, useRef } from "react";
import { Color, CylinderGeometry, Object3D, PlaneGeometry, type InstancedMesh } from "three";
import type { GpuTier, Vec2 } from "../types";
import { createHoloMaterial, HOLO_MODE } from "./holoFx";
import { neonColor } from "./materials";
import { useDispose } from "./useDispose";
import { useUniformTime } from "./useUniformTime";

/**
 * Floor filter highlights, shared by the L3 Tech Reactor (lit pods) and the L4 Topic Constellation (lit
 * stations): beacons over the lit targets and glowing strips on the roads to them. Both are one
 * instanced draw on the shared holo program (`fx/holoFx.ts`), mounted from the start with no visible
 * instances, so a pick never compiles a program; with nothing lit they draw nothing.
 */

const NO_RAYCAST = () => null;
const HIDDEN = new Object3D();
HIDDEN.scale.setScalar(0);
HIDDEN.updateMatrix();

export interface BeaconTarget {
  x: number;
  z: number;
  /** Footprint width (x) and depth (z): the glow curtain hugs it. */
  w: number;
  d: number;
  color: string;
}

export interface BeaconSize {
  /** Beacon height on the full and lite tiers. */
  full: number;
  lite: number;
  /** Beacon radius. */
  radius: number;
  /** Glow curtain height (full tier only) and its gap outside the footprint. */
  glow: number;
  inset: number;
}

/**
 * Lit targets (holo `pillar`): a low glow curtain hugging each lit target (full tier) and a thin beacon
 * rising from its middle, every target in one instanced draw (curtains first, then beacons). Lite draws
 * the beacons only, shorter; reduced motion freezes the streaks (the shader clock stops).
 */
export function HighlightBeacons({ name, targets, lit, size, tier }: { name: string; targets: readonly BeaconTarget[]; lit: ReadonlySet<number>; size: BeaconSize; tier: GpuTier }) {
  const full = tier === "full";
  const mesh = useRef<InstancedMesh>(null);
  const geometry = useMemo(() => new CylinderGeometry(1, 1, 1, 24, 1, true).translate(0, 0.5, 0), []);
  useDispose(geometry);
  const material = useMemo(() => createHoloMaterial({ mode: HOLO_MODE.pillar, color: neonColor("#ffffff", 1.6, tier), opacity: full ? 1 : 0.85 }), [tier, full]);
  useDispose(material);
  const materials = useMemo(() => [material], [material]);
  useUniformTime(materials);
  const n = Math.max(1, targets.length);
  const count = n * 2;
  // Curtains glow at half strength in the target color; beacons at full strength.
  const colors = useMemo(
    () =>
      new Float32Array(
        Array.from({ length: count }, (_, i) => {
          const t = targets[i % n];
          return new Color(t ? t.color : "#ffffff").multiplyScalar(i < n ? 0.5 : 1).toArray();
        }).flat(),
      ),
    [targets, n, count],
  );

  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const dummy = new Object3D();
    targets.forEach((t, i) => {
      const shown = lit.has(i);
      if (shown && full) {
        dummy.position.set(t.x, 0, t.z);
        dummy.scale.set(t.w / 2 + size.inset, size.glow, t.d / 2 + size.inset);
        dummy.updateMatrix();
        m.setMatrixAt(i, dummy.matrix);
      } else m.setMatrixAt(i, HIDDEN.matrix);
      if (shown) {
        dummy.position.set(t.x, 0, t.z);
        dummy.scale.set(size.radius, full ? size.full : size.lite, size.radius);
        dummy.updateMatrix();
        m.setMatrixAt(n + i, dummy.matrix);
      } else m.setMatrixAt(n + i, HIDDEN.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
    m.visible = lit.size > 0;
  }, [lit, targets, full, n, size]);

  return (
    <instancedMesh key={count} ref={mesh} name={name} args={[geometry, material, count]} visible={false} raycast={NO_RAYCAST}>
      <instancedBufferAttribute attach="instanceColor" args={[colors, 3]} />
    </instancedMesh>
  );
}

export interface GlowStrip {
  a: Vec2;
  b: Vec2;
  width: number;
}

/** Floor glow strip height (just over the road markings). */
const STRIP_Y = 0.06;

/**
 * Roads to the lit targets (holo `strip`, a pulse running from `a` to `b`): one instanced draw of
 * `capacity` strips, the unused ones hidden.
 */
export function GlowStrips({ name, strips, capacity, color, tier }: { name: string; strips: readonly GlowStrip[]; capacity: number; color: string; tier: GpuTier }) {
  const mesh = useRef<InstancedMesh>(null);
  const geometry = useMemo(() => new PlaneGeometry(1, 1).rotateX(-Math.PI / 2), []);
  useDispose(geometry);
  const material = useMemo(() => createHoloMaterial({ mode: HOLO_MODE.strip, color: neonColor(color, 1.2, tier), opacity: tier === "full" ? 0.45 : 0.5 }), [tier, color]);
  useDispose(material);
  const materials = useMemo(() => [material], [material]);
  useUniformTime(materials);
  const colors = useMemo(() => new Float32Array(capacity * 3).fill(1), [capacity]);

  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const dummy = new Object3D();
    for (let i = 0; i < capacity; i++) {
      const s = strips[i];
      if (!s) {
        m.setMatrixAt(i, HIDDEN.matrix);
        continue;
      }
      const dx = s.b.x - s.a.x;
      const dz = s.b.z - s.a.z;
      dummy.position.set((s.a.x + s.b.x) / 2, STRIP_Y, (s.a.z + s.b.z) / 2);
      dummy.rotation.set(0, Math.atan2(-dz, dx), 0);
      dummy.scale.set(Math.hypot(dx, dz), 1, s.width);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
    m.visible = strips.length > 0;
  }, [strips, capacity]);

  return (
    <instancedMesh key={capacity} ref={mesh} name={name} args={[geometry, material, capacity]} visible={false} raycast={NO_RAYCAST} renderOrder={1}>
      <instancedBufferAttribute attach="instanceColor" args={[colors, 3]} />
    </instancedMesh>
  );
}
