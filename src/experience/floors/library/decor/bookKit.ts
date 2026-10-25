import { BoxGeometry, Color, InstancedBufferAttribute, InstancedMesh, Matrix4, PlaneGeometry, Sphere, type BufferGeometry, type ShaderMaterial } from "three";
import { createHoloMaterial, HOLO_MODE } from "../../../fx/holoFx";
import { neonColor } from "../../../fx/materials";
import type { GpuTier, Vec2 } from "../../../types";

/** One instance: its floor-local matrix, tone and brightness. */
export type KitItem = [Matrix4, string, number];

/** One instanced mesh of a kit: its instances and draw order. */
export interface KitMesh {
  geometry: BufferGeometry;
  material: ShaderMaterial;
  items: KitItem[];
  order?: number;
}

const NO_RAYCAST = () => null;
const C = new Color();

/** The unit box with its base at y 0, carrying the holo plate's per-instance alpha (all 1) for `n` instances. */
export const kitBox = (n: number) => new BoxGeometry(1, 1, 1).translate(0, 0.5, 0).setAttribute("aAlpha", new InstancedBufferAttribute(new Float32Array(n).fill(1), 1));

/** Book bodies (and plinths, shelf frames): holo `plate` that writes depth, drawn before the other transparent passes. */
export const kitBodies = (geometry: BufferGeometry, items: KitItem[], tier: GpuTier): KitMesh => ({
  geometry,
  material: createHoloMaterial({ mode: HOLO_MODE.plate, color: neonColor("#ffffff", 1.4, tier), depthWrite: true }),
  items,
  order: -2,
});

/** Covers: holo `core` (it ignores `aAlpha`, so it shares the bodies' box), additive on full only. */
export const kitCovers = (geometry: BufferGeometry, items: KitItem[], tier: GpuTier): KitMesh => ({
  geometry,
  material: createHoloMaterial({ mode: HOLO_MODE.core, color: neonColor("#ffffff", 1.6, tier), opacity: tier === "full" ? 0.85 : 0.7, additive: tier === "full" }),
  items,
  order: -1,
});

/** Full-tier light pools on the floor: holo `dot` quads laid flat (the pulse held under reduced motion). */
export const kitPools = (items: KitItem[], reducedMotion: boolean): KitMesh => ({
  geometry: new PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
  material: createHoloMaterial({ mode: HOLO_MODE.dot, params: [reducedMotion ? 0 : 1, 1, 0, 0] }),
  items,
});

/**
 * The instanced holo book kit shared by the Study Vault and the track shelves: one `InstancedMesh` per part, its
 * instances relative to `origin` (the group's origin, so transparent sorting sees the kit where it is; `shift` moves a
 * floor-local matrix there), each instance's color its tone times its brightness, every mesh culled by one sphere
 * around all of them and never raycast (point-and-go owns the picking). The meshes are primitives (R3F leaves them
 * alone): `dispose` frees their instance buffers, geometries and materials.
 */
export function bookKit(parts: KitMesh[], origin: Vec2) {
  const shift = new Matrix4().makeTranslation(-origin.x, 0, -origin.z);
  const meshes = parts.map(({ geometry, material, items, order = 0 }) => {
    const m = new InstancedMesh(geometry, material, items.length);
    items.forEach(([matrix, color, level], i) => {
      m.setMatrixAt(i, matrix.premultiply(shift));
      m.setColorAt(i, C.set(color).multiplyScalar(level));
    });
    m.renderOrder = order;
    m.raycast = NO_RAYCAST;
    return m;
  });
  const bounds = new Sphere();
  meshes.forEach((m) => (m.computeBoundingSphere(), bounds.union(m.boundingSphere!)));
  for (const m of meshes) m.boundingSphere = bounds;
  const materials = parts.map((p) => p.material);
  return { meshes, materials, shift, dispose: () => meshes.forEach((m, i) => (m.dispose(), m.geometry.dispose(), materials[i].dispose())) };
}
