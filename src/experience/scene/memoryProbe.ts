import type { WebGLRenderer } from "three";

/** `renderer.info` counts the memory e2e compares (three has no material count, so programs stand in). */
export interface MemoryCounts {
  geometries: number;
  textures: number;
  programs: number;
}

let renderer: WebGLRenderer | null = null;

/** The canvas registers its renderer on creation and clears it on unmount (Classic site, crash remount). */
export function trackRenderer(gl: WebGLRenderer | null): void {
  renderer = gl;
}

/** Live GPU resource counts of the current canvas, or null while no canvas exists (test and overlay probe). */
export function memoryCounts(): MemoryCounts | null {
  if (!renderer) return null;
  const { memory, programs } = renderer.info;
  return { geometries: memory.geometries, textures: memory.textures, programs: programs?.length ?? 0 };
}
