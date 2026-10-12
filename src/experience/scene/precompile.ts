import type { Camera, Material, Object3D, Scene, WebGLRenderer, WebGLRenderTarget } from "three";
import type { FloorId } from "@/content/schema";
import { FLOOR_ROOT, getFloorContent } from "../tower/floorRegistry";
import { sceneTarget } from "./postHandle";
import { programPins, withTarget } from "./programPins";
import { renderProbe } from "./renderProbe";
import { markWarm } from "./warmState";

export interface PrecompileOptions {
  /** Target the object is drawn into; defaults to `sceneTarget()` (composer input on full, canvas on lite). */
  target?: WebGLRenderTarget | null;
  /** Stop waiting after this long (ms, default 2000); programs keep compiling in the driver. */
  timeoutMs?: number;
  /** Pin new programs so they survive unmounts (default true). */
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
 * Compiles every program `object` needs (hidden children too) for the target it will be drawn into,
 * then waits until the driver reports them linked (non-blocking with KHR_parallel_shader_compile) and
 * pins them. Never draws. The general utility behind boot warm-up (ProgramWarmup) and P6's ride prepare.
 */
export async function precompileObject(gl: WebGLRenderer, object: Object3D, camera: Camera, scene: Scene, options: PrecompileOptions = {}): Promise<PrecompileReport> {
  const start = performance.now();
  const programsBefore = gl.info.programs?.length ?? 0;
  const target = options.target === undefined ? sceneTarget() : options.target;
  const materials: Set<Material> = withTarget(gl, target, () => gl.compile(object, camera, scene));
  const parallel = gl.extensions.has("KHR_parallel_shader_compile");
  const ready = await waitReady(gl, materials, options.timeoutMs ?? 2000);
  const pinned = options.pin === false ? 0 : programPins.pinFrom(gl, object, camera, scene, target);
  return { materials: materials.size, programsBefore, programsAfter: gl.info.programs?.length ?? 0, pinned, ms: Math.round(performance.now() - start), parallel, timedOut: !ready };
}

/** Precompiles a floor's mounted content (see the P6 contract in the P2 plan). Null without a renderer or content. */
export async function precompileFloor(id: FloorId, options: Omit<PrecompileOptions, "target"> = {}): Promise<FloorPrecompileReport | null> {
  const { gl, camera, scene } = renderProbe;
  const content = getFloorContent(id);
  if (!gl || !camera || !scene || !content) return null;
  const contentMounted = Boolean(content.getObjectByName(FLOOR_ROOT[id]));
  const report = await precompileObject(gl, content, camera, scene, options);
  if (contentMounted && !report.timedOut) markWarm(id);
  return { ...report, floor: id, contentMounted };
}

/** Precompiles everything mounted now (boot: the Lobby, hidden neighbours, rover, HUD-in-world). */
export async function precompileScene(options: Omit<PrecompileOptions, "target"> = {}): Promise<PrecompileReport | null> {
  const { gl, camera, scene } = renderProbe;
  if (!gl || !camera || !scene) return null;
  return precompileObject(gl, scene, camera, scene, options);
}
