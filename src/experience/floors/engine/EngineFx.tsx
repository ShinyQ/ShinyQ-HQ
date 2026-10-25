"use client";

import { useMemo } from "react";
import { BoxGeometry, InstancedBufferAttribute, Object3D, PlaneGeometry } from "three";
import { createHoloMaterial, HOLO_MODE } from "../../fx/holoFx";
import { neonColor } from "../../fx/materials";
import { useDispose } from "../../fx/useDispose";
import { useUniformTime } from "../../fx/useUniformTime";
import type { GpuTier } from "../../types";
import type { FlowInstance, PanelInstance, PlateInstance } from "./scenery";

const NO_RAYCAST = () => null;

/** Instance matrices and colors, set at creation (attached), so the floor's precompile builds the final program and culling sees real bounds. */
function instanceArrays<T extends { color: string }>(items: readonly T[], place: (o: Object3D, item: T) => void, tier: GpuTier) {
  const o = new Object3D();
  const matrices = new Float32Array(items.length * 16);
  const colors = new Float32Array(items.length * 3);
  items.forEach((item, i) => {
    o.position.set(0, 0, 0);
    o.rotation.set(0, 0, 0);
    o.scale.set(1, 1, 1);
    place(o, item);
    o.updateMatrix();
    o.matrix.toArray(matrices, i * 16);
    neonColor(item.color, 1.4, tier).toArray(colors, i * 3);
  });
  return { matrices, colors };
}

/** A screen or plate: upright facing `yaw` (forward (sin, cos)) or flat on its `y`; YXZ so a roll turns it about its own normal. */
function placeQuad(o: Object3D, p: PlateInstance & { roll?: number }) {
  o.position.set(p.x, p.y, p.z);
  o.rotation.set(p.flat ? -Math.PI / 2 : 0, p.flat ? 0 : p.yaw, p.roll ?? 0, "YXZ");
  o.scale.set(p.w, p.h, 1);
}

/** Pipes, cable trays, drops, bay front strips and rack LEDs: one instanced draw on the holo `strip` mode. */
export function FlowMesh({ items, tier }: { items: readonly FlowInstance[]; tier: GpuTier }) {
  const geometry = useMemo(() => new BoxGeometry(1, 1, 1), []);
  useDispose(geometry);
  const material = useMemo(() => createHoloMaterial({ mode: HOLO_MODE.strip, opacity: tier === "full" ? 1 : 0.85, fade: [40, 110] }), [tier]);
  useDispose(material);
  useUniformTime(useMemo(() => [material], [material]));
  const { matrices, colors } = useMemo(
    () =>
      instanceArrays(
        items,
        (o, f) => {
          o.position.set(f.x, f.y, f.z);
          o.scale.set(f.w, f.h, f.d);
        },
        tier,
      ),
    [items, tier],
  );
  if (items.length === 0) return null;
  return (
    <instancedMesh name="engine-flows" args={[geometry, material, items.length]} raycast={NO_RAYCAST}>
      <instancedBufferAttribute attach="instanceMatrix" args={[matrices, 16]} />
      <instancedBufferAttribute attach="instanceColor" args={[colors, 3]} />
    </instancedMesh>
  );
}

/** Data screens (timeline wall, monitors, the dashboard wall, the blueprint table, the brain grid, the scrap rack, the workbench): one instanced draw on the holo `fall` mode. */
export function PanelMesh({ items, tier }: { items: readonly PanelInstance[]; tier: GpuTier }) {
  const geometry = useMemo(() => new PlaneGeometry(1, 1), []);
  useDispose(geometry);
  const material = useMemo(() => createHoloMaterial({ mode: HOLO_MODE.fall, opacity: tier === "full" ? 0.95 : 0.8, params: [14, 3, 0, 0], fade: [40, 110] }), [tier]);
  useDispose(material);
  useUniformTime(useMemo(() => [material], [material]));
  const { matrices, colors } = useMemo(() => instanceArrays(items, placeQuad, tier), [items, tier]);
  if (items.length === 0) return null;
  return (
    <instancedMesh name="engine-panels" args={[geometry, material, items.length]} raycast={NO_RAYCAST}>
      <instancedBufferAttribute attach="instanceMatrix" args={[matrices, 16]} />
      <instancedBufferAttribute attach="instanceColor" args={[colors, 3]} />
    </instancedMesh>
  );
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
  const { matrices, colors } = useMemo(() => instanceArrays(items, placeQuad, tier), [items, tier]);
  if (items.length === 0) return null;
  return (
    <instancedMesh name="engine-plates" args={[geometry, material, items.length]} renderOrder={-1} raycast={NO_RAYCAST}>
      <instancedBufferAttribute attach="instanceMatrix" args={[matrices, 16]} />
      <instancedBufferAttribute attach="instanceColor" args={[colors, 3]} />
    </instancedMesh>
  );
}
