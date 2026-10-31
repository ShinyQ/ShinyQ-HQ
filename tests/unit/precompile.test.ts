import { BoxGeometry, Group, InstancedMesh, Mesh, MeshBasicMaterial, type Object3D, type WebGLRenderer } from "three";
import { afterEach, expect, it } from "vitest";
import { precompileFloor, precompileObject, precompileScene, without } from "@/experience/scene/precompile";
import { programPins } from "@/experience/scene/programPins";
import { renderProbe } from "@/experience/scene/renderProbe";
import { isFloorWarm, resetWarm } from "@/experience/scene/warmState";
import { FLOOR_ROOT, registerFloorContent } from "@/experience/tower/floorRegistry";
import { beginFloorPrep, resetRidePrep } from "@/experience/tower/ridePrep";
import { fakeRenderer } from "../helpers/fake-renderer";

afterEach(() => {
  programPins.clear();
  resetWarm();
  resetRidePrep();
  registerFloorContent("L2", null);
  registerFloorContent("L3", null);
  renderProbe.gl = null;
  renderProbe.scene = null;
  renderProbe.camera = null;
  renderProbe.rendered = false;
});

it("compiles for the given target, restores the previous one and pins", async () => {
  const gl = fakeRenderer();
  gl.setRenderTarget("canvas-before");
  const root = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
  const report = await precompileObject(gl as unknown as WebGLRenderer, root, {} as never, {} as never, { target: "composer" as never });
  expect(gl.targets).toContain("composer");
  expect(gl.getRenderTarget()).toBe("canvas-before");
  expect(report).toMatchObject({ materials: 1, pinned: 1, parallel: true, timedOut: false });
});

it("never switches render targets when the target is already bound (three floors the canvas viewport on a switch to null)", async () => {
  const gl = fakeRenderer();
  const root = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
  await precompileObject(gl as unknown as WebGLRenderer, root, {} as never, {} as never, { target: null });
  expect(gl.targets).toEqual([]);
});

it("gives up waiting after the timeout (programs keep compiling in the driver)", async () => {
  const gl = fakeRenderer({ ready: false });
  const report = await precompileObject(gl as unknown as WebGLRenderer, new Mesh(new BoxGeometry(), new MeshBasicMaterial()), {} as never, {} as never, { target: null, timeoutMs: 30, pin: false });
  expect(report.timedOut).toBe(true);
  expect(report.pinned).toBe(0);
});

it("waits for the scene's first drawn frame (the first render compiles anyway)", async () => {
  renderProbe.gl = fakeRenderer() as unknown as WebGLRenderer;
  renderProbe.scene = {} as never;
  renderProbe.camera = {} as never;
  const content = new Group();
  content.add(new Mesh(new BoxGeometry(), new MeshBasicMaterial()));
  registerFloorContent("L3", content);
  expect(await precompileFloor("L3")).toBeNull();
  renderProbe.record(0, 0);
  expect(await precompileFloor("L3")).toBeNull();
  renderProbe.record(12, 400);
  expect(await precompileFloor("L3")).toMatchObject({ floor: "L3", materials: 1 });
});

it("marks a floor warm only when its main content was mounted", async () => {
  const gl = fakeRenderer();
  renderProbe.gl = gl as unknown as WebGLRenderer;
  renderProbe.scene = {} as never;
  renderProbe.camera = {} as never;
  renderProbe.rendered = true;
  expect(await precompileFloor("L3")).toBeNull();
  const content = new Group();
  content.add(new Mesh(new BoxGeometry(), new MeshBasicMaterial()));
  registerFloorContent("L3", content);
  const shell = await precompileFloor("L3");
  expect(shell).toMatchObject({ floor: "L3", contentMounted: false });
  expect(isFloorWarm("L3")).toBe(false);
  const labs = new Group();
  labs.name = FLOOR_ROOT.L3;
  labs.add(new Mesh(new BoxGeometry(), new MeshBasicMaterial({ transparent: true })));
  content.add(labs);
  expect(await precompileFloor("L3")).toMatchObject({ contentMounted: true });
  expect(isFloorWarm("L3")).toBe(true);
});

it("leaves skipped subtrees out while it runs, then puts them back in place", () => {
  const floor = new Group();
  const [slab, content, signs] = [new Group(), new Group(), new Group()];
  floor.add(slab, content, signs);
  const seen: Object3D[] = [];
  const result = without(new Set([content, signs]), () => {
    floor.traverse((o) => void seen.push(o));
    return "done";
  });
  expect(result).toBe("done");
  expect(seen).toEqual([floor, slab]);
  expect(floor.children).toEqual([slab, content, signs]);
  expect(content.parent).toBe(floor);
  expect(() => without(new Set([slab]), () => {
    throw new Error("compile failed");
  })).toThrow("compile failed");
  expect(floor.children).toEqual([slab, content, signs]);
});

/** A floor content group as FloorLevel registers it, with door pads whose first instance colors a passive effect sets. */
function padsFloor() {
  const content = new Group();
  const pads = new InstancedMesh(new BoxGeometry(), new MeshBasicMaterial({ vertexColors: true }), 2);
  content.add(pads);
  return { content, material: pads.material as MeshBasicMaterial };
}

it("leaves floor content to its FloorPrep until that began, so the boot compile never pins a variant its effects still change", async () => {
  const gl = fakeRenderer();
  const scene = new Group();
  const lobby = padsFloor();
  const career = padsFloor();
  scene.add(lobby.content, career.content);
  Object.assign(renderProbe, { gl, scene, camera: {}, rendered: true });
  registerFloorContent("L1", lobby.content);
  registerFloorContent("L2", career.content);
  beginFloorPrep("L1");
  // Compiled whole, as three expects: a subtree compiled on its own would count its lights twice.
  const roots: Object3D[] = [];
  const compile = gl.compile;
  gl.compile = (root: Object3D) => (roots.push(root), compile(root));
  // L2 committed, but its effects (and its FloorPrep after them) have not run.
  const boot = await precompileScene({ timeoutMs: 50 });
  expect(roots[0]).toBe(scene);
  expect(scene.children).toEqual([lobby.content, career.content]);
  expect(boot).toMatchObject({ materials: 1, pinned: 1 });
  expect(gl.properties.get(lobby.material).currentProgram).toBeDefined();
  expect(gl.properties.get(career.material).currentProgram).toBeUndefined();
  beginFloorPrep("L2");
  expect(await precompileScene({ timeoutMs: 50 })).toMatchObject({ materials: 2 });
  expect(gl.properties.get(career.material).currentProgram).toBeDefined();
  registerFloorContent("L1", null);
});
