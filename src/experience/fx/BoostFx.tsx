"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  type InstancedMesh,
  type Mesh,
  MeshBasicMaterial,
  Object3D,
  ShaderMaterial,
  Vector3,
  type Group,
} from "three";
import { getHQStore } from "@/store/useHQStore";
import { ROVER } from "../config";
import { BOOST } from "../rover/boost";
import { MAX_FRAME_DT } from "../rover/controller";
import { roverRuntime } from "../rover/runtime";
import { sceneTarget } from "../scene/postHandle";
import { precompileObject } from "../scene/precompile";
import { renderProbe } from "../scene/renderProbe";
import type { GpuTier } from "../types";
import { boostFxConfig, fxActive } from "./boostConfig";
import { emptySample, rearCorners, TrailBuffer, trailIndices, trailVertexCount, writeTrail } from "./boostTrail";
import { SparkPool } from "./sparks";
import { STREAK_FS, STREAK_MAX, STREAK_VS, streakAttributes } from "./streaks";

const SPARK_HOT = new Color("#fff7d6");
const SPARK_COOL = new Color("#f59e0b");
const STREAK_COLOR = "#cffafe";

/**
 * Boost effects (owner pick, October 2026): twin light trails that follow the driven path, speed
 * streaks at the screen edges and wheel sparks. Three meshes, one draw call each, all invisible (no
 * draw call) unless the boost level is above `BOOST.trailMin` (sparks: while one is alive). Their
 * programs compile and pin once the scene has drawn (`precompileObject` from scene/precompile.ts, into the
 * scene pass target), while hidden, so the first boost never compiles a shader. Reduced motion and the tier gate everything through `boostFxConfig`.
 */
