import { afterEach, describe, expect, it, vi } from "vitest";
import { BoxGeometry, Group, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, PerspectiveCamera, Scene, ShaderMaterial, type Material, type WebGLRenderer } from "three";
import { cullable, cullUnderSlabs, installRideCull, restoreCulled, rideCullStats, type CullFloor, RIDE_CULL_BOUNDS } from "@/experience/tower/rideCull";

/** A floor at height y: a 40 x 20 slab (top at y, 0.4 thick) and a content group, like FloorLevel. */
function floorAt(y: number, opts: { slabOpacity?: number; depthWrite?: boolean } = {}) {
  const root = new Group();
  root.position.y = y;
  const fill = new MeshBasicMaterial({ transparent: true, opacity: opts.slabOpacity ?? 1, depthWrite: opts.depthWrite ?? true });
  const slab = new Mesh(new BoxGeometry(40, 0.4, 20), fill);
  slab.position.y = -0.2;
  const content = new Group();
  root.add(slab, content);
  return { root, slab, content };
}

function box(x: number, z: number, material: Material = new MeshBasicMaterial(), size = 2) {
  const mesh = new Mesh(new BoxGeometry(size, size, size), material);
  mesh.position.set(x, size / 2, z);
  return mesh;
}

/** A wide camera looking at `target` (default: the lower floor's middle). */
function camera(x: number, y: number, z: number, target: [number, number, number] = [0, 0, 0]) {
  const cam = new PerspectiveCamera(90, 1, 0.5, 600);
  cam.position.set(x, y, z);
  cam.lookAt(...target);
  cam.updateMatrixWorld(true);
  return cam;
}

/** L1 under L2: the lower floor's content against the upper floor's slab. */
function tower(opts?: Parameters<typeof floorAt>[1]) {
  const lower = floorAt(0);
  const upper = floorAt(14, opts);
  const scene = new Group();
  scene.add(lower.root, upper.root);
  const floors: CullFloor[] = [
    { content: lower.content, slab: lower.slab },
    { content: upper.content, slab: upper.slab },
  ];
  return { lower, upper, scene, floors };
}

function update(scene: Group) {
  scene.updateMatrixWorld(true);
}

afterEach(() => restoreCulled());

