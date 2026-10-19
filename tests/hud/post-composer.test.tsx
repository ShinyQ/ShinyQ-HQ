// @vitest-environment jsdom
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, render } from "@testing-library/react";
import { BlendFunction, BloomEffect, EffectComposer, EffectPass, KernelSize, RenderPass, ToneMappingEffect, ToneMappingMode } from "postprocessing";
import { ACESFilmicToneMapping, HalfFloatType, NoToneMapping, PerspectiveCamera, Scene, SRGBColorSpace, type Vector2 } from "three";
import { StrictMode, type RefObject } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Effects from "@/experience/scene/Effects";
import { postHandle } from "@/experience/scene/postHandle";
import { usePostComposer, type PostComposer, type PostComposerOptions } from "@/experience/scene/postComposer";

type FrameCallback = (state: { gl: FakeRenderer }, delta: number) => void;

const r3f = vi.hoisted(() => ({ state: null as unknown as object, frames: [] as { callback: FrameCallback; priority: number }[] }));
vi.mock("@react-three/fiber", () => ({
  useThree: (select: (state: object) => unknown) => select(r3f.state),
  useFrame: (callback: FrameCallback, priority: number) => {
    r3f.frames.push({ callback, priority });
  },
}));

/** Enough of a WebGLRenderer for postprocessing's constructors (no GL calls happen before render). */
class FakeRenderer {
  autoClear = true;
  toneMapping: number = ACESFilmicToneMapping;
  outputColorSpace = SRGBColorSpace;
  width = 800;
  height = 600;
  pixelRatio = 2;
  getSize(target: Vector2) {
    return target.set(this.width, this.height);
  }
  getDrawingBufferSize(target: Vector2) {
    return target.set(this.width * this.pixelRatio, this.height * this.pixelRatio);
  }
  getPixelRatio() {
    return this.pixelRatio;
  }
  getContext() {
    const noop = () => {};
    return { getContextAttributes: () => ({ alpha: true }), getParameter: () => 8, createRenderbuffer: () => ({}), bindRenderbuffer: noop, renderbufferStorageMultisample: noop, deleteRenderbuffer: noop };
  }
}

const FULL: PostComposerOptions = { multisampling: 4, levels: 8, bloom: { threshold: 0.6, intensity: 0.9, radius: 0.45 }, toneMapping: ToneMappingMode.ACES_FILMIC };

