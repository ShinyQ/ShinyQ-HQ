"use client";

import { RoundedBox } from "@react-three/drei";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BufferGeometry,
  type CanvasTexture,
  DoubleSide,
  Float32BufferAttribute,
  Object3D,
  SRGBColorSpace,
  type Group,
  type InstancedMesh,
  type Mesh,
} from "three";
import { getHQStore } from "@/store/useHQStore";
import { COLORS } from "../config";
import { intents } from "../input/intents";
import type { GpuTier } from "../types";
import { faceFrame } from "./faces";
import { drawBlob, drawFace, FACE_H, FACE_W } from "./faceTexture";
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

function readMonoFont() {
  const value = getComputedStyle(document.documentElement).getPropertyValue("--font-jetbrains").trim();
  return value ? `${value}, monospace` : "monospace";
}

/** Procedural Screen Rover (appendix 03 section 1) driven by the shared runtime pose. */
export function Rover({ tier }: { tier: GpuTier }) {
  const root = useRef<Group>(null);
  const body = useRef<Group>(null);
  const wheels = useRef<InstancedMesh>(null);
  const tip = useRef<Mesh>(null);
  const flag = useRef<Group>(null);
  const target = useRef<Mesh>(null);
  const dust = useRef<InstancedMesh>(null);

  const screenTexture = useRef<CanvasTexture>(null);
  const [screenCanvas] = useState(() => makeCanvas(FACE_W, FACE_H));
  const [blobCanvas] = useState(() => {
    const canvas = makeCanvas(64, 64);
    const ctx = canvas.getContext("2d");
    if (ctx) drawBlob(ctx, 64);
    return canvas;
  });
  const pennant = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute([0, 0, 0, 0, -0.32, 0, 0.5, -0.16, 0], 3));
    return g;
  }, []);

  const local = useRef({
    lastKey: "",
    font: "monospace",
    nextBlink: 3,
    blinkUntil: 0,
    spin: 0,
    lastSpeed: 0,
    dust: Array.from({ length: DUST }, () => ({ life: 0, x: 0, y: 0, z: 0, vx: 0, vz: 0 })),
    nextDust: 0,
    dummy: new Object3D(),
  });

  useEffect(() => {
    const l = local.current;
    l.font = readMonoFont();
    // Redraw the face once the web font is ready.
    document.fonts?.ready.then(() => {
      l.lastKey = "";
    });
  }, []);

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.1);
    const t = state.clock.elapsedTime;
    const r = roverRuntime;
    const l = local.current;
    const reduced = getHQStore().getState().reducedMotion;
    if (!root.current || !body.current) return;

    root.current.position.set(r.x, r.y, r.z);
    root.current.rotation.y = r.heading;
    body.current.rotation.z = r.tilt;
    body.current.position.y = t < r.hopUntil && !reduced ? Math.sin(((r.hopUntil - t) / 0.35) * Math.PI) * 0.3 : 0;

    if (t > l.nextBlink) {
      l.blinkUntil = t + 0.15;
      l.nextBlink = t + 3 + Math.random() * 3;
    }
    const frame = faceFrame(r.face, t, { blinking: t < l.blinkUntil, status: r.status });
    const ctx = screenCanvas.getContext("2d");
    if (frame.key !== l.lastKey && ctx && screenTexture.current) {
      drawFace(ctx, frame, l.font);
      screenTexture.current.needsUpdate = true;
      l.lastKey = frame.key;
    }

    l.spin += (r.speed * dt) / WHEEL_R;
    if (wheels.current) {
      WHEELS.forEach(([x, z], i) => {
        l.dummy.position.set(x, WHEEL_R + 0.03, z);
        l.dummy.rotation.set(l.spin, 0, Math.PI / 2);
        l.dummy.updateMatrix();
        wheels.current!.setMatrixAt(i, l.dummy.matrix);
      });
      wheels.current.instanceMatrix.needsUpdate = true;
    }

    if (tip.current) tip.current.scale.setScalar(Math.sin(t * 5) > 0 ? 1 : 0.55);

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
      l.dust.forEach((p, i) => {
        if (p.life > 0) {
          p.life -= dt;
          p.x += p.vx * dt;
          p.z += p.vz * dt;
          p.y += dt * 0.6;
        }
        l.dummy.position.set(p.x, p.y, p.z);
        l.dummy.rotation.set(0, 0, 0);
        l.dummy.scale.setScalar(p.life > 0 ? 0.6 + (0.6 - p.life) : 0);
        l.dummy.updateMatrix();
        dust.current!.setMatrixAt(i, l.dummy.matrix);
      });
      dust.current.instanceMatrix.needsUpdate = true;
    }
  });

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    intents.emit({ type: "terminal" });
  };

  return (
    <>
      <group ref={root} name="rover" onClick={onClick}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]}>
          <circleGeometry args={[1, 24]} />
          <meshBasicMaterial transparent depthWrite={false}>
            <canvasTexture attach="map" args={[blobCanvas]} />
          </meshBasicMaterial>
        </mesh>
        <group ref={body}>
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
          <RoundedBox args={[1.2, 1.1, 0.9]} radius={0.16} smoothness={3} position={[0, 1.5, 0]}>
            <meshStandardMaterial color="#e5e7eb" roughness={0.5} />
          </RoundedBox>
          <mesh position={[0, 1.52, 0.452]}>
            <planeGeometry args={[0.9, 0.7]} />
            <meshBasicMaterial toneMapped={false}>
              <canvasTexture ref={screenTexture} attach="map" args={[screenCanvas]} colorSpace={SRGBColorSpace} />
            </meshBasicMaterial>
          </mesh>
          <mesh position={[0, 1.62, -0.455]}>
            <boxGeometry args={[0.8, 0.09, 0.02]} />
            <meshBasicMaterial color={COLORS.cyan} toneMapped={false} />
          </mesh>
          <mesh position={[0, 0.72, -0.505]}>
            <boxGeometry args={[0.9, 0.12, 0.02]} />
            <meshBasicMaterial color={COLORS.pink} toneMapped={false} />
          </mesh>
          <mesh position={[0.35, 2.35, -0.1]}>
            <cylinderGeometry args={[0.025, 0.025, 0.6, 6]} />
            <meshStandardMaterial color="#a1a1aa" />
          </mesh>
          <mesh ref={tip} position={[0.35, 2.68, -0.1]}>
            <sphereGeometry args={[0.08, 12, 12]} />
            <meshBasicMaterial color={COLORS.pink} toneMapped={false} />
          </mesh>
        </group>
      </group>
      <group ref={flag} visible={false}>
        <mesh position={[0, 0.4, 0]}>
          <cylinderGeometry args={[0.03, 0.03, 0.8, 6]} />
          <meshBasicMaterial color={COLORS.amber} toneMapped={false} />
        </mesh>
        <mesh geometry={pennant} position={[0.03, 0.8, 0]}>
          <meshBasicMaterial color={COLORS.amber} side={DoubleSide} toneMapped={false} />
        </mesh>
      </group>
      <mesh ref={target} rotation={[-Math.PI / 2, 0, 0]} visible={false}>
        <ringGeometry args={[0.5, 0.68, 32]} />
        <meshBasicMaterial color={COLORS.cyan} transparent opacity={0.85} toneMapped={false} />
      </mesh>
      <instancedMesh ref={dust} args={[undefined, undefined, DUST]} frustumCulled={false}>
        <boxGeometry args={[0.14, 0.14, 0.14]} />
        <meshBasicMaterial color="#a1a1aa" transparent opacity={0.45} depthWrite={false} />
      </instancedMesh>
    </>
  );
}