export function BoostFx({ tier }: { tier: GpuTier }) {
  const group = useRef<Group>(null);
  const trail = useRef<Mesh>(null);
  const streaks = useRef<Mesh>(null);
  const sparks = useRef<InstancedMesh>(null);
  const samples = boostFxConfig(tier, false).trail!.samples;
  const maxSparks = boostFxConfig(tier, false).sparks!.max;

  const trailGeometry = useMemo(() => {
    const vertices = trailVertexCount(samples);
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(new Float32Array(vertices * 3), 3).setUsage(DynamicDrawUsage));
    g.setAttribute("color", new BufferAttribute(new Float32Array(vertices * 4), 4).setUsage(DynamicDrawUsage));
    g.setIndex(new BufferAttribute(trailIndices(samples), 1));
    return g;
  }, [samples]);
  const trailMaterial = useMemo(
    () => new MeshBasicMaterial({ vertexColors: true, transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false, side: DoubleSide }),
    [],
  );
  const streakGeometry = useMemo(() => {
    const { corner, seed, indices } = streakAttributes(STREAK_MAX);
    const g = new BufferGeometry();
    g.setAttribute("position", new BufferAttribute(new Float32Array(STREAK_MAX * 4 * 3), 3));
    g.setAttribute("corner", new BufferAttribute(corner, 2));
    g.setAttribute("seed", new BufferAttribute(seed, 4));
    g.setIndex(new BufferAttribute(indices, 1));
    return g;
  }, []);
  const streakMaterial = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uLevel: { value: 0 }, uAspect: { value: 1 }, uOpacity: { value: 0 }, uColor: { value: new Color(STREAK_COLOR) } },
        vertexShader: STREAK_VS,
        fragmentShader: STREAK_FS,
        transparent: true,
        depthTest: false,
        depthWrite: false,
        blending: AdditiveBlending,
        toneMapped: false,
        side: DoubleSide,
      }),
    [],
  );
  const sparkGeometry = useMemo(() => new BoxGeometry(0.03, 0.03, 1), []);
  const sparkMaterial = useMemo(
    () => new MeshBasicMaterial({ color: "#ffffff", transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false }),
    [],
  );
  useEffect(() => () => trailGeometry.dispose(), [trailGeometry]);
  useEffect(() => () => trailMaterial.dispose(), [trailMaterial]);
  useEffect(() => () => streakGeometry.dispose(), [streakGeometry]);
  useEffect(() => () => streakMaterial.dispose(), [streakMaterial]);
  useEffect(() => () => sparkGeometry.dispose(), [sparkGeometry]);
  useEffect(() => () => sparkMaterial.dispose(), [sparkMaterial]);

  // instanceColor must exist before the warm compile, so the program has USE_INSTANCING_COLOR.
  useLayoutEffect(() => {
    const m = sparks.current;
    if (!m) return;
    for (let i = 0; i < maxSparks; i++) m.setColorAt(i, SPARK_COOL);
    m.instanceMatrix.setUsage(DynamicDrawUsage);
    m.instanceColor!.setUsage(DynamicDrawUsage);
    m.count = 0;
  }, [maxSparks]);

  const local = useRef({
    now: 0,
    streakClock: 0,
    lastHeading: roverRuntime.heading,
    emit: 0,
    side: 0,
    warm: false,
    buffer: new TrailBuffer(samples),
    head: emptySample(),
    pool: new SparkPool(maxSparks),
    dummy: new Object3D(),
    look: new Vector3(),
    color: new Color(),
  });

  // A new tier (or a remount) compiles again into the current scene pass target.
  useEffect(() => {
    local.current.warm = false;
  }, [tier]);

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, MAX_FRAME_DT);
    const l = local.current;
    const r = roverRuntime;
    const s = getHQStore().getState();
    const cfg = boostFxConfig(tier, s.reducedMotion);
    const trailMesh = trail.current;
    const streakMesh = streaks.current;
    const sparkMesh = sparks.current;
    if (!trailMesh || !streakMesh || !sparkMesh) return;
    if (l.buffer.capacity !== samples) l.buffer = new TrailBuffer(samples);
    if (l.pool.max !== maxSparks) l.pool = new SparkPool(maxSparks);
    l.now += dt;

    // Compile and pin the three programs once, after the scene has drawn into its final target (full: the
    // lazily loaded composer's input buffer). three's compile skips hidden objects, so the meshes are
    // visible only for the synchronous compile call (precompileObject compiles before its first await).
    if (!l.warm && renderProbe.rendered && (tier !== "full" || sceneTarget() !== null) && group.current) {
      l.warm = true;
      trailMesh.visible = streakMesh.visible = sparkMesh.visible = true;
      void precompileObject(state.gl, group.current, state.camera, state.scene);
      trailMesh.visible = streakMesh.visible = sparkMesh.visible = false;
    }

    const level = r.boost;
    const active = fxActive(level) && s.phase !== "hologram";
    const yawRate = dt > 0 ? Math.atan2(Math.sin(r.heading - l.lastHeading), Math.cos(r.heading - l.lastHeading)) / dt : 0;
    l.lastHeading = r.heading;

    // Trail: sample the rear wheels along the driven path (always, cheap), draw only while boosting.
    rearCorners(r.x, r.y, r.z, r.heading, l.now, l.head);
    if (cfg.trail) l.buffer.push(l.head, cfg.trail.spacing);
    let trailAlpha = 0;
    if (cfg.trail && active) {
      const position = trailMesh.geometry.getAttribute("position") as BufferAttribute;
      const color = trailMesh.geometry.getAttribute("color") as BufferAttribute;
      trailAlpha = writeTrail(l.buffer, l.head, state.camera.position, level, l.now, cfg.trail, position.array as Float32Array, color.array as Float32Array);
      position.needsUpdate = true;
      color.needsUpdate = true;
    }
    trailMesh.visible = trailAlpha > 0;
    r.trail = trailAlpha;

    // Streaks: rush faster with the rover's speed.
    const streaksOn = Boolean(cfg.streaks && active);
    streakMesh.visible = streaksOn;
    if (streaksOn && cfg.streaks) {
      l.streakClock += dt * (0.35 + r.speed / (ROVER.maxSpeedFine * BOOST.multiplier));
      const u = (streakMesh.material as ShaderMaterial).uniforms;
      u.uTime.value = l.streakClock;
      u.uLevel.value = level;
      u.uOpacity.value = cfg.streaks.opacity;
      u.uAspect.value = state.size.width / Math.max(1, state.size.height);
      streakMesh.geometry.setDrawRange(0, cfg.streaks.count * 6);
    }
    r.streaks = streaksOn && cfg.streaks ? level * cfg.streaks.opacity : 0;

    // Sparks: kicked back from the rear wheels while boosting, more on hard turns at speed.
    const pool = l.pool;
    if (!cfg.sparks) pool.clear();
    else {
      if (active && r.speed > 4) {
        const turn = Math.min(1, (Math.abs(yawRate) * r.speed) / (ROVER.turnRate * 12));
        l.emit += cfg.sparks.rate * level * (0.35 + turn) * dt;
        const fx0 = Math.sin(r.heading);
        const fz0 = Math.cos(r.heading);
        const outward = -Math.sign(yawRate) * turn * 2.5;
        let budget = cfg.sparks.max;
        while (l.emit >= 1 && budget-- > 0) {
          l.emit -= 1;
          l.side = 1 - l.side;
          const x = l.side ? l.head.lx : l.head.rx;
          const z = l.side ? l.head.lz : l.head.rz;
          const back = 1.5 + Math.random() * 2.5;
          const lateral = outward + (Math.random() - 0.5) * 2;
          // Thrown back and up; rover right is (cos h, -sin h).
          pool.emit(x, r.y + 0.05, z, -fx0 * back + fz0 * lateral, 1 + Math.random() * 2.5, -fz0 * back - fx0 * lateral, 0.22 + Math.random() * 0.22, r.y + 0.02);
        }
        if (l.emit > 1) l.emit = 0;
      } else l.emit = 0;
      pool.step(dt);
    }
    let drawn = 0;
    if (pool.alive > 0) {
      const { dummy, look, color } = l;
      for (let i = 0; i < pool.max; i++) {
        if (pool.life[i] <= 0) continue;
        const vx = pool.vx[i];
        const vy = pool.vy[i];
        const vz = pool.vz[i];
        dummy.position.set(pool.px[i], pool.py[i], pool.pz[i]);
        look.set(pool.px[i] + vx, pool.py[i] + vy, pool.pz[i] + vz);
        dummy.lookAt(look);
        const age = pool.life[i] / pool.maxLife[i];
        dummy.scale.set(1, 1, Math.min(0.35, Math.max(0.08, Math.hypot(vx, vy, vz) * 0.05)));
        dummy.updateMatrix();
        sparkMesh.setMatrixAt(drawn, dummy.matrix);
        color.copy(SPARK_COOL).lerp(SPARK_HOT, age).multiplyScalar(0.4 + age * 0.9);
        sparkMesh.setColorAt(drawn, color);
        drawn++;
      }
      sparkMesh.instanceMatrix.needsUpdate = true;
      if (sparkMesh.instanceColor) sparkMesh.instanceColor.needsUpdate = true;
    }
    sparkMesh.count = drawn;
    sparkMesh.visible = drawn > 0;
    r.sparks = drawn;
    r.boostFx = Number(trailMesh.visible) + Number(streakMesh.visible) + Number(sparkMesh.visible);
  });

  const none = () => null;
  return (
    <group ref={group} name="boost-fx">
      <mesh ref={trail} name="boost-trail" geometry={trailGeometry} material={trailMaterial} visible={false} frustumCulled={false} raycast={none} />
      <mesh ref={streaks} name="boost-streaks" geometry={streakGeometry} material={streakMaterial} visible={false} frustumCulled={false} renderOrder={10} raycast={none} />
      <instancedMesh
        ref={sparks}
        key={maxSparks}
        name="boost-sparks"
        args={[sparkGeometry, sparkMaterial, maxSparks]}
        visible={false}
        frustumCulled={false}
        raycast={none}
      />
    </group>
  );
}
