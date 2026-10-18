"use client";

import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import { InstancedBufferAttribute, Matrix4, PlaneGeometry, Quaternion, Vector3, type Camera, type InstancedMesh } from "three";
import { INTRO } from "../camera/intro";
import { createHoloMaterial, HOLO_MODE } from "../fx/holoFx";
import { neonColor } from "../fx/materials";
import { useDispose } from "../fx/useDispose";
import { useUniformTime } from "../fx/useUniformTime";
import type { GpuTier } from "../types";
import { beaconAlpha, INTRO_LANDMARKS } from "./landmarks";
import { introRuntime } from "./runtime";

const NO_RAYCAST = () => null;
const BEACON_Y = 0.03;
/** A landmark counts as passed once it projects inside this box around the middle of the view (NDC). */
const PASS_X = 0.55;
const PASS_Y = 0.75;

/** Latches each landmark's pass time and writes the beacon alphas (all 0 outside the intro). */
function stepBeacons(alpha: InstancedBufferAttribute, hits: (number | null)[], camera: Camera, ndc: Vector3): void {
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

/**
 * Intro floor beacons: one instanced holo quad per landmark (`INTRO_LANDMARKS`), pulsing once when the
 * reveal orbit carries the landmark through the middle of the view. Each id that pulses goes into
 * `introRuntime.lit`. Mounted by the Lobby during the intro only (on the full tier once the composer exists).
 */
export function IntroBeacons({ tier }: { tier: GpuTier }) {
  const mesh = useRef<InstancedMesh>(null);
  const count = INTRO_LANDMARKS.length;
  const alpha = useMemo(() => new InstancedBufferAttribute(new Float32Array(count), 1), [count]);
  const geometry = useMemo(() => {
    const g = new PlaneGeometry(1, 1);
    g.setAttribute("aAlpha", alpha);
    return g;
  }, [alpha]);
  useDispose(geometry);
  const material = useMemo(() => createHoloMaterial({ mode: HOLO_MODE.beacon }), []);
  useDispose(material);
  useUniformTime(useMemo(() => [material], [material]));
  const colors = useMemo(() => {
    const c = neonColor("#22d3ee", 1.6, tier).toArray();
    return new Float32Array(INTRO_LANDMARKS.flatMap(() => c));
  }, [tier]);
  const hits = useRef<(number | null)[]>(INTRO_LANDMARKS.map(() => null));
  const ndc = useMemo(() => new Vector3(), []);

  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const flat = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2);
    const matrix = new Matrix4();
    INTRO_LANDMARKS.forEach((l, i) => m.setMatrixAt(i, matrix.compose(new Vector3(l.x, BEACON_Y, l.z), flat, new Vector3(l.w, l.d, 1))));
    m.instanceMatrix.needsUpdate = true;
  }, []);

  useFrame(({ camera }) => stepBeacons(alpha, hits.current, camera, ndc));

  return (
    <instancedMesh ref={mesh} args={[geometry, material, count]} renderOrder={2} frustumCulled={false} raycast={NO_RAYCAST}>
      <instancedBufferAttribute attach="instanceColor" args={[colors, 3]} />
    </instancedMesh>
  );
}
