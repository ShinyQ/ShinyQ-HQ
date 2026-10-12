import type { Camera, Material, Object3D, Scene, WebGLRenderer, WebGLRenderTarget } from "three";
import type { FloorId } from "@/content/schema";
import { FLOOR_ROOT, getFloorContent } from "../tower/floorRegistry";
import { markWarm } from "./warmState";

/**
 * Shader precompile for the elevator ride (R5 P6, REPORT SP9, F5.6).
 *
 * Interim shim: P2 (`feat/r5-p2-gpu-look-preserving`) owns this module with the same `precompileFloor`
 * signature plus program pins, `renderProbe` and `postHandle`. Whichever PR merges second keeps P2's
 * file and drops this one; `FloorPrep` (tower/Tower.tsx) only calls `precompileFloor`.
 *
 * three keys programs on the render target they draw into (tone mapping and output color space), and
 * the full tier draws the scene into the composer's input buffer, so a compile must bind that target or
 * it builds programs nobody uses. A scene hook records the renderer, camera and target of every real
 * render (target null on the lite tier: the canvas).
 */
export interface PrecompileOptions {
  /** Stop waiting after this long (ms, default 2000); programs keep compiling in the driver. */
  timeoutMs?: number;
  /** Pin new programs so they survive unmounts (P2 only; ignored here). */
  pin?: boolean;
}

export interface PrecompileReport {
  materials: number;
  programsBefore: number;
  programsAfter: number;
  pinned: number;
  ms: number;
  /** `KHR_parallel_shader_compile` present: waiting did not block the main thread. */
  parallel: boolean;
  timedOut: boolean;
}

export interface FloorPrecompileReport extends PrecompileReport {
  floor: FloorId;
  /** The floor's main component (FLOOR_ROOT) was mounted, so the floor is now warm. */
  contentMounted: boolean;
}

interface Probe {
  gl: WebGLRenderer;
  camera: Camera;
  target: WebGLRenderTarget | null;
}
const probes = new WeakMap<Scene, Probe | null>();

/** Records the renderer, camera and bound target each time `scene` renders (WebGLRenderer.render calls `scene.onBeforeRender(renderer, scene, camera, target)`). */
function trackScene(scene: Scene): Probe | null {
  if (probes.has(scene)) return probes.get(scene) ?? null;
  probes.set(scene, null);
  const previous = scene.onBeforeRender;
  scene.onBeforeRender = function (this: Scene, ...args: Parameters<Scene["onBeforeRender"]>) {
    probes.set(scene, { gl: args[0], camera: args[2], target: (args[3] as unknown as WebGLRenderTarget | null) ?? null });
    previous.apply(this, args);
  };
  return null;
}

function sceneOf(object: Object3D): Scene | null {
  let o: Object3D = object;
  while (o.parent) o = o.parent;
  return (o as Scene).isScene ? (o as Scene) : null;
}

type ProgramLike = { isReady?: () => boolean };

function waitReady(gl: WebGLRenderer, materials: Set<Material>, timeoutMs: number): Promise<boolean> {
  const pending = new Set(materials);
  const deadline = performance.now() + timeoutMs;
  return new Promise((resolve) => {
    const check = () => {
      for (const m of pending) {
        const program = (gl.properties.get(m) as { currentProgram?: ProgramLike }).currentProgram;
        if (!program?.isReady || program.isReady()) pending.delete(m);
      }
      if (pending.size === 0) return resolve(true);
      if (performance.now() >= deadline) return resolve(false);
      setTimeout(check, 10);
    };
    check();
  });
}

/**
 * Compiles every program a floor's mounted content needs (hidden children too: three's compile
 * traverses all objects) with the scene's lights and fog, into the scene pass's target, then waits
 * until the driver reports them linked (non-blocking with KHR_parallel_shader_compile). Never draws.
 * Null before the scene has rendered once (the first render compiles anyway) or without content.
 */
export async function precompileFloor(id: FloorId, options: PrecompileOptions = {}): Promise<FloorPrecompileReport | null> {
  const content = getFloorContent(id);
  const scene = content && sceneOf(content);
  if (!content || !scene) return null;
  const probe = trackScene(scene);
  if (!probe) return null;
  const { gl, camera, target } = probe;
  const start = performance.now();
  const programsBefore = gl.info.programs?.length ?? 0;
  const previous = gl.getRenderTarget();
  let materials: Set<Material>;
  gl.setRenderTarget(target);
  try {
    materials = gl.compile(content, camera, scene);
  } finally {
    gl.setRenderTarget(previous);
  }
  const ready = await waitReady(gl, materials, options.timeoutMs ?? 2000);
  const contentMounted = Boolean(content.getObjectByName(FLOOR_ROOT[id]));
  if (contentMounted && ready) markWarm(id);
  return {
    floor: id,
    contentMounted,
    materials: materials.size,
    programsBefore,
    programsAfter: gl.info.programs?.length ?? 0,
    pinned: 0,
    ms: Math.round(performance.now() - start),
    parallel: gl.extensions.has("KHR_parallel_shader_compile"),
    timedOut: !ready,
  };
}
