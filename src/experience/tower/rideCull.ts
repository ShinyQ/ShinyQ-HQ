import { Box3, Frustum, Matrix4, Vector3, type BufferAttribute, type BufferGeometry, type Camera, type InterleavedBufferAttribute, type Material, type Object3D, type Scene } from "three";
import { clipBoxToFrustum, inSlabShadow, type FrustumLike, type SlabRect, type Vec3 } from "./slabShadow";

/**
 * Ride cull (R5 follow-up to P4): while the elevator runs, a floor below the rover can draw under a
 * slab that is still solid (the car parked at the floor above, or the target several floors down), so
 * it costs triangles the camera never sees. Right before the scene renders, every drawable of such a
 * floor whose world bounds, clipped to the view frustum, lie in a solid slab's shadow (`inSlabShadow`)
 * or entirely outside the frustum is hidden for that render only
 * and shown again right after (`installRideCull`, mounted by `RideCullHooks.tsx`), so no component
 * ever sees the change. Geometry decides, so a hidden mesh cannot reach a pixel: what the ride shows
 * (the grid, the road strip and pad glows seen under a slab's edge or through the glass shaft) still
 * draws. `gl.compile` never runs these hooks, so precompile (P2, P6's FloorPrep) still sees every mesh.
 */
export interface CullFloor {
  /** The floor's content group (FloorLevel); null or hidden floors are skipped. */
  content: Object3D | null;
  /** The floor's slab fill mesh: an occluder while it draws fully opaque and writes depth. */
  slab: Object3D | null;
  /**
   * Hide the whole content for this render: a floor under the car parked at the target (`belowParkedCar`).
   * FloorLevel hides it from the next frame on; this covers the frame the Director parks the car.
   */
  hide?: boolean;
}

export interface RideCullStats {
  /** Renders that culled something, since load. */
  frames: number;
  /** Drawables hidden in the last render that culled. */
  meshes: number;
  /** Their triangles (instances counted), estimated from the geometry. */
  triangles: number;
}

/** `window.__hq.rideCull` (tests). */
export const rideCullStats: RideCullStats = { frames: 0, meshes: 0, triangles: 0 };

type Drawable = Object3D & { geometry?: BufferGeometry; material?: Material | Material[]; isMesh?: boolean; isLine?: boolean; isPoints?: boolean };
type Instanced = Drawable & { isInstancedMesh: true; count: number; instanceMatrix: BufferAttribute };
type Syncable = Object3D & { sync?: () => void };
type SlabMaterial = Material & { opacity: number };

const hidden: Object3D[] = [];

function materialsOf(object: Drawable): Material[] {
  const m = object.material;
  if (!m) return [];
  return Array.isArray(m) ? m : [m];
}

function isTroika(object: Drawable): boolean {
  return materialsOf(object).some((m) => (m as Material & { isTroikaTextMaterial?: boolean }).isTroikaTextMaterial === true);
}

/**
 * `material.userData` key a shader material sets when its vertex shader never moves a vertex beyond the
 * geometry (and instance) bounds, so the ride cull may trust them: today only the L1 Visitor Observatory's
 * holo globe, dots and panel (holoFx modes `globe`, `dot`, `plate`; the `stage` mode moves vertices).
 */
export const RIDE_CULL_BOUNDS = "rideCullBounds";

/**
 * A leaf mesh, line or points whose bounds are trustworthy and that the slab's depth hides: every
 * material depth tests, and none is a shader material (a custom vertex shader may move vertices out of
 * the geometry's bounds; troika text derives from a basic material and keeps its own bounds) unless it
 * vouches for its bounds (`RIDE_CULL_BOUNDS`).
 */
export function cullable(object: Object3D): boolean {
  const d = object as Drawable;
  if (!d.visible || object.children.length > 0) return false;
  if (!(d.isMesh || d.isLine || d.isPoints) || !d.geometry) return false;
  if ((d as { isSkinnedMesh?: boolean }).isSkinnedMesh || d.geometry.morphAttributes?.position) return false;
  const materials = materialsOf(d);
  if (!materials.length) return false;
  return materials.every((m) => m.depthTest !== false && (!(m as { isShaderMaterial?: boolean }).isShaderMaterial || m.userData[RIDE_CULL_BOUNDS] === true));
}

