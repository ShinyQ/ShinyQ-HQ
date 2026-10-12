import { beforeEach, describe, expect, it } from "vitest";
import { Group, Material, PerspectiveCamera, Scene, WebGLRenderTarget, type WebGLRenderer } from "three";
import { precompileFloor } from "@/experience/scene/precompile";
import { isFloorWarm, resetWarm } from "@/experience/scene/warmState";
import { registerFloorContent } from "@/experience/tower/floorRegistry";

/** A renderer that records what it compiled and into which target; programs link after `link()`. */
function fakeRenderer() {
  const log: string[] = [];
  let target: WebGLRenderTarget | null = null;
  let linked = false;
  const material = new Material();
  const gl = {
    info: { programs: [] as unknown[] },
    extensions: { has: () => true },
    properties: { get: () => ({ currentProgram: { isReady: () => linked } }) },
    getRenderTarget: () => target,
    setRenderTarget: (t: WebGLRenderTarget | null) => {
      target = t;
    },
    compile: (root: Group, _camera: unknown, scene: Scene) => {
      log.push(`root=${root.name} scene=${scene.name} target=${target ? target.texture.name : "screen"}`);
      return new Set([material]);
    },
  };
  return { gl: gl as unknown as WebGLRenderer, log, bound: () => target, link: () => (linked = true) };
}

let floors = 0;
function world() {
  const scene = new Scene();
  scene.name = "world";
  const level = new Group();
  // A fresh floor per test: the scene hook is installed once per scene.
  const id = (["L3", "L4", "RF", "L2"] as const)[floors++ % 4];
  level.name = `floor-${id}`;
  const content = new Group();
  content.name = `content-${id}`;
  level.add(content);
  scene.add(level);
  registerFloorContent(id, content);
  return { scene, content, id, camera: new PerspectiveCamera() };
}

/** What WebGLRenderer.render does for a Scene: `scene.onBeforeRender(renderer, scene, camera, renderTarget)`. */
const renderInto = (scene: Scene, gl: WebGLRenderer, camera: PerspectiveCamera, target: WebGLRenderTarget | null) =>
  scene.onBeforeRender(gl, scene, camera, target as never, undefined as never, undefined as never);

beforeEach(resetWarm);

describe("precompileFloor (P2-compatible shim)", () => {
  it("returns null until the scene has rendered once, then compiles into the scene pass's target (full tier composer)", async () => {
    const { scene, content, id, camera } = world();
    const r = fakeRenderer();
    expect(await precompileFloor(id)).toBeNull();
    const composer = new WebGLRenderTarget(4, 4);
    composer.texture.name = "composer";
    renderInto(scene, r.gl, camera, composer);
    const pending = precompileFloor(id, { timeoutMs: 1000 });
    expect(r.log).toEqual([`root=${content.name} scene=world target=composer`]);
    expect(r.bound()).toBeNull();
    r.link();
    const report = await pending;
    expect(report).toMatchObject({ floor: id, materials: 1, timedOut: false, contentMounted: false, pinned: 0 });
    // The floor's main component (FLOOR_ROOT) is not mounted: not warm.
    expect(isFloorWarm(id)).toBe(false);
  });

  it("compiles for the canvas on the lite tier, keeps an existing scene hook and marks a mounted floor warm", async () => {
    const { scene, content, id, camera } = world();
    const root = new Group();
    root.name = { L1: "lobby", L2: "career-archive", L3: "labs", L4: "library", RF: "roof" }[id];
    content.add(root);
    let calls = 0;
    scene.onBeforeRender = () => {
      calls += 1;
    };
    const r = fakeRenderer();
    expect(await precompileFloor(id)).toBeNull();
    renderInto(scene, r.gl, camera, null);
    expect(calls).toBe(1);
    r.link();
    expect(await precompileFloor(id)).toMatchObject({ contentMounted: true, timedOut: false });
    expect(r.log.at(-1)).toContain("target=screen");
    expect(isFloorWarm(id)).toBe(true);
  });

  it("reports a timeout when the programs do not link in time", async () => {
    const { scene, id, camera } = world();
    const r = fakeRenderer();
    await precompileFloor(id);
    renderInto(scene, r.gl, camera, null);
    expect(await precompileFloor(id, { timeoutMs: 20 })).toMatchObject({ timedOut: true });
  });
});
