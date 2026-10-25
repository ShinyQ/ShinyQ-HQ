"use client";

import { useMemo } from "react";
import { BoxGeometry, InstancedBufferAttribute, Object3D, PlaneGeometry, type BufferGeometry, type Material } from "three";
import { createHoloMaterial, HOLO_MODE } from "../../fx/holoFx";
import { neonColor } from "../../fx/materials";
import { useDispose } from "../../fx/useDispose";
import { useUniformTime } from "../../fx/useUniformTime";
import type { GpuTier } from "../../types";
import type { FlowInstance, PanelInstance, PlateInstance } from "./scenery";

const NO_RAYCAST = () => null;

/** A screen or plate: upright facing `yaw` (forward (sin, cos)) or flat on its `y`; YXZ so a roll turns it about its own normal. */
function placeQuad(o: Object3D, p: PlateInstance & { roll?: number }) {
  o.position.set(p.x, p.y, p.z);
  o.rotation.set(p.flat ? -Math.PI / 2 : 0, p.flat ? 0 : p.yaw, p.roll ?? 0, "YXZ");
  o.scale.set(p.w, p.h, 1);
}

function placeBox(o: Object3D, f: FlowInstance) {
  o.position.set(f.x, f.y, f.z);
  o.scale.set(f.w, f.h, f.d);
}

/**
 * One instanced draw of `items`, never raycast. Instance matrices and colors are set at creation (attached), so the floor's
 * precompile builds the final program and culling sees real bounds.
 */
function useInstances<T extends { color: string }>(name: string, geometry: BufferGeometry, material: Material, items: readonly T[], place: (o: Object3D, item: T) => void, tier: GpuTier, renderOrder = 0) {
  const { matrices, colors } = useMemo(() => {
    const o = new Object3D();
    const matrices = new Float32Array(items.length * 16);
    const colors = new Float32Array(items.length * 3);
    // Every `place` sets the whole transform it uses (a box never turns), so nothing carries over between instances.
    items.forEach((item, i) => {
      place(o, item);
      o.updateMatrix();
      o.matrix.toArray(matrices, i * 16);
      neonColor(item.color, 1.4, tier).toArray(colors, i * 3);
    });
    return { matrices, colors };
  }, [items, place, tier]);
  if (items.length === 0) return null;
  return (
    <instancedMesh name={name} args={[geometry, material, items.length]} renderOrder={renderOrder} raycast={NO_RAYCAST}>
      <instancedBufferAttribute attach="instanceMatrix" args={[matrices, 16]} />
      <instancedBufferAttribute attach="instanceColor" args={[colors, 3]} />
    </instancedMesh>
  );
}

/** Pipes, cable trays, drops, bay front strips and rack LEDs: one instanced draw on the holo `strip` mode. */
export function FlowMesh({ items, tier }: { items: readonly FlowInstance[]; tier: GpuTier }) {
  const geometry = useMemo(() => new BoxGeometry(1, 1, 1), []);
  useDispose(geometry);
  const material = useMemo(() => createHoloMaterial({ mode: HOLO_MODE.strip, opacity: tier === "full" ? 1 : 0.85, fade: [40, 110] }), [tier]);
  useDispose(material);
  useUniformTime(useMemo(() => [material], [material]));
  return useInstances("engine-flows", geometry, material, items, placeBox, tier);
}

/** Data screens (timeline wall, monitors, the dashboard wall, the blueprint table, the brain grid, the scrap rack, the workbench): one instanced draw on the holo `fall` mode. */
export function PanelMesh({ items, tier }: { items: readonly PanelInstance[]; tier: GpuTier }) {
  const geometry = useMemo(() => new PlaneGeometry(1, 1), []);
  useDispose(geometry);
  const material = useMemo(() => createHoloMaterial({ mode: HOLO_MODE.fall, opacity: tier === "full" ? 0.95 : 0.8, params: [14, 3, 0, 0], fade: [40, 110] }), [tier]);
  useDispose(material);
  useUniformTime(useMemo(() => [material], [material]));
  return useInstances("engine-panels", geometry, material, items, placeQuad, tier);
}

/**
 * Lit-seam cladding (the bay walls and floors, the deck, the reactor plinth): one instanced draw on the holo `plate` mode,
 * the program the floating signs already compile. The panels are almost opaque and write depth, so they draw first
 * among the transparents (`renderOrder` -1) and never cover an additive screen or hologram behind no depth write.
 */
export function PlateMesh({ items, tier }: { items: readonly PlateInstance[]; tier: GpuTier }) {
  const geometry = useMemo(() => new PlaneGeometry(1, 1).setAttribute("aAlpha", new InstancedBufferAttribute(new Float32Array(items.length).fill(1), 1)), [items.length]);
  useDispose(geometry);
  const material = useMemo(() => createHoloMaterial({ mode: HOLO_MODE.plate, depthWrite: true, fade: [40, 110] }), []);
  useDispose(material);
  return useInstances("engine-plates", geometry, material, items, placeQuad, tier, -1);
}