function mount(options: PostComposerOptions = FULL, { strict = false } = {}) {
  const gl = new FakeRenderer();
  const camera = new PerspectiveCamera();
  r3f.state = { gl, scene: new Scene(), camera };
  r3f.frames = [];
  const out: { ref: RefObject<PostComposer | null> | null } = { ref: null };
  function Probe() {
    out.ref = usePostComposer(options);
    return null;
  }
  const view = render(strict ? <StrictMode><Probe /></StrictMode> : <Probe />);
  return { gl, camera, view, ref: out.ref!, post: out.ref!.current! };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("full-tier composer (plain postprocessing, same setup as @react-three/postprocessing 3.2)", () => {
  it("builds a HalfFloat composer with a depth buffer, no stencil and the requested MSAA", () => {
    const { post } = mount();
    const buffer = post.composer.inputBuffer;
    expect(buffer.texture.type).toBe(HalfFloatType);
    expect(buffer.depthBuffer).toBe(true);
    expect(buffer.stencilBuffer).toBe(false);
    expect(post.composer.multisampling).toBe(4);
    expect(post.composer.outputBuffer.samples).toBe(4);
  });

  it("renders the scene, then one merged effect pass: bloom then tone mapping, drawn to the screen", () => {
    const { post } = mount();
    const [scenePass, effectPass] = post.composer.passes;
    expect(post.composer.passes).toHaveLength(2);
    expect(scenePass).toBeInstanceOf(RenderPass);
    expect(effectPass).toBeInstanceOf(EffectPass);
    const effects = (effectPass as unknown as { effects: unknown[] }).effects;
    expect(effects).toHaveLength(2);
    expect(effects[0]).toBe(post.bloom);
    expect(effects[1]).toBeInstanceOf(ToneMappingEffect);
    expect(scenePass.renderToScreen).toBe(false);
    expect(effectPass.renderToScreen).toBe(true);
  });

  it("matches the wrapper's Bloom: ADD blend, mipmap blur, the given levels, threshold, intensity and radius, postprocessing defaults otherwise", () => {
    const { post } = mount();
    const bloom = post.bloom;
    expect(bloom).toBeInstanceOf(BloomEffect);
    expect(bloom.blendMode.blendFunction).toBe(BlendFunction.ADD);
    expect(bloom.blendMode.opacity.value).toBe(1);
    expect(bloom.mipmapBlurPass.enabled).toBe(true);
    expect(bloom.mipmapBlurPass.levels).toBe(8);
    expect(bloom.mipmapBlurPass.radius).toBeCloseTo(0.45);
    expect(bloom.luminanceMaterial.threshold).toBeCloseTo(0.6);
    expect(bloom.luminanceMaterial.smoothing).toBeCloseTo(0.03);
    expect(bloom.intensity).toBeCloseTo(0.9);
    expect(bloom.resolution.scale).toBe(0.5);
    expect(bloom.blurPass.kernelSize).toBe(KernelSize.LARGE);
  });

  it("matches the wrapper's ToneMapping: only the mode is set, the rest is postprocessing's default", () => {
    const { post } = mount();
    const tone = (post.composer.passes[1] as unknown as { effects: ToneMappingEffect[] }).effects[1];
    expect(tone.mode).toBe(ToneMappingMode.ACES_FILMIC);
    expect(tone.blendMode.blendFunction).toBe(BlendFunction.SRC);
    expect(tone.resolution).toBe(256);
    expect(tone.whitePoint).toBe(4);
    expect(tone.middleGrey).toBe(0.6);
    expect(tone.averageLuminance).toBe(1);
    expect(tone.adaptiveLuminanceMaterial.minLuminance).toBe(0.01);
    expect(tone.adaptiveLuminanceMaterial.adaptationRate).toBe(1);
  });

  it("turns renderer tone mapping and autoClear off while mounted and restores both on unmount", () => {
    const { gl, view } = mount();
    expect(gl.toneMapping).toBe(NoToneMapping);
    expect(gl.autoClear).toBe(false);
    view.unmount();
    expect(gl.toneMapping).toBe(ACESFilmicToneMapping);
    expect(gl.autoClear).toBe(true);
  });

  it("renders at priority 1 with autoClear on, and resizes on canvas size and DPR changes only", () => {
    const { gl, post } = mount();
    expect(r3f.frames.map((f) => f.priority)).toEqual([1]);
    const frame = r3f.frames[0].callback;
    const autoClearInRender: boolean[] = [];
    const renderSpy = vi.spyOn(post.composer, "render").mockImplementation(() => void autoClearInRender.push(gl.autoClear));
    const sizeSpy = vi.spyOn(post.composer, "setSize");
    frame({ gl }, 0.016);
    frame({ gl }, 0.016);
    expect(renderSpy).toHaveBeenCalledTimes(2);
    expect(renderSpy).toHaveBeenLastCalledWith(0.016);
    expect(autoClearInRender).toEqual([true, true]);
    expect(gl.autoClear).toBe(false);
    expect(sizeSpy).toHaveBeenCalledTimes(1);
    expect(sizeSpy).toHaveBeenLastCalledWith(800, 600);
    gl.pixelRatio = 1.5;
    frame({ gl }, 0.016);
    expect(sizeSpy).toHaveBeenCalledTimes(2);
    gl.width = 1024;
    frame({ gl }, 0.016);
    expect(sizeSpy).toHaveBeenLastCalledWith(1024, 600);
  });

  it("disposes the composer, its passes and effects on unmount", () => {
    const { post, view } = mount();
    const composerDispose = vi.spyOn(post.composer, "dispose");
    const bloomDispose = vi.spyOn(post.bloom, "dispose");
    view.unmount();
    expect(composerDispose).toHaveBeenCalledTimes(1);
    expect(bloomDispose).toHaveBeenCalledTimes(1);
  });

  it("no source imports @react-three/postprocessing, and it is not a dependency", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { dependencies?: object; devDependencies?: object };
    expect(Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })).not.toContain("@react-three/postprocessing");
    const importers = readdirSync("src", { recursive: true, encoding: "utf8" })
      .filter((file) => /\.tsx?$/.test(file))
      .filter((file) => /from "@react-three\/postprocessing"|import\("@react-three\/postprocessing"\)/.test(readFileSync(join("src", file), "utf8")));
    expect(importers).toEqual([]);
  });

  it("survives StrictMode: the simulated remount disposes its throwaway composer and renders a fresh, complete one", () => {
    const dispose = vi.spyOn(EffectComposer.prototype, "dispose");
    const { gl, ref, view } = mount(FULL, { strict: true });
    const post = ref.current!;
    expect(post.composer.passes).toHaveLength(2);
    expect(post.composer.passes[1]).toBeInstanceOf(EffectPass);
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(dispose.mock.contexts[0]).not.toBe(post.composer);
    expect(gl.autoClear).toBe(false);
    expect(gl.toneMapping).toBe(NoToneMapping);
    const render = vi.spyOn(post.composer, "render").mockImplementation(() => {});
    r3f.frames.at(-1)!.callback({ gl }, 0.016);
    expect(render).toHaveBeenCalledTimes(1);
    view.unmount();
    expect(dispose).toHaveBeenCalledTimes(2);
    expect(dispose.mock.contexts[1]).toBe(post.composer);
    expect(ref.current).toBeNull();
    expect(gl.autoClear).toBe(true);
    expect(gl.toneMapping).toBe(ACESFilmicToneMapping);
  });

  it("Effects publishes the live composer and bloom through postHandle after mount, StrictMode included, and clears it on unmount", () => {
    for (const strict of [false, true]) {
      r3f.state = { gl: new FakeRenderer(), scene: new Scene(), camera: new PerspectiveCamera() };
      r3f.frames = [];
      const view = render(strict ? <StrictMode><Effects multisampling={4} levels={8} /></StrictMode> : <Effects multisampling={4} levels={8} />);
      const composer = postHandle.get()?.composer();
      const bloom = postHandle.get()?.bloom();
      expect(composer?.passes).toHaveLength(2);
      expect((composer!.passes[1] as unknown as { effects: unknown[] }).effects[0]).toBe(bloom);
      expect(bloom?.mipmapBlurPass.levels).toBe(8);
      expect(bloom?.intensity).toBeCloseTo(0.9);
      view.unmount();
      expect(postHandle.get()).toBeNull();
    }
  });
});
