"use client";

import { RoundedBox } from "@react-three/drei";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  AdditiveBlending,
  CanvasTexture as GlowTexture,
  type CanvasTexture,
  type Material,
  Object3D,
  SRGBColorSpace,
  type Group,
  type InstancedMesh,
  type Mesh,
  type MeshBasicMaterial,
} from "three";
import { audio } from "@/lib/audio";
import { getHQStore } from "@/store/useHQStore";
import { roverOpacity } from "../camera/firstPerson";
import { COLORS, ROVER } from "../config";
import { boostFxConfig } from "../fx/boostConfig";
import { BoostFx } from "../fx/BoostFx";
import { neonColor } from "../fx/materials";
import { wakeFrameAt } from "../scene/framePacer";
import { intents } from "../input/intents";
import type { GpuTier } from "../types";
import { BOOST } from "./boost";
import { createBodyState, stepBody } from "./bodyDynamics";
import { activity, bumpActivity, watchActivity } from "./activity";
import { askFace } from "./askFace";
import { MAX_FRAME_DT } from "./controller";
import { faceFrame } from "./faces";
import { createIdleState, idleEligible, stepIdle } from "./idle";
import { drawBlob, drawFace, FACE_H, FACE_W } from "./faceTexture";
import { prepareFade, setFadeOpacity } from "./fade";
import { roverRuntime } from "./runtime";

const WHEEL_R = 0.2;
const WHEELS: [number, number][] = [-0.7, 0.7].flatMap((x) => [-0.38, 0, 0.38].map((z) => [x, z] as [number, number]));
const DUST = 18;

function makeCanvas(w: number, h: number) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

