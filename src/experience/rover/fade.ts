import type { Material, Object3D } from "three";

/**
 * First person (round 5): the rover body fades with hashed alpha. `alphaHash` keeps the materials
 * opaque (same render order, depth writes and draw calls) and discards nothing at opacity 1, so the
 * third-person look is unchanged. It is set once at mount, before the first compile, so fading only
 * changes a uniform and never recompiles a shader.
 */
export function prepareFade(root: Object3D): Material[] {
  const out = new Set<Material>();
  root.traverse((o) => {
    const m = (o as { material?: Material | Material[] }).material;
    if (!m) return;
    for (const material of Array.isArray(m) ? m : [m]) {
      if (!material.alphaHash) {
        material.alphaHash = true;
        material.needsUpdate = true;
      }
      out.add(material);
    }
  });
  return [...out];
}

export function setFadeOpacity(materials: readonly Material[], opacity: number): void {
  for (const m of materials) if (m.opacity !== opacity) m.opacity = opacity;
}
