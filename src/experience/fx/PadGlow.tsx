"use client";

import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { AdditiveBlending, CircleGeometry, Color, Float32BufferAttribute, Object3D, RingGeometry, type InstancedMesh } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { getHQStore, useHQStore } from "@/store/useHQStore";
import { DRAG_THRESHOLD, intents } from "../input/intents";
import { PAD, padRadius, pickerFor } from "../nav/pads";
import { roverRuntime } from "../rover/runtime";
import type { PadKind, PadTrigger } from "../types";
import { HoloIcon, type HoloIconInstance } from "./HoloIcon";
import { PAD_ICONS, PAD_TONE } from "./holoIcons";
import { neonColor } from "./materials";
import { proximityLevel } from "./proximity";

const KINDS: readonly PadKind[] = ["elevator", "teleport"];
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
 * Floor pads (elevator call pad, L2 year teleporters): one instanced additive disc for every pad on the
 * floor, brightening as the rover gets close, plus a floating neon icon per pad kind. Clicking or
 * tapping a pad on the current floor opens its picker without driving there.
 */
export function PadGlow({ pads, floorY, interactive }: { pads: PadTrigger[]; floorY: number; interactive: boolean }) {
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

  const icons = useMemo(() => {
    const out = {} as Record<PadKind, HoloIconInstance[]>;
    for (const kind of KINDS) out[kind] = pads.filter((p) => p.kind === kind).map((p) => ({ x: p.at.x, y: PAD.iconY, z: p.at.z, face: p.face }));
    return out;
  }, [pads]);

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    // A press that travelled past the drag threshold rotated the view; it is not a click or tap.
    const pointerType = "pointerType" in e.nativeEvent ? String((e.nativeEvent as PointerEvent).pointerType) : "mouse";
    if (e.delta > DRAG_THRESHOLD[pointerType as keyof typeof DRAG_THRESHOLD] || e.delta > DRAG_THRESHOLD.touch) return;
    const pad = e.instanceId === undefined ? undefined : pads[e.instanceId];
    if (!pad || getHQStore().getState().phase !== "explore") return;
    e.stopPropagation();
    // A click is manual input: it ends a mission leg or a drive first, like clicking the floor.
    intents.emit({ type: "cancel" });
    getHQStore().getState().openPicker(pickerFor(pad));
  };

  if (pads.length === 0) return null;
  return (
    <group name="floor-pads">
      <instancedMesh ref={mesh} args={[geometry, undefined, pads.length]} frustumCulled={false} {...(interactive ? { onClick } : { raycast: () => null })}>
        <meshBasicMaterial vertexColors transparent blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
      </instancedMesh>
      {KINDS.map((kind) =>
        icons[kind].length > 0 ? (
          <HoloIcon key={kind} strokes={PAD_ICONS[kind]} instances={icons[kind]} color={PAD_TONE[kind]} size={PAD.iconSize} tier={tier} reducedMotion={reducedMotion} />
        ) : null,
      )}
    </group>
  );
}