function versionOf(attribute: BufferAttribute | InterleavedBufferAttribute | undefined): number {
  if (!attribute) return -1;
  return (attribute as InterleavedBufferAttribute).isInterleavedBufferAttribute ? (attribute as InterleavedBufferAttribute).data.version : (attribute as BufferAttribute).version;
}

const geometryBoxes = new WeakMap<BufferGeometry, { version: number; box: Box3 }>();
const instanceBoxes = new WeakMap<Object3D, { key: string; box: Box3 }>();
const scratchMatrix = new Matrix4();
const scratchBox = new Box3();
const worldBox = new Box3();

/** Local bounds of a geometry, recomputed when its positions change (three never invalidates them). */
function geometryBox(geometry: BufferGeometry): Box3 {
  const version = versionOf(geometry.attributes.position);
  const cached = geometryBoxes.get(geometry);
  if (cached && cached.version === version) return cached.box;
  geometry.computeBoundingBox();
  const box = (geometry.boundingBox ?? new Box3()).clone();
  geometryBoxes.set(geometry, { version, box });
  return box;
}

/** Bounds in the object's local space, or null when unknown (nothing to cull on). */
function localBox(object: Drawable): Box3 | null {
  const geometry = object.geometry!;
  // Troika keeps its glyph bounds (BatchedText: the union of its members) up to date itself.
  if (isTroika(object)) return geometry.boundingBox && !geometry.boundingBox.isEmpty() ? geometry.boundingBox : null;
  const base = geometryBox(geometry);
  if (base.isEmpty()) return null;
  const instanced = object as Instanced;
  if (!instanced.isInstancedMesh) return base;
  const key = `${instanced.count}:${instanced.instanceMatrix.version}:${versionOf(geometry.attributes.position)}`;
  const cached = instanceBoxes.get(object);
  if (cached && cached.key === key) return cached.box;
  const box = new Box3();
  for (let i = 0; i < instanced.count; i++) {
    scratchMatrix.fromArray(instanced.instanceMatrix.array as ArrayLike<number> as number[], i * 16);
    box.union(scratchBox.copy(base).applyMatrix4(scratchMatrix));
  }
  instanceBoxes.set(object, { key, box });
  return box.isEmpty() ? null : box;
}

/** World bounds of a drawable this frame (matrixWorld is current inside the render hooks), or null. */
export function worldBounds(object: Object3D): { min: Vec3; max: Vec3 } | null {
  const local = localBox(object as Drawable);
  if (!local) return null;
  worldBox.copy(local).applyMatrix4(object.matrixWorld);
  return { min: worldBox.min.toArray() as Vec3, max: worldBox.max.toArray() as Vec3 };
}

function visibleInScene(object: Object3D): boolean {
  for (let o: Object3D | null = object; o; o = o.parent) if (!o.visible) return false;
  return true;
}

/** The slab as an occluder this frame: drawn, fully opaque and writing depth. */
function solidSlab(slab: Object3D | null): SlabRect | null {
  if (!slab || !visibleInScene(slab)) return null;
  const materials = materialsOf(slab as Drawable) as SlabMaterial[];
  if (!materials.length || !materials.every((m) => m.depthWrite && m.opacity >= 0.999 && m.visible !== false)) return null;
  const bounds = worldBounds(slab);
  if (!bounds) return null;
  return { minX: bounds.min[0], maxX: bounds.max[0], minZ: bounds.min[2], maxZ: bounds.max[2], top: bounds.max[1], bottom: bounds.min[1] };
}

function triangles(object: Drawable): number {
  const geometry = object.geometry!;
  if (!(object as Drawable).isMesh) return 0;
  const count = geometry.index ? geometry.index.count : (geometry.attributes.position?.count ?? 0);
  const instances = (object as Instanced).isInstancedMesh ? (object as Instanced).count : ((geometry as BufferGeometry & { instanceCount?: number }).instanceCount ?? 1);
  return Math.floor(count / 3) * (Number.isFinite(instances) ? instances : 1);
}

