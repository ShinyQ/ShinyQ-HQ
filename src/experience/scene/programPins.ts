import { BufferAttribute, BufferGeometry, Group, InstancedBufferAttribute, InstancedMesh, Line, LineLoop, LineSegments, Mesh, Points, Sprite, Texture, type Camera, type Material, type Object3D, type Scene, type SpriteMaterial, type WebGLRenderer, type WebGLRenderTarget } from "three";

const TEXTURE_SLOTS = ["map", "alphaMap", "aoMap", "lightMap", "bumpMap", "normalMap", "displacementMap", "emissiveMap", "specularMap", "roughnessMap", "metalnessMap", "gradientMap", "matcap"] as const;
/** Geometry attributes whose presence or size changes a program (vertex alphas, extra UV channels, tangents). */
const PROGRAM_ATTRIBUTES = ["normal", "uv", "uv1", "uv2", "uv3", "color", "tangent"] as const;

type Renderable = Object3D & {
  material?: Material | Material[];
  geometry?: BufferGeometry;
  instanceColor?: InstancedBufferAttribute | null;
  isMesh?: boolean;
  isInstancedMesh?: boolean;
  isBatchedMesh?: boolean;
  isSkinnedMesh?: boolean;
  isPoints?: boolean;
  isLine?: boolean;
  isLineSegments?: boolean;
  isLineLoop?: boolean;
  isSprite?: boolean;
};

/** A one-vertex geometry with the same program-shaping attributes; null for morphed geometry (not used here). */
export function pinGeometry(src: BufferGeometry): BufferGeometry | null {
  if (Object.keys(src.morphAttributes).length > 0) return null;
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(new Float32Array(3), 3));
  for (const name of PROGRAM_ATTRIBUTES) {
    const a = src.getAttribute(name);
    if (a) g.setAttribute(name, new BufferAttribute(new Float32Array(a.itemSize), a.itemSize));
  }
  return g;
}

function placeholder(src: Texture): Texture {
  const t = new Texture();
  t.channel = src.channel;
  t.colorSpace = src.colorSpace;
  t.mapping = src.mapping;
  return t;
}

/** A clone with the same program parameters that holds no texture images (so unmounted floors free their canvases). */
export function pinMaterial(src: Material): Material | null {
  if ((src as { envMap?: Texture | null }).envMap) return null;
  const m = src.clone();
  const slots = m as unknown as Record<string, unknown>;
  for (const key of TEXTURE_SLOTS) {
    const t = slots[key];
    if (t instanceof Texture) slots[key] = placeholder(t);
  }
  const uniforms = (m as { uniforms?: Record<string, { value: unknown }> }).uniforms;
  if (uniforms) {
    for (const u of Object.values(uniforms)) {
      try {
        if (u.value instanceof Texture) u.value = null;
      } catch {
        // read-only uniform (derived materials): the verification in pinFrom drops it if it matters
      }
    }
  }
  return m;
}

/** An object of the same kind as `src` (instancing and instance colors change the program). */
export function pinObject(src: Object3D, material: Material): Object3D | null {
  const s = src as Renderable;
  if (s.isBatchedMesh || s.isSkinnedMesh) return null;
  if (s.isSprite) return new Sprite(material as SpriteMaterial);
  const geometry = s.geometry ? pinGeometry(s.geometry) : null;
  if (!geometry) return null;
  if (s.isInstancedMesh) {
    const pin = new InstancedMesh(geometry, material, 1);
    if (s.instanceColor) pin.instanceColor = new InstancedBufferAttribute(new Float32Array(3), 3);
    return pin;
  }
  if (s.isPoints) return new Points(geometry, material);
  if (s.isLineSegments) return new LineSegments(geometry, material);
  if (s.isLineLoop) return new LineLoop(geometry, material);
  if (s.isLine) return new Line(geometry, material);
  if (s.isMesh) return new Mesh(geometry, material);
  return null;
}

const keyOf = (gl: WebGLRenderer, m: Material): string | null => (gl.properties.get(m) as { currentProgram?: { cacheKey: string } }).currentProgram?.cacheKey ?? null;

function disposePin(pin: Object3D) {
  const p = pin as Renderable;
  if (!p.isSprite) p.geometry?.dispose();
  for (const m of Array.isArray(p.material) ? p.material : p.material ? [p.material] : []) m.dispose();
}

/**
 * Keeps shader programs alive after the floor that needed them unmounts: three deletes a program when
 * its last material is disposed, so a revisit would compile again. Each pin is a tiny clone that is
 * compiled once and never rendered or uploaded (no geometry or texture memory); a pin is kept only if
 * its program key matches the source's exactly.
 */
export const programPins = {
  group: new Group(),
  keys: new Set<string>(),
  misses: 0,
  pinFrom(gl: WebGLRenderer, root: Object3D, camera: Camera, scene: Scene, target: WebGLRenderTarget | null): number {
    const fresh: { pin: Object3D; key: string }[] = [];
    root.traverse((object) => {
      const o = object as Renderable;
      if (!(o.isMesh || o.isPoints || o.isLine || o.isSprite) || !o.material) return;
      for (const material of Array.isArray(o.material) ? o.material : [o.material]) {
        const key = keyOf(gl, material);
        if (!key || this.keys.has(key) || fresh.some((f) => f.key === key)) continue;
        const clone = pinMaterial(material);
        const pin = clone ? pinObject(o, clone) : null;
        if (!pin) {
          clone?.dispose();
          this.misses += 1;
          continue;
        }
        fresh.push({ pin, key });
      }
    });
    if (fresh.length === 0) return 0;
    const batch = new Group();
    for (const f of fresh) batch.add(f.pin);
    const previous = gl.getRenderTarget();
    gl.setRenderTarget(target);
    try {
      gl.compile(batch, camera, scene);
    } finally {
      gl.setRenderTarget(previous);
    }
    let pinned = 0;
    for (const { pin, key } of fresh) {
      if (keyOf(gl, (pin as Renderable).material as Material) === key) {
        this.keys.add(key);
        this.group.add(pin);
        pinned += 1;
      } else {
        batch.remove(pin);
        disposePin(pin);
        this.misses += 1;
      }
    }
    return pinned;
  },
  clear(): void {
    for (const pin of [...this.group.children]) {
      this.group.remove(pin);
      disposePin(pin);
    }
    this.keys.clear();
    this.misses = 0;
  },
};
