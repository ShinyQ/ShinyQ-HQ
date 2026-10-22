"use client";

import { useFrame } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { Color, CylinderGeometry, Object3D, type InstancedMesh, type ShaderMaterial } from "three";
import { statsState, type StatsState } from "@/lib/visits/store";
import { useHQStore } from "@/store/useHQStore";
import { createHoloMaterial, HOLO_MODE } from "../../fx/holoFx";
import { neonColor } from "../../fx/materials";
import { useDispose } from "../../fx/useDispose";
import { useUniformTime } from "../../fx/useUniformTime";
import type { GpuTier } from "../../types";
import { ENGINE } from "./layout";
import { flashLevel, reactorState, type ReactorState } from "./reactor";
import { CORE_FX, COOLANT_TONE, coolantRisers, coreDetail, type FlashMark, nextFlash, pulseLevel, ringAngle, segmentColors, segmentPose, SPARK_TONE, sparkPos } from "./reactorFx";
import { reactorLive, useReactorFeed } from "./reactorLive";

const NO_RAYCAST = () => null;
const TAU = Math.PI * 2;
/** Seconds between model refreshes from the frame loop (the feed's staleness window and the flash clock). */
const MODEL_EVERY = 1;

export interface ReactorProbe {
  /** The last computed model (null before the first). */
  state: ReactorState | null;
  /** Lane segments and sparks drawn. */
  segments: number;
  sparks: number;
  /** Ring 0's turn (radians) and the coolant level (pulse times flash) as last written. */
  angle: number;
  level: number;
  flash: number;
}

const probe: ReactorProbe = { state: null, segments: 0, sparks: 0, angle: 0, level: 0, flash: 0 };

/** `__hq.reactor().state()` (Playwright): what the core shows. */
export function reactorCoreProbe(): ReactorProbe {
  return { ...probe, state: probe.state && { ...probe.state, lanes: [...probe.state.lanes] } };
}

const WHITE = new Color(1, 1, 1);

/** The coolant at pulse `level`, both meshes brightened toward white by the deploy `flash` (uniforms only, no new program). */
function lightCore(cool: ShaderMaterial, ring: ShaderMaterial, base: { color: Color; opacity: number }, level: number, flash: number): void {
  cool.uniforms.uOpacity.value = Math.min(1, base.opacity * level + flash * 0.5);
  (cool.uniforms.uColor.value as Color).copy(base.color).lerp(WHITE, flash * 0.7).multiplyScalar(1 + flash);
  (ring.uniforms.uColor.value as Color).setScalar(1 + flash * 1.2);
}

/** Writes the lane segments (and the live sparks after them) for motion time `t` into instance matrices. */
function placeInstances(out: Float32Array, o: Object3D, perRing: number, sparks: number, t: number, reducedMotion: boolean): void {
  let n = 0;
  CORE_FX.rings.forEach((_, i) => {
    const angle = ringAngle(i, t, reducedMotion);
    for (let k = 0; k < perRing; k++) {
      const p = segmentPose(i, k, perRing, angle);
      o.position.set(0, p.y, 0);
      o.rotation.set(0, p.yaw, 0);
      o.scale.set(p.r, CORE_FX.segH, p.r);
      o.updateMatrix();
      o.matrix.toArray(out, 16 * n++);
    }
  });
  for (let j = 0; j < sparks; j++) {
    const p = sparkPos(j, t);
    o.position.set(p.x, p.y, p.z);
    o.rotation.set(0, t + j, 0);
    o.scale.setScalar(CORE_FX.spark);
    o.updateMatrix();
    o.matrix.toArray(out, 16 * n++);
  }
}

/**
 * B1's living reactor core (B1-2), two draws on the holo program B1 already compiles (`fx/holoFx.ts`, `uMode` is a
 * uniform): one instanced mesh of arc segments on the `strip` mode, four rings of lane segments colored by the newest CI
 * run's jobs (idle amber without a feed) with the awake desks as sparks orbiting inside them (full tier), and one
 * instanced mesh on the `core` mode, the coolant shell around the column and four risers, pulsing at the model's
 * `pulseHz` and flashing white on a production deploy. The solids are in the floor's merged mesh (`coreSolids`), the
 * title and counter plate in its sign set. Polls the office feed only while the visitor is on B1 (`reactorLive`).
 * Lite: half the segments, no sparks. Reduced motion: no turn, no orbit, a steady coolant level.
 */
