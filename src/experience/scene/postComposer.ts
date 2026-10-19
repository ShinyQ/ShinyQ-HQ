"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useLayoutEffect, useRef, type RefObject } from "react";
import { BlendFunction, BloomEffect, EffectComposer, EffectPass, RenderPass, ToneMappingEffect, type ToneMappingMode } from "postprocessing";
import { HalfFloatType, NoToneMapping, Vector2, type Camera, type Scene, type WebGLRenderer } from "three";

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

/** A mounted composer plus the canvas size it last applied (-1 until the first frame sizes it). */
interface LivePost extends PostComposer {
  size: Vector2;
  width: number;
  height: number;
  dpr: number;
}

function createPost(gl: WebGLRenderer, scene: Scene, camera: Camera, { multisampling, levels, bloom: { threshold, intensity, radius }, toneMapping }: PostComposerOptions): LivePost {
  // The constructor turns the renderer's autoClear off; holdRenderer owns that switch.
  const autoClear = gl.autoClear;
  const composer = new EffectComposer(gl, { multisampling, frameBufferType: HalfFloatType });
  gl.autoClear = autoClear;
  composer.addPass(new RenderPass(scene, camera));
  const size = gl.getSize(new Vector2());
  composer.setSize(size.width, size.height);
  const bloom = new BloomEffect({ blendFunction: BlendFunction.ADD, mipmapBlur: true, levels, luminanceThreshold: threshold, intensity, radius });
  composer.addPass(new EffectPass(camera, bloom, new ToneMappingEffect({ mode: toneMapping })));
  return { composer, bloom, size, width: -1, height: -1, dpr: -1 };
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
 * One layout effect builds and disposes the composer, so StrictMode's simulated remount builds a fresh one;
 * it runs at commit, before the first frame. The returned ref holds it while mounted (null before and after).
 * Options are fixed per mount: a change builds a new composer, so runtime tweaks (MSAA, bloom levels) go
 * straight to the composer and bloom.
 */
export function usePostComposer({ multisampling, levels, bloom: { threshold, intensity, radius }, toneMapping }: PostComposerOptions): RefObject<PostComposer | null> {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const live = useRef<LivePost | null>(null);

  useLayoutEffect(() => {
    const post = createPost(gl, scene, camera, { multisampling, levels, bloom: { threshold, intensity, radius }, toneMapping });
    const release = holdRenderer(gl);
    live.current = post;
    return () => {
      if (live.current === post) live.current = null;
      release();
      // Disposes the passes too, and the effect pass disposes its effects.
      post.composer.dispose();
    };
  }, [gl, scene, camera, multisampling, levels, threshold, intensity, radius, toneMapping]);

  useFrame((state, delta) => {
    const post = live.current;
    if (!post) return;
    const renderer = state.gl;
    const { composer, size } = post;
    renderer.getSize(size);
    const dpr = renderer.getPixelRatio();
    if (size.width !== post.width || size.height !== post.height || dpr !== post.dpr) {
      composer.setSize(size.width, size.height);
      post.width = size.width;
      post.height = size.height;
      post.dpr = dpr;
    }
    const autoClear = renderer.autoClear;
    renderer.autoClear = true;
    composer.render(delta);
    renderer.autoClear = autoClear;
  }, 1);

  return live;
}
