"use client";

import { useThree } from "@react-three/fiber";
import { useEffect } from "react";
import { HalfFloatType, type Material, type Object3D, type WebGLRenderTarget } from "three";
import { getHQStore } from "@/store/useHQStore";
import { framePacer } from "./framePacer";
import { allBlack, bisectCulprit, halfNotFinite, scanHalfRgba, type HalfScan } from "./blackFrame";
import { postHandle } from "./postHandle";
import { qualityStore } from "./qualityStore";
import { renderProbe } from "./renderProbe";

/** Where the probe samples the canvas after each final draw (fractions of the drawing buffer). */
const SAMPLES: readonly [number, number][] = [
  [0.5, 0.5],
  [0.25, 0.3],
  [0.75, 0.7],
  [0.15, 0.85],
  [0.85, 0.15],
];
const MAX_RECORDS = 50;

export interface BlackFrameRecord {
  frame: number;
  at: number;
  floor: string;
  phase: string;
  ride: boolean;
  camera: { position: number[]; quaternion: number[]; near: number; far: number; fov: number; finite: boolean };
  graphics: ReturnType<typeof renderProbe.graphics>;
  applied: ReturnType<typeof qualityStore.applied>;
  buffer: [number, number];
  /** The drawing buffer changed size since the previous final draw. */
  resized: boolean;
  /** Full tier: NaN and Inf scan of the scene's HDR input buffer. */
  input: HalfScan | null;
  /** The object whose draw alone writes the first bad pixel (full tier, when one does). */
  culprit: { type: string; name: string; path: string[]; material: string } | null;
}

/** `window.__hq.probe`: frames checked and the black frames found (newest last). */
export const blackFrameLog = { checked: 0, black: [] as BlackFrameRecord[] };

type Drawable = Object3D & { isMesh?: boolean; isPoints?: boolean; isLine?: boolean; isSprite?: boolean; material?: Material | Material[] };

function describe(o: Drawable): BlackFrameRecord["culprit"] {
  const path: string[] = [];
  for (let p: Object3D | null = o; p && path.length < 8; p = p.parent) path.push(p.name || p.type);
  const m = Array.isArray(o.material) ? o.material[0] : o.material;
  const uniforms = (m as { uniforms?: Record<string, unknown> } | undefined)?.uniforms;
  return { type: o.type, name: o.name, path, material: `${m?.type ?? "none"}${uniforms ? ` [${Object.keys(uniforms).join(", ")}]` : ""}` };
}

/**
 * `?gfx=probe` (debugging on a visitor's device, never mounted otherwise; lazy chunk). After every final draw to the
 * canvas it reads a few pixels back; when all are black it logs the frame with the floor, camera, quality and canvas
 * size, and on the full tier scans the scene's HDR input buffer for NaN or Inf and bisects the scene by visibility to
 * find the object that writes the bad pixel. The read-back stalls the GPU each frame, so combine it with
 * `monitor-off` (the probe's default) and expect a lower frame rate.
 */
export default function BlackFrameProbe() {
  const gl = useThree((s) => s.gl);
  const get = useThree((s) => s.get);
  useEffect(() => {
    const ctx = gl.getContext();
    const previous = gl.render;
    const pixel = new Uint8Array(4);
    let busy = false;
    let lastSize: [number, number] | null = null;
    const hq = (window as unknown as { __hq?: Record<string, unknown> }).__hq;
    if (hq) hq.probe = blackFrameLog;

    const readInput = (rt: WebGLRenderTarget): { scan: HalfScan; data: Uint16Array } | null => {
      if (rt.texture.type !== HalfFloatType) return null;
      const data = new Uint16Array(rt.width * rt.height * 4);
      gl.readRenderTargetPixels(rt, 0, 0, rt.width, rt.height, data);
      return { scan: scanHalfRgba(data, rt.width), data };
    };

    const findCulprit = (rt: WebGLRenderTarget, at: [number, number]): BlackFrameRecord["culprit"] => {
      const { scene, camera } = get();
      const items: Drawable[] = [];
      scene.traverseVisible((o) => {
        const d = o as Drawable;
        if (d.isMesh || d.isPoints || d.isLine || d.isSprite) items.push(d);
      });
      const one = new Uint16Array(4);
      const bound = gl.getRenderTarget();
      const bad = (shown: ReadonlySet<Drawable>) => {
        for (const o of items) o.visible = shown.has(o);
        gl.setRenderTarget(rt);
        gl.clear();
        previous.call(gl, scene, camera);
        gl.readRenderTargetPixels(rt, at[0], at[1], 1, 1, one);
        return Array.from(one).some(halfNotFinite);
      };
      try {
        const culprit = bisectCulprit(items, bad);
        return culprit ? describe(culprit) : null;
      } finally {
        for (const o of items) o.visible = true;
        gl.setRenderTarget(bound);
      }
    };

    const check = () => {
      blackFrameLog.checked += 1;
      const w = ctx.drawingBufferWidth;
      const h = ctx.drawingBufferHeight;
      const resized = lastSize !== null && (lastSize[0] !== w || lastSize[1] !== h);
      lastSize = [w, h];
      const pixels = SAMPLES.map(([u, v]) => {
        ctx.readPixels(Math.floor(u * w), Math.floor(v * h), 1, 1, ctx.RGBA, ctx.UNSIGNED_BYTE, pixel);
        return Array.from(pixel);
      });
      if (!allBlack(pixels)) return;
      const { camera } = get();
      const s = getHQStore().getState();
      const cam = camera as typeof camera & { fov?: number; near?: number; far?: number };
      const matrices = [...camera.matrixWorld.elements, ...camera.projectionMatrix.elements];
      const rt = postHandle.get()?.composer()?.inputBuffer ?? null;
      const input = rt ? readInput(rt) : null;
      const record: BlackFrameRecord = {
        frame: framePacer.frames,
        at: Math.round(performance.now()),
        floor: s.floor,
        phase: s.phase,
        ride: s.ride !== null,
        camera: { position: camera.position.toArray(), quaternion: camera.quaternion.toArray(), near: cam.near ?? 0, far: cam.far ?? 0, fov: cam.fov ?? 0, finite: matrices.every(Number.isFinite) },
        graphics: renderProbe.graphics(),
        applied: qualityStore.applied(),
        buffer: [w, h],
        resized,
        input: input?.scan ?? null,
        culprit: rt && input?.scan.first ? findCulprit(rt, input.scan.first) : null,
      };
      blackFrameLog.black.push(record);
      if (blackFrameLog.black.length > MAX_RECORDS) blackFrameLog.black.shift();
      console.warn("[hq probe] black frame", JSON.stringify(record));
    };

    gl.render = function (this: typeof gl, ...args: Parameters<typeof gl.render>) {
      previous.apply(this, args);
      if (busy || gl.getRenderTarget() !== null) return;
      busy = true;
      try {
        check();
      } finally {
        busy = false;
      }
    };
    console.info("[hq probe] on: black frames are logged here and kept in window.__hq.probe");
    return () => {
      gl.render = previous;
      if (hq) delete hq.probe;
    };
  }, [gl, get]);
  return null;
}