describe("cullUnderSlabs", () => {
  it("hides a mesh in the shadow of the solid slab above, for one render", () => {
    const { lower, scene, floors } = tower();
    const hiddenBox = box(0, 0);
    lower.content.add(hiddenBox);
    update(scene);
    expect(cullUnderSlabs(camera(0, 36, 10), floors)).toBe(1);
    expect(hiddenBox.visible).toBe(false);
    expect(rideCullStats.meshes).toBe(1);
    expect(rideCullStats.triangles).toBe(12);
    restoreCulled();
    expect(hiddenBox.visible).toBe(true);
  });

  it("keeps what the camera sees under the slab's edge", () => {
    const { lower, scene, floors } = tower();
    // West end of the lower floor, camera far to the west and low: the rays pass under the west edge.
    const edge = box(-19, 0);
    lower.content.add(edge);
    update(scene);
    expect(cullUnderSlabs(camera(-45, 24, 0, [-19, 0, 0]), floors)).toBe(0);
    expect(edge.visible).toBe(true);
  });

  it("hides a mesh under a slab that is entirely off screen, and judges a long one by its part in view", () => {
    const { lower, scene, floors } = tower();
    // Looking north-west from the east end: a box under the far south-west corner is off screen.
    const offscreen = box(-15, 9, new MeshBasicMaterial(), 1);
    // A strip from x -5 to 300: past the slab's east edge only where the camera does not look.
    const strip = new Mesh(new BoxGeometry(305, 1, 2), new MeshBasicMaterial());
    strip.position.set(147.5, 0.5, 0);
    lower.content.add(offscreen, strip);
    update(scene);
    const narrow = new PerspectiveCamera(30, 1, 0.5, 600);
    narrow.position.set(0, 40, 0);
    narrow.lookAt(-5, 0, -8);
    narrow.updateMatrixWorld(true);
    expect(cullUnderSlabs(narrow, floors)).toBe(2);
    restoreCulled();
    // Looking east along the strip, its far end is in view past the slab: it stays.
    const east = new PerspectiveCamera(60, 1, 0.5, 600);
    east.position.set(0, 40, 0);
    east.lookAt(60, 0, 0);
    east.updateMatrixWorld(true);
    cullUnderSlabs(east, floors);
    expect(strip.visible).toBe(true);
  });

  it("needs a solid slab: a ghost or a slab without depth writes hides nothing", () => {
    for (const opts of [{ slabOpacity: 0.03 }, { depthWrite: false }]) {
      const { lower, scene, floors } = tower(opts);
      const mesh = box(0, 0);
      lower.content.add(mesh);
      update(scene);
      expect(cullUnderSlabs(camera(0, 36, 10), floors)).toBe(0);
    }
  });

  it("hides the whole content of a floor under the parked car for one render, even where no slab shadows it", () => {
    const { lower, scene, floors } = tower();
    lower.content.add(box(-19, 0));
    update(scene);
    // Low at the west edge (the arrival glide's first frame in the car): the slab shadow test keeps the box.
    const low = camera(-21, 16, 0, [-10, 0, 0]);
    expect(cullUnderSlabs(low, floors)).toBe(0);
    expect(cullUnderSlabs(low, [{ ...floors[0], hide: true }, floors[1]])).toBe(1);
    expect(lower.content.visible).toBe(false);
    restoreCulled();
    expect(lower.content.visible).toBe(true);
  });

  it("needs the camera above the slab", () => {
    const { lower, scene, floors } = tower();
    lower.content.add(box(0, 0));
    update(scene);
    expect(cullUnderSlabs(camera(0, 10, 30), floors)).toBe(0);
  });

  it("skips a hidden floor and the hidden subtrees of a visible one", () => {
    const { lower, scene, floors } = tower();
    const off = new Group();
    off.visible = false;
    const inner = box(0, 0);
    off.add(inner);
    lower.content.add(off);
    update(scene);
    expect(cullUnderSlabs(camera(0, 36, 10), floors)).toBe(0);
    expect(inner.visible).toBe(true);
    lower.content.visible = false;
    lower.content.add(box(2, 2));
    update(scene);
    expect(cullUnderSlabs(camera(0, 36, 10), floors)).toBe(0);
  });

  it("never culls shader materials, depthTest-off materials or meshes with children", () => {
    const { lower, scene, floors } = tower();
    const shader = box(0, 0, new ShaderMaterial());
    const onTop = box(4, 0, new MeshBasicMaterial({ depthTest: false }));
    const parent = box(-4, 0);
    parent.add(box(0, 0));
    lower.content.add(shader, onTop, parent);
    update(scene);
    // Only the parent's child (a covered leaf) goes.
    expect(cullUnderSlabs(camera(0, 36, 10), floors)).toBe(1);
    expect(shader.visible && onTop.visible && parent.visible).toBe(true);
    expect(parent.children[0].visible).toBe(false);
    expect(cullable(shader)).toBe(false);
    expect(cullable(onTop)).toBe(false);
  });

  it("culls a shader material that vouches for its bounds (RIDE_CULL_BOUNDS: no vertex displacement)", () => {
    const { lower, scene, floors } = tower();
    const material = new ShaderMaterial();
    material.userData[RIDE_CULL_BOUNDS] = true;
    const trusted = box(0, 0, material);
    lower.content.add(trusted);
    update(scene);
    expect(cullable(trusted)).toBe(true);
    expect(cullUnderSlabs(camera(0, 36, 10), floors)).toBe(1);
    expect(trusted.visible).toBe(false);
  });

  it("bounds an instanced mesh by its instances", () => {
    const { lower, scene, floors } = tower();
    const mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial(), 2);
    mesh.setMatrixAt(0, new Matrix4().makeTranslation(-2, 0.5, 0));
    mesh.setMatrixAt(1, new Matrix4().makeTranslation(2, 0.5, 0));
    lower.content.add(mesh);
    update(scene);
    expect(cullUnderSlabs(camera(0, 36, 10), floors)).toBe(1);
    restoreCulled();
    // Move one instance out of the slab's shadow: the whole mesh stays.
    mesh.setMatrixAt(1, new Matrix4().makeTranslation(60, 0.5, 0));
    mesh.instanceMatrix.needsUpdate = true;
    update(scene);
    expect(cullUnderSlabs(camera(0, 36, 10), floors)).toBe(0);
  });

  it("follows geometry edits (bounds recomputed when the positions change)", () => {
    const { lower, scene, floors } = tower();
    const mesh = box(0, 0);
    lower.content.add(mesh);
    update(scene);
    expect(cullUnderSlabs(camera(0, 36, 10), floors)).toBe(1);
    restoreCulled();
    const position = mesh.geometry.attributes.position;
    for (let i = 0; i < position.count; i++) position.setX(i, position.getX(i) + 60);
    position.needsUpdate = true;
    expect(cullUnderSlabs(camera(0, 36, 10, [40, 0, 0]), floors)).toBe(0);
  });

  it("keeps troika text typesetting on schedule while hidden", () => {
    const { lower, scene, floors } = tower();
    const material = Object.assign(new MeshBasicMaterial(), { isTroikaTextMaterial: true });
    const text = new Mesh(new BoxGeometry(2, 1, 0.1), material) as unknown as Mesh & { sync: () => void };
    text.geometry.computeBoundingBox();
    text.sync = vi.fn();
    text.position.set(0, 1, 0);
    lower.content.add(text);
    update(scene);
    expect(cullUnderSlabs(camera(0, 36, 10), floors)).toBe(1);
    expect(text.sync).toHaveBeenCalledTimes(1);
  });

  it("never treats a floor's own slab as its occluder", () => {
    const { upper, scene, floors } = tower();
    const mesh = box(0, 0);
    upper.content.add(mesh);
    update(scene);
    expect(cullUnderSlabs(camera(0, 36, 10), floors)).toBe(0);
  });
});

