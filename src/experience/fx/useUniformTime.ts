import { useFrame } from "@react-three/fiber";
import type { ShaderMaterial } from "three";
import { useHQStore } from "@/store/useHQStore";

type Source = readonly ShaderMaterial[] | (() => Iterable<ShaderMaterial>);

/** Adds `dt` to every `uTime` uniform (frames longer than 0.1 s count as 0.1 s). */
export function advanceTime(source: Source, dt: number): void {
  const list = typeof source === "function" ? source() : source;
  for (const m of list) if (m.uniforms.uTime) m.uniforms.uTime.value += Math.min(dt, 0.1);
}

/** Advances `uTime` on the given shader materials once per frame (frozen under reduced motion). */
export function useUniformTime(materials: Source): void {
  const reduced = useHQStore((s) => s.reducedMotion);
  useFrame((_, dt) => {
    if (!reduced) advanceTime(materials, dt);
  });
}