/** Prototype glow pad: a cyan radial gradient drawn once into a 128 px texture. */
function makeGlowTexture() {
  const canvas = makeCanvas(128, 128);
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, "rgba(103,232,249,.55)");
    g.addColorStop(1, "rgba(103,232,249,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  }
  const texture = new GlowTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

const GLOW_CYAN = "#67e8f9";

function readMonoFont() {
  const value = getComputedStyle(document.documentElement).getPropertyValue("--font-jetbrains").trim();
  return value ? `${value}, monospace` : "monospace";
}

/** Procedural Screen Rover (appendix 03 section 1) driven by the shared runtime pose. */
export function Rover({ tier }: { tier: GpuTier }) {
  const root = useRef<Group>(null);
  const body = useRef<Group>(null);
  const head = useRef<Group>(null);
  const wheels = useRef<InstancedMesh>(null);
  const tip = useRef<Mesh>(null);
  const flag = useRef<Group>(null);
  const target = useRef<Mesh>(null);
  const dust = useRef<InstancedMesh>(null);
  const glow = useRef<Mesh>(null);
  const ring = useRef<Mesh>(null);
  const fadeMaterials = useRef<Material[]>([]);
  const [glowTexture] = useState(makeGlowTexture);
  const neon = useMemo(
    () => ({
      face: neonColor("#ffffff", 1.6, tier),
      tip: neonColor(COLORS.pink, 3, tier),
      strip: neonColor(COLORS.cyan, 2.5, tier),
      belt: neonColor(COLORS.pink, 2, tier),
      thruster: neonColor(GLOW_CYAN, 2.5, tier),
    }),
    [tier],
  );

  const screenTexture = useRef<CanvasTexture>(null);
  const [screenCanvas] = useState(() => makeCanvas(FACE_W, FACE_H));
  const [blobCanvas] = useState(() => {
    const canvas = makeCanvas(64, 64);
    const ctx = canvas.getContext("2d");
    if (ctx) drawBlob(ctx, 64);
    return canvas;
  });

  const local = useRef({
    lastKey: "",
    font: "monospace",
    nextBlink: 3,
    blinkUntil: 0,
    spin: 0,
    wheelSpin: NaN,
    wheelScale: NaN,
    lastSpeed: 0,
    dust: Array.from({ length: DUST }, () => ({ life: 0, x: 0, y: 0, z: 0, vx: 0, vz: 0 })),
    dustAlive: true,
    nextDust: 0,
    dummy: new Object3D(),
    body: createBodyState(),
    idle: createIdleState(),
    idleYaw: 0,
    idleSpin: 0,
  });


  useEffect(() => {
    const l = local.current;
    l.font = readMonoFont();
    // Redraw the face once the web font is ready.
    document.fonts?.ready.then(() => {
      l.lastKey = "";
    });
  }, []);

  useEffect(() => {
    const stop = watchActivity(document);
    const bump = () => bumpActivity();
    const off = intents.on(bump);
    return () => {
      stop();
      off();
    };
  }, []);

  // Hashed alpha goes on before the first compile, so the first-person fade never recompiles a shader.
  useLayoutEffect(() => {
    if (body.current) fadeMaterials.current = prepareFade(body.current);
  }, [tier]);

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, MAX_FRAME_DT);
    const t = state.clock.elapsedTime;
    const r = roverRuntime;
    const l = local.current;
    const reduced = getHQStore().getState().reducedMotion;
    if (!root.current || !body.current) return;

    root.current.position.set(r.x, r.y, r.z);
    // The hologram view frames a pod's diagram; the rover would stand between it and the camera.
    root.current.visible = getHQStore().getState().phase !== "hologram";
    // First person (round 5): the body fades out as the camera glides into its eyes, then hides (fewer draw calls).
    const opacity = roverOpacity(r.cameraBlend);
    body.current.visible = opacity > 0.01;
    setFadeOpacity(fadeMaterials.current, opacity);
    root.current.rotation.y = r.heading;
    // Boost body dynamics: squat and dip (pitch), extra lean and a top-speed buzz; all 0 on normal driving.
    const fx = boostFxConfig(tier, reduced);
    const topSpeed = (getHQStore().getState().device.coarse ? ROVER.maxSpeedCoarse : ROVER.maxSpeedFine) * BOOST.multiplier;
    stepBody(l.body, { speed: r.speed, heading: r.heading, level: r.boost, dt, t, enabled: fx.body, buzz: fx.buzz, topSpeed });
    r.boostPitch = l.body.pitch.x;
    r.boostRoll = l.body.roll.x;
    body.current.rotation.x = l.body.pitch.x;

    const store = getHQStore().getState();
    const out = stepIdle(l.idle, {
      t,
      seq: activity.seq,
      reduced,
      delay: r.idleDelay,
      random: Math.random,
      eligible: idleEligible({
        phase: store.phase,
        missionRunning: store.mission?.status === "running",
        ride: store.ride !== null,
        beam: store.beam !== null,
        picker: store.picker !== null,
        driving: r.driving,
        speed: r.speed,
        cameraBlend: r.cameraBlend,
        askFace: askFace() !== null,
      }),
    });
    if (out.blink) l.blinkUntil = t + 0.15;
    if (out.hop) r.hopUntil = t + 0.35;
    if (out.beep) audio.play("beep");
    // Raw yaw and spin are drawn as is; at 0 they decay out, the spin first wrapped to the nearest turn
    // (the end of a spin jumps from 2 pi to 0, the same pose), so the rover never unwinds or snaps.
    const decay = Math.exp(-dt * 30);
    l.idleYaw = out.headYaw !== 0 ? out.headYaw : Math.abs(l.idleYaw) < 1e-3 ? 0 : l.idleYaw * decay;
    if (out.spin !== 0) l.idleSpin = out.spin;
    else {
      const wrapped = Math.atan2(Math.sin(l.idleSpin), Math.cos(l.idleSpin));
      l.idleSpin = Math.abs(wrapped) < 1e-3 ? 0 : wrapped * decay;
    }
    r.idle = out.action;
    r.idleYaw = l.idleYaw;
    r.idleSpin = l.idleSpin;
    if (head.current) head.current.rotation.y = l.idleYaw;
    body.current.rotation.y = l.idleSpin;

    body.current.rotation.z = r.tilt + l.body.roll.x + l.body.buzzRoll;
    const hop = t < r.hopUntil && !reduced ? Math.sin(((r.hopUntil - t) / 0.35) * Math.PI) * 0.3 : 0;
    body.current.position.y = hop + (reduced ? 0 : Math.sin(t * 2.2) * 0.04) + l.body.buzzY;

    // Prototype glow: the pad breathes, the ring brightens with speed.
    const breath = reduced ? 0 : Math.sin(t * 2.2);
    if (glow.current) (glow.current.material as MeshBasicMaterial).opacity = 0.75 + breath * 0.2;
    if (ring.current) {
      ring.current.scale.setScalar(1 + breath * 0.06);
      (ring.current.material as MeshBasicMaterial).opacity = 0.4 + 0.3 * Math.min(1, r.speed / 12);
    }


    if (t > l.nextBlink) {
      l.blinkUntil = t + 0.15;
      l.nextBlink = t + 3 + Math.random() * 3;
    }
    const frame = faceFrame(r.face, t, { blinking: t < l.blinkUntil || t < r.blinkUntil, status: r.status });
    const ctx = screenCanvas.getContext("2d");
    if (frame.key !== l.lastKey && ctx && screenTexture.current) {
      drawFace(ctx, frame, l.font);
      screenTexture.current.needsUpdate = true;
      l.lastKey = frame.key;
    }

    l.spin += (r.speed * dt) / WHEEL_R;
    // The wheels compose with the scale the dust leaves in the shared dummy (0 unless the 18th particle lives),
    // so they are rewritten when the spin or that scale changes.
    if (wheels.current && (l.spin !== l.wheelSpin || l.dummy.scale.x !== l.wheelScale)) {
      l.wheelSpin = l.spin;
      l.wheelScale = l.dummy.scale.x;
      WHEELS.forEach(([x, z], i) => {
        l.dummy.position.set(x, WHEEL_R + 0.03, z);
        l.dummy.rotation.set(l.spin, 0, Math.PI / 2);
        l.dummy.updateMatrix();
        wheels.current!.setMatrixAt(i, l.dummy.matrix);
      });
      wheels.current.instanceMatrix.needsUpdate = true;
    }

    if (tip.current) tip.current.scale.setScalar(Math.sin(t * 5) > 0 ? 1 : 0.55);
    // On-demand frames (scene/idle.ts): render when the antenna flips (every pi/5 s) or the eyes blink or open.
    wakeFrameAt(Math.min((Math.floor((t * 5) / Math.PI) + 1) * (Math.PI / 5), l.blinkUntil > t ? l.blinkUntil : l.nextBlink));

    if (flag.current) {
      const visible = t < r.flagUntil;
      flag.current.visible = visible;
      if (visible) {
        flag.current.position.set(r.flagAt.x + 0.9, r.y, r.flagAt.z + 0.9);
        const age = 1.4 - (r.flagUntil - t);
        flag.current.scale.setScalar(Math.min(1, age * 6));
      }
    }

    if (target.current) {
      target.current.visible = Boolean(r.target);
      if (r.target) {
        target.current.position.set(r.target.x, r.y + 0.04, r.target.z);
        target.current.scale.setScalar(reduced ? 1 : 1 + Math.sin(t * 6) * 0.12);
      }
    }

    // Dust kicks up while accelerating (no particles under reduced motion; fewer on lite).
    const accelerating = r.speed > 1.5 && r.speed - l.lastSpeed > 0.05;
    l.lastSpeed = r.speed;
    if (dust.current) {
      const interval = tier === "full" ? 0.03 : 0.08;
      if (!reduced && accelerating && t > l.nextDust) {
        l.nextDust = t + interval;
        const slot = l.dust.find((p) => p.life <= 0);
        if (slot) {
          const side = Math.random() > 0.5 ? 0.7 : -0.7;
          const s = Math.sin(r.heading);
          const c = Math.cos(r.heading);
          slot.life = 0.6;
          slot.x = r.x - s * 0.7 + c * side;
          slot.z = r.z - c * 0.7 - s * side;
          slot.y = r.y + 0.1;
          slot.vx = -s * 1.2 + (Math.random() - 0.5);
          slot.vz = -c * 1.2 + (Math.random() - 0.5);
        }
      }
      l.dust.forEach((p) => {
        if (p.life > 0) {
          p.life -= dt;
          p.x += p.vx * dt;
          p.z += p.vz * dt;
          p.y += dt * 0.6;
        }
      });
      // Written and drawn while a particle lives and on the frame after, all at scale 0 then (the shared dummy too);
      // otherwise the dust leaves the draw. It starts drawn, so its first render fixes the bounds three sorts it by
      // with every particle at the origin.
      const alive = l.dust.some((p) => p.life > 0);
      const draw = alive || l.dustAlive;
      l.dustAlive = alive;
      if (draw) {
        l.dust.forEach((p, i) => {
          l.dummy.position.set(p.x, p.y, p.z);
          l.dummy.rotation.set(0, 0, 0);
          l.dummy.scale.setScalar(p.life > 0 ? 0.6 + (0.6 - p.life) : 0);
          l.dummy.updateMatrix();
          dust.current!.setMatrixAt(i, l.dummy.matrix);
        });
        dust.current.instanceMatrix.needsUpdate = true;
      }
      dust.current.visible = draw;
    }
  });

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    // In first person the camera sits inside the rover: clicks go to the targets in front of it.
    if (roverRuntime.cameraBlend > 0.5) return;
    e.stopPropagation();
    intents.emit({ type: "terminal" });
  };
  // A click on the rover opens the Rover menu, so a target behind it must not light up. The over handler makes
  // the rover hover-tracked, which lets its stopPropagation clear the hover of objects behind it.
  const stopHover = (e: ThreeEvent<PointerEvent>) => {
    if (roverRuntime.cameraBlend > 0.5) return;
    e.stopPropagation();
  };

  return (
    <>
      <group ref={root} name="rover" onClick={onClick} onPointerOver={stopHover} onPointerMove={stopHover}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
          <circleGeometry args={[1, 24]} />
          <meshBasicMaterial transparent depthWrite={false}>
            <canvasTexture attach="map" args={[blobCanvas]} />
          </meshBasicMaterial>
        </mesh>
        <mesh ref={glow} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.035, 0]} raycast={() => null}>
          <planeGeometry args={[2.6, 2.6]} />
          <meshBasicMaterial map={glowTexture} transparent blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
        </mesh>
        <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]} raycast={() => null}>
          <ringGeometry args={[0.55, 0.82, 48]} />
          <meshBasicMaterial color={GLOW_CYAN} transparent opacity={0.55} blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
        </mesh>
        {tier === "full" && <pointLight color={GLOW_CYAN} intensity={8} distance={7} decay={2} position={[0, 0.6, 0]} />}
        <group ref={body}>
          <mesh position={[0, 0.12, 0]}>
            <cylinderGeometry args={[0.22, 0.12, 0.1, 24]} />
            <meshBasicMaterial color={neon.thruster} toneMapped={false} />
          </mesh>
          {[-0.7, 0.7].map((x) => (
            <RoundedBox key={x} args={[0.32, 0.45, 1.1]} radius={0.1} smoothness={2} position={[x, 0.25, 0]}>
              <meshStandardMaterial color="#27272a" roughness={0.9} />
            </RoundedBox>
          ))}
          <instancedMesh ref={wheels} args={[undefined, undefined, WHEELS.length]} frustumCulled={false}>
            <cylinderGeometry args={[WHEEL_R, WHEEL_R, 0.36, 12]} />
            <meshStandardMaterial color="#71717a" roughness={0.6} />
          </instancedMesh>
          <RoundedBox args={[1.3, 0.55, 1.0]} radius={0.12} smoothness={3} position={[0, 0.68, 0]}>
            <meshStandardMaterial color="#d4d4d8" roughness={0.55} />
          </RoundedBox>
          <group ref={head} position={[0, 1.5, 0]}>
            <RoundedBox args={[1.2, 1.1, 0.9]} radius={0.16} smoothness={3}>
              <meshStandardMaterial color="#e5e7eb" roughness={0.5} />
            </RoundedBox>
            <mesh position={[0, 0.02, 0.452]}>
              <planeGeometry args={[0.9, 0.7]} />
              <meshBasicMaterial color={neon.face} toneMapped={false}>
                <canvasTexture ref={screenTexture} attach="map" args={[screenCanvas]} colorSpace={SRGBColorSpace} />
              </meshBasicMaterial>
            </mesh>
            <mesh position={[0, 0.12, -0.455]}>
              <boxGeometry args={[0.8, 0.09, 0.02]} />
              <meshBasicMaterial color={neon.strip} toneMapped={false} />
            </mesh>
            <mesh position={[0.35, 0.85, -0.1]}>
              <cylinderGeometry args={[0.025, 0.025, 0.6, 6]} />
              <meshStandardMaterial color="#a1a1aa" />
            </mesh>
            <mesh ref={tip} position={[0.35, 1.18, -0.1]}>
              <sphereGeometry args={[0.08, 12, 12]} />
              <meshBasicMaterial color={neon.tip} toneMapped={false} />
            </mesh>
          </group>
          <mesh position={[0, 0.72, -0.505]}>
            <boxGeometry args={[0.9, 0.12, 0.02]} />
            <meshBasicMaterial color={neon.belt} toneMapped={false} />
          </mesh>
        </group>
      </group>
      <group ref={flag} visible={false}>
        <mesh position={[0, 0.4, 0]}>
          <cylinderGeometry args={[0.03, 0.03, 0.8, 6]} />
          <meshBasicMaterial color={COLORS.amber} toneMapped={false} />
        </mesh>
        {/* The pennant (0.32 on the pole, 0.5 long): a thin closed prism, so it shows from both sides with the pole's program.
            A DoubleSide variant was its own program, and the flag mounts hidden, so no precompile saw it: it compiled on the first drawn arrival. */}
        <mesh position={[0.2, 0.64, 0]} rotation={[Math.PI / 2, Math.PI / 2, 0]} scale={[1, 1, 1.8]}>
          <cylinderGeometry args={[0.185, 0.185, 0.02, 3]} />
          <meshBasicMaterial color={COLORS.amber} toneMapped={false} />
        </mesh>
      </group>
      <mesh ref={target} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[0.5, 0.68, 32]} />
        <meshBasicMaterial color={COLORS.cyan} transparent opacity={0.85} toneMapped={false} />
      </mesh>
      <BoostFx tier={tier} />
      <instancedMesh ref={dust} args={[undefined, undefined, DUST]} frustumCulled={false}>
        <boxGeometry args={[0.14, 0.14, 0.14]} />
        <meshBasicMaterial color="#a1a1aa" transparent opacity={0.45} depthWrite={false} />
      </instancedMesh>
    </>
  );
}
