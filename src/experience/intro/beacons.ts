import type { Camera, InstancedBufferAttribute, Vector3 } from "three";
import { INTRO } from "../camera/intro";
import { beaconAlpha, INTRO_LANDMARKS } from "./landmarks";
import { introRuntime } from "./runtime";

/** A landmark counts as passed once it projects inside this box around the middle of the view (NDC). */
export const PASS_X = 0.55;
export const PASS_Y = 0.75;

/** Latches each landmark's pass time and writes the beacon alphas (all 0 outside the intro). */
export function stepBeacons(alpha: InstancedBufferAttribute, hits: (number | null)[], camera: Camera, ndc: Vector3): void {
  const a = alpha.array as Float32Array;
  let dirty = false;
  const t = introRuntime.t;
  for (let i = 0; i < hits.length; i++) {
    const l = INTRO_LANDMARKS[i];
    if (!introRuntime.active) hits[i] = null;
    else if (hits[i] === null && t > INTRO.wake) {
      ndc.set(l.x, l.y, l.z).project(camera);
      if (ndc.z < 1 && Math.abs(ndc.x) < PASS_X && Math.abs(ndc.y) < PASS_Y) {
        hits[i] = t;
        if (!introRuntime.lit.includes(l.id)) introRuntime.lit.push(l.id);
      }
    }
    const hit = hits[i];
    const next = hit === null ? 0 : beaconAlpha(t - hit);
    if (a[i] !== next) {
      a[i] = next;
      dirty = true;
    }
  }
  if (dirty) alpha.needsUpdate = true;
}
