import { BoxGeometry, Group, Mesh, MeshBasicMaterial, Scene, ShaderMaterial, Texture } from "three";
import { describe, expect, it, vi } from "vitest";
import { getGlassMaterial } from "@/experience/fx/geometry";
import { releaseSharedResources, sharedResources } from "@/experience/scene/sharedResources";

describe("shared GPU resources released with a canvas", () => {
  it("collects every material, its texture maps, its own and the renderer's texture uniforms, plus the glass cache", () => {
    const atlas = new Texture();
    const map = new Texture();
    const text = new ShaderMaterial({ uniforms: { uSDF: { value: atlas }, uColor: { value: 1 } } });
    const basic = new MeshBasicMaterial({ map });
    const shared = new MeshBasicMaterial();
    const scene = new Scene();
    const group = new Group();
    group.add(new Mesh(new BoxGeometry(), text), new Mesh(new BoxGeometry(), [basic, shared]), new Mesh(new BoxGeometry(), shared));
    scene.add(group);
    const glass = new ShaderMaterial();
    const lut = new Texture();
    const found = sharedResources(scene, { glass: [glass], uniformsOf: (m) => (m === basic ? { dfgLUT: { value: lut }, roughness: { value: 1 } } : undefined) });
    expect(new Set(found)).toEqual(new Set([glass, text, atlas, basic, map, shared, lut]));
    expect(found).toHaveLength(7);
    expect(sharedResources(null, { glass: [glass] })).toEqual([glass]);
  });

  it("dispatches dispose on the cached glass materials even without a scene", () => {
    const glass = getGlassMaterial("#22d3ee", 0.123);
    const onDispose = vi.fn();
    glass.addEventListener("dispose", onDispose);
    releaseSharedResources(null);
    expect(onDispose).toHaveBeenCalledTimes(1);
  });
});
