"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { Color, CylinderGeometry, Object3D, PlaneGeometry, type InstancedMesh } from "three";
import { getHQStore, useHQStore } from "@/store/useHQStore";
import { createHoloMaterial, HOLO_MODE } from "../../fx/holoFx";
import { neonColor } from "../../fx/materials";
import { sceneProbes } from "../../fx/probes";
import { useDispose } from "../../fx/useDispose";
import { useUniformTime } from "../../fx/useUniformTime";
import { goToRoom } from "../../missions/bridge";
import { roverRuntime } from "../../rover/runtime";
import type { LabsLayout, PlacedPod } from "./layout";
import { ACCENT_HEX } from "./Pods";
import { BEACON, litPods, podAt, roadGlow, surprisePod } from "./techReactor";

const NO_RAYCAST = () => null;
/** Glow strip widths: wing road runs and spurs. */
const STRIP = { road: 3, spur: 2, y: 0.06 } as const;
const STRIP_COLOR = "#e9d5ff";
const HIDDEN = new Object3D();
HIDDEN.scale.setScalar(0);
HIDDEN.updateMatrix();

function useLit(placed: readonly PlacedPod[]): PlacedPod[] {
  const pods = useHQStore((s) => s.reactor.tech?.pods);
  return useMemo(() => (pods ? litPods(placed, pods) : []), [placed, pods]);
}

/**
 * Pod beacons for the picked tech: a light curtain hugging each lit pod and rising into a beacon that
 * fades toward the top (holo `pillar`), every pod in one instanced draw. Mounted from the start with
 * no visible instances, so it never compiles a new program (it shares the reactor's). Lite keeps it
 * low; reduced motion freezes the streaks.
 */
function PodBeacons({ placed }: { placed: readonly PlacedPod[] }) {
  const tier = useHQStore((s) => s.tier);
  const full = tier === "full";
  const lit = useLit(placed);
  const mesh = useRef<InstancedMesh>(null);
  const geometry = useMemo(() => new CylinderGeometry(1, 1, 1, 32, 1, true).translate(0, 0.5, 0), []);
  useDispose(geometry);
  const material = useMemo(() => createHoloMaterial({ mode: HOLO_MODE.pillar, color: neonColor("#ffffff", 1.8, tier), opacity: full ? 1 : 0.85 }), [tier, full]);
  useDispose(material);
  const materials = useMemo(() => [material], [material]);
  useUniformTime(materials);
  const count = Math.max(1, placed.length);
  const colors = useMemo(() => new Float32Array(Array.from({ length: count }, (_, i) => new Color(placed[i] ? ACCENT_HEX[placed[i].pod.accent] : "#ffffff").toArray()).flat()), [placed, count]);

  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const on = new Set(lit.map((p) => p.room));
    const dummy = new Object3D();
    const height = full ? BEACON.full : BEACON.lite;
    placed.forEach((p, i) => {
      if (!on.has(p.room)) return m.setMatrixAt(i, HIDDEN.matrix);
      dummy.position.set(p.center.x, 0, p.center.z);
      dummy.scale.set(p.width / 2 + BEACON.inset, height, p.depth / 2 + BEACON.inset);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
    m.visible = lit.length > 0;
  }, [lit, placed, full]);

  return (
    <instancedMesh key={count} ref={mesh} name="labs-reactor-beacons" args={[geometry, material, count]} visible={false} raycast={NO_RAYCAST}>
      <instancedBufferAttribute attach="instanceColor" args={[colors, 3]} />
    </instancedMesh>
  );
}

/**
 * The road from the reactor to every lit pod glows (holo `strip`, a pulse running out toward the pods):
 * one instanced draw, segments from `roadGlow`. Preallocated for every pod plus the wing runs.
 */
function RoadGlow({ layout }: { layout: LabsLayout }) {
  const tier = useHQStore((s) => s.tier);
  const lit = useLit(layout.placed);
  const mesh = useRef<InstancedMesh>(null);
  const geometry = useMemo(() => new PlaneGeometry(1, 1).rotateX(-Math.PI / 2), []);
  useDispose(geometry);
  const material = useMemo(() => createHoloMaterial({ mode: HOLO_MODE.strip, color: neonColor(STRIP_COLOR, 1.6, tier), opacity: tier === "full" ? 0.9 : 0.75 }), [tier]);
  useDispose(material);
  const materials = useMemo(() => [material], [material]);
  useUniformTime(materials);
  const count = layout.placed.length + 4;
  const colors = useMemo(() => new Float32Array(count * 3).fill(1), [count]);

  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const segments = roadGlow(layout, lit);
    const spurs = new Set(lit.map((p) => `${p.door.x},${p.door.z}`));
    const dummy = new Object3D();
    for (let i = 0; i < count; i++) {
      const s = segments[i];
      if (!s) {
        m.setMatrixAt(i, HIDDEN.matrix);
        continue;
      }
      const dx = s.b.x - s.a.x;
      const dz = s.b.z - s.a.z;
      dummy.position.set((s.a.x + s.b.x) / 2, STRIP.y, (s.a.z + s.b.z) / 2);
      dummy.rotation.set(0, Math.atan2(-dz, dx), 0);
      dummy.scale.set(Math.hypot(dx, dz), 1, spurs.has(`${s.b.x},${s.b.z}`) ? STRIP.spur : STRIP.road);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
    m.visible = segments.length > 0;
    sceneProbes.reactor.roads = segments.length;
  }, [layout, lit, count]);

  return (
    <instancedMesh key={count} ref={mesh} name="labs-reactor-roads" args={[geometry, material, count]} visible={false} raycast={NO_RAYCAST} renderOrder={1}>
      <instancedBufferAttribute attach="instanceColor" args={[colors, 3]} />
    </instancedMesh>
  );
}

/**
 * Surprise me (drawer button, store `reactor.spin`): drives to a random pod through point-and-go's
 * room drive, preferring the picked tech's pods and never the pod the rover is at. Draws nothing.
 */
function ReactorSurprise({ placed }: { placed: readonly PlacedPod[] }) {
  useEffect(() => {
    const store = getHQStore();
    return store.subscribe((s, prev) => {
      if (s.reactor.spin === prev.reactor.spin) return;
      const lit = s.reactor.tech ? litPods(placed, s.reactor.tech.pods).map((p) => p.pod.slug) : [];
      const target = surprisePod(
        placed.map((p) => p.pod.slug),
        lit,
        podAt(placed, { x: roverRuntime.x, z: roverRuntime.z }),
        Math.random,
      );
      sceneProbes.reactor.surprise = target;
      if (target) goToRoom(`L3:${target}`);
    });
  }, [placed]);
  return null;
}

/** Probe: the picked tech and its lit pods (read by e2e through `__hq.probes.reactor`). */
function ReactorProbe({ placed }: { placed: readonly PlacedPod[] }) {
  const tech = useHQStore((s) => s.reactor.tech);
  const lit = useLit(placed);
  useFrame(() => {
    sceneProbes.reactor.tech = tech?.slug ?? null;
    sceneProbes.reactor.lit = lit.map((p) => p.pod.slug);
  });
  return null;
}

/** Tech Reactor highlights on L3: pod beacons and road glow (2 draw calls while a tech is picked, none otherwise), Surprise me. */
export function ReactorHighlights({ layout }: { layout: LabsLayout }) {
  return (
    <group name="labs-reactor-highlights">
      <RoadGlow layout={layout} />
      <PodBeacons placed={layout.placed} />
      <ReactorSurprise placed={layout.placed} />
      <ReactorProbe placed={layout.placed} />
    </group>
  );
}
