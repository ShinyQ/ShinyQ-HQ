import { useFrame } from "@react-three/fiber";
import type { ShaderMaterial } from "three";
import { useHQStore } from "@/store/useHQStore";

/** Advances `uTime` on the given shader materials once per frame (frozen under reduced motion). */
export function useUniformTime(materials: readonly ShaderMaterial[] | (() => Iterable<ShaderMaterial>)): void {
  const reduced = useHQStore((s) => s.reducedMotion);
  useFrame((_, dt) => {
    if (reduced) return;
    const list = typeof materials === "function" ? materials() : materials;
    for (const m of list) if (m.uniforms.uTime) m.uniforms.uTime.value += Math.min(dt, 0.1);
  });
}
