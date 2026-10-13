import { BoxGeometry, BufferAttribute, BufferGeometry, DoubleSide, Group, InstancedBufferAttribute, InstancedMesh, LineBasicMaterial, LineSegments, Mesh, MeshBasicMaterial, Points, PointsMaterial, ShaderMaterial, Texture, type WebGLRenderer } from "three";
import { afterEach, describe, expect, it } from "vitest";
import { pinGeometry, pinMaterial, pinObject, programPins } from "@/experience/scene/programPins";
import { fakeRenderer } from "../helpers/fake-renderer";

afterEach(() => programPins.clear());

describe("pin parts", () => {
  it("keeps only the attributes that shape a program", () => {
    const src = new BoxGeometry();
    src.setAttribute("color", new BufferAttribute(new Float32Array(src.attributes.position.count * 4), 4));
    const g = pinGeometry(src)!;
    expect(Object.keys(g.attributes).sort()).toEqual(["color", "normal", "position", "uv"]);
    expect(g.getAttribute("color").itemSize).toBe(4);
    const morph = new BufferGeometry();
    morph.morphAttributes.position = [new BufferAttribute(new Float32Array(3), 3)];
    expect(pinGeometry(morph)).toBeNull();
  });

  it("clones materials without holding their textures", () => {
    const map = new Texture();
    map.channel = 1;
    const basic = pinMaterial(new MeshBasicMaterial({ map, transparent: true, side: DoubleSide, toneMapped: false }))! as MeshBasicMaterial;
    expect(basic.map).not.toBe(map);
    expect(basic.map?.channel).toBe(1);
    expect(basic).toMatchObject({ transparent: true, side: DoubleSide, toneMapped: false });
    const shader = pinMaterial(new ShaderMaterial({ uniforms: { uMap: { value: map }, uTime: { value: 2 } }, vertexShader: "void main(){}", fragmentShader: "void main(){}" }))! as ShaderMaterial;
    expect(shader.uniforms.uMap.value).toBeNull();
    expect(shader.uniforms.uTime.value).toBe(2);
  });

  it("mirrors the object kind, including instance colors", () => {
    const inst = new InstancedMesh(new BoxGeometry(), new MeshBasicMaterial(), 4);
    inst.instanceColor = new InstancedBufferAttribute(new Float32Array(12), 3);
    const pin = pinObject(inst, new MeshBasicMaterial()) as InstancedMesh;
    expect(pin.isInstancedMesh).toBe(true);
    expect(pin.count).toBe(1);
    expect(pin.instanceColor).not.toBeNull();
    expect((pinObject(new LineSegments(new BufferGeometry().setAttribute("position", new BufferAttribute(new Float32Array(6), 3)), new LineBasicMaterial()), new LineBasicMaterial()) as LineSegments).isLineSegments).toBe(true);
    expect((pinObject(new Points(new BoxGeometry(), new PointsMaterial()), new PointsMaterial()) as Points).isPoints).toBe(true);
  });
});

describe("programPins.pinFrom", () => {
  it("pins each new program once and keeps it after the source is gone", () => {
    const gl = fakeRenderer();
    const root = new Group();
    root.add(new Mesh(new BoxGeometry(), new MeshBasicMaterial()), new Mesh(new BoxGeometry(), new MeshBasicMaterial()));
    gl.compile(root);
    const pinned = programPins.pinFrom(gl as unknown as WebGLRenderer, root, {} as never, {} as never, null);
    expect(pinned).toBe(1);
    expect(programPins.group.children).toHaveLength(1);
    expect(programPins.pinFrom(gl as unknown as WebGLRenderer, root, {} as never, {} as never, null)).toBe(0);
  });

  it("leaves the bound target alone when it is already the one to compile for", () => {
    const gl = fakeRenderer();
    const root = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    gl.compile(root);
    programPins.pinFrom(gl as unknown as WebGLRenderer, root, {} as never, {} as never, null);
    expect(gl.targets).toEqual([]);
  });

  it("binds the target while compiling pins and restores the previous one", () => {
    const gl = fakeRenderer();
    const root = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    gl.setRenderTarget("composer");
    gl.compile(root);
    gl.setRenderTarget(null);
    programPins.pinFrom(gl as unknown as WebGLRenderer, root, {} as never, {} as never, "composer" as never);
    expect(gl.getRenderTarget()).toBeNull();
    expect(programPins.keys.size).toBe(1);
  });
});