const projScreen = new Matrix4();
const ndcToWorld = new Matrix4();
const frustum = new Frustum();
const corner = new Vector3();

/** The camera's view frustum as plain planes and corners (`clipBoxToFrustum`). */
export function frustumOf(camera: Camera): FrustumLike {
  projScreen.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  frustum.setFromProjectionMatrix(projScreen);
  ndcToWorld.copy(projScreen).invert();
  const corners: Vec3[] = [];
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) corners.push(corner.set(x, y, z).applyMatrix4(ndcToWorld).toArray() as Vec3);
  return { planes: frustum.planes.map((p) => ({ normal: p.normal.toArray() as Vec3, constant: p.constant })), corners };
}

/**
 * Hides, for this render, every cullable drawable of a visible floor that lies in the shadow of a solid
 * slab above it. Call `restoreCulled()` after the render. Returns the number of drawables hidden.
 */
export function cullUnderSlabs(camera: Camera, floors: readonly CullFloor[]): number {
  restoreCulled();
  const eye = camera.matrixWorld.elements;
  const eyeAt: Vec3 = [eye[12], eye[13], eye[14]];
  const slabs = floors.map((f) => solidSlab(f.slab));
  let view: FrustumLike | null = null;
  let tris = 0;
  for (const floor of floors) {
    const content = floor.content;
    if (!content || !visibleInScene(content)) continue;
    if (floor.hide) {
      content.visible = false;
      hidden.push(content);
      continue;
    }
    content.updateWorldMatrix(true, false);
    const floorTop = content.matrixWorld.elements[13];
    const occluders = slabs.filter((s): s is SlabRect => s !== null && s.bottom > floorTop && eyeAt[1] > s.top);
    if (!occluders.length) continue;
    const stack: Object3D[] = [...content.children];
    while (stack.length) {
      const object = stack.pop()!;
      if (!object.visible) continue;
      if (object.children.length) {
        stack.push(...object.children);
        continue;
      }
      if (!cullable(object)) continue;
      const box = worldBounds(object);
      if (!box) continue;
      // Only the part in view matters: a road-long batch reaching past the slab's far edge is still
      // hidden when that far end is off screen.
      view ??= frustumOf(camera);
      const seen = clipBoxToFrustum(box, view);
      if (seen && !occluders.some((slab) => inSlabShadow(eyeAt, slab, seen))) continue;
      object.visible = false;
      hidden.push(object);
      tris += triangles(object as Drawable);
      // Troika typesets in onBeforeRender, which a hidden mesh skips: keep it on the same frames (P6).
      const sync = (object as Syncable).sync;
      if (isTroika(object as Drawable) && typeof sync === "function") sync.call(object);
    }
  }
  if (hidden.length) {
    rideCullStats.frames += 1;
    rideCullStats.meshes = hidden.length;
    rideCullStats.triangles = tris;
  }
  return hidden.length;
}

/** Shows everything the last `cullUnderSlabs` hid. */
export function restoreCulled(): void {
  for (const object of hidden) object.visible = true;
  hidden.length = 0;
}

/**
 * Wraps the scene's render hooks (keeping any existing ones): before each render, restore leftovers and
 * cull when `active()`; after it, restore. Hidden meshes are therefore hidden only inside the render,
 * so components and the next frame's visibility rules never see the change. Returns the uninstall.
 */
export function installRideCull(scene: Scene, active: () => boolean, floors: () => readonly CullFloor[]): () => void {
  const before = scene.onBeforeRender;
  const after = scene.onAfterRender;
  // A scene's hooks get (renderer, scene, camera, renderTarget): forward whatever three passes.
  scene.onBeforeRender = function (this: Scene, ...args: Parameters<Scene["onBeforeRender"]>) {
    before.apply(this, args);
    restoreCulled();
    if (active()) cullUnderSlabs(args[2], floors());
  };
  scene.onAfterRender = function (this: Scene, ...args: Parameters<Scene["onAfterRender"]>) {
    restoreCulled();
    after.apply(this, args);
  };
  return () => {
    restoreCulled();
    scene.onBeforeRender = before;
    scene.onAfterRender = after;
  };
}
