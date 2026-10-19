"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import { BlendFunction, BloomEffect, EffectComposer, EffectPass, RenderPass, ToneMappingEffect, type ToneMappingMode } from "postprocessing";
import { HalfFloatType, NoToneMapping, Vector2, type Camera, type Scene, type WebGLRenderer } from "three";
import { useDispose } from "../fx/useDispose";

export interface PostComposerOptions {
  /** MSAA samples of the composer's frame buffers. */
  multisampling: number;
  /** MIP levels of the mipmap bloom. */
  levels: number;
  bloom: { threshold: number; intensity: number; radius: number };
  toneMapping: ToneMappingMode;
}

export interface PostComposer {
  composer: EffectComposer;
  bloom: BloomEffect;
}

const glSize = new Vector2();

function createPost(gl: WebGLRenderer, scene: Scene, camera: Camera, { multisampling, levels, bloom: { threshold, intensity, radius }, toneMapping }: PostComposerOptions): PostComposer {
  // The constructor turns the renderer's autoClear off; holdRenderer owns that switch.
  const autoClear = gl.autoClear;
  const composer = new EffectComposer(gl, { multisampling, frameBufferType: HalfFloatType });
  gl.autoClear = autoClear;
  composer.addPass(new RenderPass(scene, camera));
  gl.getSize(glSize);
  composer.setSize(glSize.width, glSize.height);
  const bloom = new BloomEffect({ blendFunction: BlendFunction.ADD, mipmapBlur: true, levels, luminanceThreshold: threshold, intensity, radius });
  composer.addPass(new EffectPass(camera, bloom, new ToneMappingEffect({ mode: toneMapping })));
  return { composer, bloom };
}

/** Renderer tone mapping and autoClear off while a composer is mounted; the cleanup restores what it changed. */
function holdRenderer(gl: WebGLRenderer): () => void {
  const autoClear = gl.autoClear;
  const toneMapping = gl.toneMapping;
  gl.autoClear = false;
  gl.toneMapping = NoToneMapping;
  return () => {
    if (gl.autoClear === false) gl.autoClear = autoClear;
    if (gl.toneMapping === NoToneMapping) gl.toneMapping = toneMapping;
  };
}

/**
 * Mipmap bloom then tone mapping, built with `postprocessing` directly. It reproduces what
 * `@react-three/postprocessing` 3.2 set up for `<EffectComposer><Bloom mipmapBlur /><ToneMapping /></EffectComposer>`
 * (that wrapper also bundled n8ao and maath):
 * - a HalfFloat composer with postprocessing's buffer defaults (depth buffer, no stencil), a `RenderPass`,
 *   then both effects merged into one `EffectPass` (neither is a convolution effect);
 * - bloom blended with ADD (the wrapper's default, not postprocessing's SCREEN), luminance smoothing (0.03)
 *   and the deprecated resolution options left at postprocessing's defaults; tone mapping with only its mode set;
 * - renderer tone mapping off and `autoClear` off while mounted (the composer clears its own targets),
 *   both restored on unmount; each frame renders at `useFrame` priority 1 with `autoClear` on, resizing on
 *   canvas size and DPR changes.
 * Options are fixed per mount: a change builds a new composer, so runtime tweaks (MSAA, bloom levels) go
 * straight to the returned objects.
 */
export function usePostComposer({ multisampling, levels, bloom: { threshold, intensity, radius }, toneMapping }: PostComposerOptions): PostComposer {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const post = useMemo(
    () => createPost(gl, scene, camera, { multisampling, levels, bloom: { threshold, intensity, radius }, toneMapping }),
    [gl, scene, camera, multisampling, levels, threshold, intensity, radius, toneMapping],
  );
  // Disposes the passes too, and the effect pass disposes its effects.
  useDispose(post.composer);

  useLayoutEffect(() => holdRenderer(gl), [gl]);

  // What the frame renders and the size it last applied (-1 until the first frame sizes it).
  const live = useRef({ composer: null as EffectComposer | null, width: -1, height: -1, dpr: -1 });
  useLayoutEffect(() => {
    live.current = { composer: post.composer, width: -1, height: -1, dpr: -1 };
    return () => {
      live.current = { composer: null, width: -1, height: -1, dpr: -1 };
    };
  }, [post]);
  useFrame((state, delta) => {
    const renderer = state.gl;
    const current = live.current;
    const composer = current.composer;
    if (!composer) return;
    renderer.getSize(glSize);
    const dpr = renderer.getPixelRatio();
    if (glSize.width !== current.width || glSize.height !== current.height || dpr !== current.dpr) {
      composer.setSize(glSize.width, glSize.height);
      current.width = glSize.width;
      current.height = glSize.height;
      current.dpr = dpr;
    }
    const autoClear = renderer.autoClear;
    renderer.autoClear = true;
    composer.render(delta);
    renderer.autoClear = autoClear;
  }, 1);

  return post;
}
