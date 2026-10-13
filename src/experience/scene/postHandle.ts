import type { BloomEffect, EffectComposer } from "postprocessing";
import type { WebGLRenderTarget } from "three";

export interface PostHandle {
  composer: () => EffectComposer | null;
  bloom: () => BloomEffect | null;
}

let current: PostHandle | null = null;

/** The full tier's composer and bloom (lazily loaded `Effects`); null on lite. Type-only imports keep postprocessing out of the lite chunk. */
export const postHandle = {
  get: (): PostHandle | null => current,
  set(handle: PostHandle | null): void {
    current = handle;
  },
};

/** Render target the scene pass draws into: the composer's input buffer on full, the canvas (null) on lite. */
export function sceneTarget(): WebGLRenderTarget | null {
  return current?.composer()?.inputBuffer ?? null;
}
