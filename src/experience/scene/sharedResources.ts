import type { Material, Object3D, Texture } from "three";
import { allGlassMaterials } from "../fx/geometry";

interface Disposable {
  dispose(): void;
}

type Uniforms = Record<string, { value?: unknown } | undefined>;

export interface SharedSources {
  /** Cached materials that may not be in the scene right now (default: every glass material). */
  glass?: Iterable<Material>;
  /** The renderer's own uniforms of a material (`gl.properties.get(m).uniforms`), where three binds module-level textures such as its DFG lookup table. */
  uniformsOf?: (material: Material) => Uniforms | undefined;
}

const isTexture = (v: unknown): v is Texture => Boolean(v && typeof v === "object" && (v as Texture).isTexture);

/** Materials and textures the scene draws right now, plus every cached glass material (mounted or not). */
export function sharedResources(scene: Object3D | null, { glass = allGlassMaterials(), uniformsOf }: SharedSources = {}): Disposable[] {
  const found = new Set<Disposable>(glass);
  const addUniforms = (uniforms: Uniforms | undefined) => {
    for (const u of Object.values(uniforms ?? {})) if (isTexture(u?.value)) found.add(u.value);
  };
  scene?.traverse((object) => {
    const material = (object as { material?: Material | Material[] }).material;
    for (const m of material ? ([] as Material[]).concat(material) : []) {
      found.add(m);
      for (const value of Object.values(m)) if (isTexture(value)) found.add(value);
      addUniforms((m as { uniforms?: Uniforms }).uniforms);
      addUniforms(uniformsOf?.(m));
    }
  });
  return [...found];
}

/**
 * three adds a "dispose" listener of the drawing renderer to every material and texture it uploads.
 * Shared resources outlive the canvas (the glass material cache, troika's glyph atlas, three's own DFG
 * lookup table), so those listeners would keep every old renderer, with its context, programs and
 * state, alive after a Page View toggle or a crash remount. Dispatching dispose while the old canvas
 * tears down removes them; the next renderer compiles and uploads again on its first frame (the
 * textures keep their image data).
 */
export function releaseSharedResources(scene: Object3D | null, sources?: SharedSources): void {
  for (const resource of sharedResources(scene, sources)) resource.dispose();
}
