"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { AdditiveBlending, CircleGeometry, Color, Float32BufferAttribute, Object3D, RingGeometry, type InstancedMesh } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { useHQStore } from "@/store/useHQStore";
import { PAD, padRadius } from "../nav/pads";
import { roverRuntime } from "../rover/runtime";
import type { PadTrigger } from "../types";
import { HoloIcon } from "./HoloIcon";
import { PAD_ICONS, PAD_TONE } from "./holoIcons";
import { neonColor } from "./materials";
import { proximityLevel } from "./proximity";

const IDLE = 0.25;

/** Unit pad (radius 1, scaled per instance): a dim fill disc, a bright rim and an inner ring, with per-vertex brightness. */
function padGeometry() {
  const parts = [
    { g: new CircleGeometry(0.82, 48), k: 0.28 },
    { g: new RingGeometry(0.82, 1, 48), k: 1 },
    { g: new RingGeometry(0.42, 0.5, 48), k: 0.7 },
  ];
  for (const { g, k } of parts) g.setAttribute("color", new Float32BufferAttribute(new Array(g.getAttribute("position").count * 3).fill(k), 3));
  const merged = mergeGeometries(
    parts.map((p) => p.g),
    false,
  )!;
  for (const p of parts) p.g.dispose();
  merged.rotateX(-Math.PI / 2);
  return merged;
}

/**
 * Floor pads (elevator call pad, L2 year teleporters, Express Return pads): one instanced additive disc for every pad on the
 * floor, brightening as the rover gets close, plus a floating neon icon per pad kind. Clicks go through
 * point-and-go (interact/registry.ts): the rover drives onto the pad, then the picker opens (a Return
 * pad beams the rover to the elevator call pad instead).
 */
export function PadGlow({ pads, floorY }: { pads: PadTrigger[]; floorY: number }) {
  const mesh = useRef<InstancedMesh>(null);
  const tier = useHQStore((s) => s.tier);
  const reducedMotion = useHQStore((s) => s.reducedMotion);
  const geometry = useMemo(() => padGeometry(), []);
  const tones = useMemo(() => pads.map((p) => neonColor(PAD_TONE[p.kind], 1.6, tier)), [pads, tier]);
  const levels = useRef<number[]>([]);
  const tmp = useMemo(() => new Color(), []);
  useEffect(() => () => geometry.dispose(), [geometry]);

  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const d = new Object3D();
    pads.forEach((pad, i) => {
      const r = padRadius(pad);
      d.position.set(pad.at.x, 0.03, pad.at.z);
      d.scale.set(r, 1, r);
      d.updateMatrix();
      m.setMatrixAt(i, d.matrix);
      m.setColorAt(i, tmp.copy(tones[i]).multiplyScalar(IDLE));
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
    levels.current = pads.map(() => IDLE);
  }, [pads, tones, tmp]);

  useFrame((_, dt) => {
    const m = mesh.current;
    if (!m) return;
    const here = Math.abs(roverRuntime.y - floorY) < 0.5;
    let dirty = false;
    pads.forEach((pad, i) => {
      const want = here ? Math.max(IDLE, proximityLevel(Math.hypot(roverRuntime.x - pad.at.x, roverRuntime.z - pad.at.z))) : IDLE;
      const cur = levels.current[i] ?? IDLE;
      const next = cur + (want - cur) * Math.min(1, dt * 8);
      if (Math.abs(next - cur) > 1e-3) {
        levels.current[i] = next;
        m.setColorAt(i, tmp.copy(tones[i]).multiplyScalar(next));
        dirty = true;
      }
    });
    if (dirty && m.instanceColor) m.instanceColor.needsUpdate = true;
  });

  // Every pad icon on the floor in one batch, each in its kind's tone.
  const icons = useMemo(() => pads.map((p) => ({ x: p.at.x, y: PAD.iconY, z: p.at.z, face: p.face, strokes: PAD_ICONS[p.kind], color: PAD_TONE[p.kind] })), [pads]);

  if (pads.length === 0) return null;
  return (
    <group name="floor-pads">
      <instancedMesh ref={mesh} args={[geometry, undefined, pads.length]} frustumCulled={false} raycast={() => null}>
        <meshBasicMaterial vertexColors transparent blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
      </instancedMesh>
      <HoloIcon instances={icons} size={PAD.iconSize} tier={tier} reducedMotion={reducedMotion} />
    </group>
  );
}