describe("installRideCull", () => {
  it("hides only inside a render, keeps the scene's own hooks and uninstalls cleanly", () => {
    const { lower, upper, floors } = tower();
    const scene = new Scene();
    scene.add(lower.root, upper.root);
    const mesh = box(0, 0);
    lower.content.add(mesh);
    scene.updateMatrixWorld(true);
    const calls: string[] = [];
    scene.onBeforeRender = () => void calls.push("before");
    scene.onAfterRender = () => void calls.push("after");
    let active = true;
    const uninstall = installRideCull(scene, () => active, () => floors);
    const gl = {} as WebGLRenderer;
    const cam = camera(0, 36, 10);
    scene.onBeforeRender(gl, scene, cam, undefined as never, undefined as never, undefined as never);
    expect(mesh.visible).toBe(false);
    scene.onAfterRender(gl, scene, cam, undefined as never, undefined as never, undefined as never);
    expect(mesh.visible).toBe(true);
    active = false;
    scene.onBeforeRender(gl, scene, cam, undefined as never, undefined as never, undefined as never);
    expect(mesh.visible).toBe(true);
    expect(calls).toEqual(["before", "after", "before"]);
    active = true;
    scene.onBeforeRender(gl, scene, cam, undefined as never, undefined as never, undefined as never);
    uninstall();
    expect(mesh.visible).toBe(true);
    scene.onBeforeRender(gl, scene, cam, undefined as never, undefined as never, undefined as never);
    expect(mesh.visible).toBe(true);
    expect(calls.at(-1)).toBe("before");
  });
});