export function ReactorCore({ tier, stats }: { tier: GpuTier; stats: StatsState }) {
  const reducedMotion = useHQStore((s) => s.reducedMotion);
  const onB1 = useHQStore((s) => s.floor === "B1");
  const feed = useReactorFeed();
  const full = tier === "full";
  const { perRing, segments, sparks: maxSparks } = coreDetail(tier);

  useEffect(() => {
    if (!onB1) return;
    reactorLive.start();
    return () => reactorLive.stop();
  }, [onB1]);

  const arc = useMemo(() => {
    const slot = TAU / perRing;
    return new CylinderGeometry(1, 1, 1, 4, 1, true, -(slot * CORE_FX.fill) / 2, slot * CORE_FX.fill);
  }, [perRing]);
  useDispose(arc);
  const tube = useMemo(() => new CylinderGeometry(1, 1, 1, 24, 1, true), []);
  useDispose(tube);
  const ringMat = useMemo(() => createHoloMaterial({ mode: HOLO_MODE.strip, opacity: full ? 1 : 0.85, fade: [40, 110] }), [full]);
  useDispose(ringMat);
  const coolMat = useMemo(() => createHoloMaterial({ mode: HOLO_MODE.core, color: neonColor(COOLANT_TONE, 1.6, tier), opacity: full ? 0.9 : 0.75, fade: [40, 110] }), [full, tier]);
  useDispose(coolMat);
  useUniformTime(useMemo(() => [ringMat, coolMat], [ringMat, coolMat]));
  const coolBase = useMemo(() => ({ color: coolMat.uniforms.uColor.value.clone() as Color, opacity: coolMat.uniforms.uOpacity.value as number }), [coolMat]);

  const total = segments + maxSparks;
  const o = useMemo(() => new Object3D(), []);
  // Matrices and colors exist from creation (attached), so the floor's precompile builds the final program.
  const ringArrays = useMemo(() => {
    const matrices = new Float32Array(total * 16);
    const colors = new Float32Array(total * 3);
    const c = new Color();
    segmentColors([], segments).forEach((hex, i) => neonColor(hex, 1, tier).toArray(colors, i * 3));
    for (let j = segments; j < total; j++) c.set(SPARK_TONE).multiplyScalar(2.4).toArray(colors, j * 3);
    placeInstances(matrices, o, perRing, 0, 0, true);
    return { matrices, colors };
  }, [total, segments, perRing, tier, o]);
  const coolArrays = useMemo(() => {
    const parts = [{ x: 0, z: 0, r: CORE_FX.shell.r, y0: CORE_FX.plinth, y1: CORE_FX.capY }, ...coolantRisers()];
    const matrices = new Float32Array(parts.length * 16);
    const colors = new Float32Array(parts.length * 3);
    parts.forEach((p, i) => {
      o.position.set(p.x, (p.y0 + p.y1) / 2, p.z);
      o.rotation.set(0, 0, 0);
      o.scale.set(p.r, p.y1 - p.y0, p.r);
      o.updateMatrix();
      o.matrix.toArray(matrices, i * 16);
      // The shell glows brightest; the risers carry the coolant at half its strength.
      new Color(i === 0 ? 1 : 0.55, i === 0 ? 1 : 0.55, i === 0 ? 1 : 0.55).toArray(colors, i * 3);
    });
    return { matrices, colors, count: parts.length };
  }, [o]);

  const rings = useRef<InstancedMesh>(null);
  const run = useRef({ t: 0, phase: 0, write: 0, model: 0, lanes: "", flash: { seen: null, at: null } as FlashMark, state: null as ReactorState | null });

  // The model: on every feed or stats change, and once a second from the frame loop (the stale window, the flash).
  const refresh = useCallback(() => {
    const r = run.current;
    const now = reactorLive.now();
    const state = reactorState(reactorLive.feed(), statsState(), { reducedMotion, now });
    r.state = state;
    r.flash = nextFlash(r.flash, state.deployAt, now);
    const m = rings.current;
    const key = state.lanes.join();
    if (m?.instanceColor && key !== r.lanes) {
      r.lanes = key;
      const c = new Color();
      segmentColors(state.lanes, segments).forEach((hex, i) => m.setColorAt(i, c.set(hex).multiplyScalar(state.lanes.length ? (full ? 2.2 : 1.4) : 1)));
      m.instanceColor.needsUpdate = true;
    }
    if (m) m.count = segments + Math.min(maxSparks, state.sparks);
    probe.state = state;
    probe.segments = segments;
    probe.sparks = m ? m.count - segments : 0;
  }, [reducedMotion, segments, maxSparks, full]);

  useEffect(refresh, [refresh, feed, stats]);

  useEffect(
    () => () => {
      probe.state = null;
      probe.segments = 0;
      probe.sparks = 0;
    },
    [],
  );

  useFrame((_, delta) => {
    const r = run.current;
    const dt = Math.min(delta, 0.1);
    r.model += dt;
    if (r.model >= MODEL_EVERY) {
      r.model = 0;
      refresh();
    }
    const state = r.state;
    const flash = r.flash.at === null ? 0 : flashLevel(r.flash.at, reactorLive.now());
    if (!reducedMotion) {
      r.t += dt;
      r.phase = (r.phase + dt * TAU * (state?.pulseHz ?? 0)) % TAU;
    }
    const level = pulseLevel(r.phase, reducedMotion);
    lightCore(coolMat, ringMat, coolBase, level, flash);
    probe.level = level;
    probe.flash = flash;
    const m = rings.current;
    if (!m || reducedMotion || !onB1) return;
    r.write += dt;
    if (r.write < 1 / CORE_FX.writeHz) return;
    r.write = 0;
    placeInstances(m.instanceMatrix.array as Float32Array, o, perRing, m.count - segments, r.t, reducedMotion);
    m.instanceMatrix.needsUpdate = true;
    probe.angle = ringAngle(0, r.t, reducedMotion);
  });

  const R = ENGINE.reactor;
  return (
    <group name="engine-reactor" position={[R.x, 0, R.z]}>
      <instancedMesh key={total} ref={rings} name="engine-reactor-rings" args={[arc, ringMat, total]} frustumCulled={false} raycast={NO_RAYCAST}>
        <instancedBufferAttribute attach="instanceMatrix" args={[ringArrays.matrices, 16]} />
        <instancedBufferAttribute attach="instanceColor" args={[ringArrays.colors, 3]} />
      </instancedMesh>
      <instancedMesh name="engine-reactor-coolant" args={[tube, coolMat, coolArrays.count]} raycast={NO_RAYCAST}>
        <instancedBufferAttribute attach="instanceMatrix" args={[coolArrays.matrices, 16]} />
        <instancedBufferAttribute attach="instanceColor" args={[coolArrays.colors, 3]} />
      </instancedMesh>
    </group>
  );
}

