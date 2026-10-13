import type { InstancedMesh, Material, Mesh, Object3D } from "three";

/** Stand-in renderer: a program key from material type, side, instancing and the bound target, like three's cache key in spirit. */
export function fakeRenderer({ ready = true }: { ready?: boolean } = {}) {
  const props = new WeakMap<object, { currentProgram?: { cacheKey: string; isReady: () => boolean } }>();
  let target: unknown = null;
  const targets: unknown[] = [];
  const gl = {
    properties: {
      get(m: object) {
        let p = props.get(m);
        if (!p) props.set(m, (p = {}));
        return p;
      },
    },
    getRenderTarget: () => target,
    setRenderTarget(t: unknown) {
      target = t;
      targets.push(t);
    },
    compile(root: Object3D) {
      const set = new Set<Material>();
      root.traverse((o) => {
        const m = (o as Mesh).material as Material | undefined;
        if (!m || Array.isArray(m)) return;
        gl.properties.get(m).currentProgram = { cacheKey: `${m.type}:${(o as InstancedMesh).isInstancedMesh ? "i" : "m"}:${m.side}:${String(target)}`, isReady: () => ready };
        set.add(m);
      });
      return set;
    },
    info: { programs: [] as unknown[] },
    extensions: { has: () => ready },
    targets,
  };
  return gl;
}
