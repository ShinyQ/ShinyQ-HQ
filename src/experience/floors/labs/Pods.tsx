"use client";

import { Billboard, Text } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, type RefObject } from "react";
import { Color, Matrix4, Object3D, Quaternion, Vector3, type Group, type InstancedMesh } from "three";
import type { Accent } from "@/content/schema";
import { getHQStore, useHQStore } from "@/store/useHQStore";
import { floorY } from "../../config";
import { createInstancedGlassMaterial, neonColor } from "../../fx/materials";
import { useShapes } from "../../fx/shapes";
import { useUniformTime } from "../../fx/useUniformTime";
import { roverRuntime } from "../../rover/runtime";
import { forgetDrawn, whenDrawn } from "../../scene/drawnWork";
import { FONTS, tierFill } from "../../tower/primitives";
import { hologramParts, type HologramPart } from "./hologramParts";
import { LABS, WING_TINT, type PlacedPod } from "./layout";
import { LineBatch } from "./lines";

export const ACCENT_HEX: Record<Accent, string> = {
  violet: "#a78bfa",
  pink: "#f472b6",
  green: "#34d399",
  amber: "#fbbf24",
  cyan: "#22d3ee",
  blue: "#60a5fa",
  white: "#e5e7eb",
};

const H = LABS.wallHeight;
const IDLE_SPIN = 0.4;
/** Hologram brightness of pods outside a Tech Reactor pick. */
const DIMMED = 0.3;


/** Pod rooms: glass walls (one instanced mesh), neon edges, door markers, forecourts and hero stages (one line batch). */
function PodShells({ placed }: { placed: PlacedPod[] }) {
  const fills = useRef<InstancedMesh>(null);
  const tier = useHQStore((s) => s.tier);
  const glass = useMemo(() => createInstancedGlassMaterial(tierFill(0.05, tier)), [tier]);
  const glassList = useMemo(() => [glass], [glass]);
  useUniformTime(glassList);
  useEffect(() => () => glass.dispose(), [glass]);
  const edgeBoost = useMemo(() => neonColor("#ffffff", 1.6, tier), [tier]);
  const edges = useMemo(() => {
    const batch = new LineBatch();
    for (const p of placed) {
      const color = ACCENT_HEX[p.pod.accent];
      batch.box(p.center.x, H / 2, p.center.z, p.width, H, p.depth, color);
      // Door opening on the front wall (the trigger pad is a ProximityGlow in FloorLevel).
      const frontZ = p.center.z + (p.facing * p.depth) / 2;
      batch.segment([p.door.x - 1, 0.04, frontZ, p.door.x + 1, 0.04, frontZ], "#f4f4f5");
      batch.segment([p.door.x - 1, 1.9, frontZ, p.door.x + 1, 1.9, frontZ], color);
      if (p.pod.tier === "hero") batch.circle(p.center.x, p.center.z, LABS.stageRadius, 0.04, color);
      // Forecourt outline in the wing tint, between the road edge and the pod front.
      const f = p.forecourt;
      batch.path(
        [
          [f.minX, f.minZ],
          [f.maxX, f.minZ],
          [f.maxX, f.maxZ],
          [f.minX, f.maxZ],
          [f.minX, f.minZ],
        ],
        0.05,
        WING_TINT[p.pod.wing],
      );
    }
    return batch.build();
  }, [placed]);

  useEffect(() => () => edges.dispose(), [edges]);

  useEffect(() => {
    const m = fills.current;
    if (!m) return;
    const color = new Color();
    const matrix = new Matrix4();
    placed.forEach((p, i) => {
      matrix.compose(new Vector3(p.center.x, H / 2, p.center.z), new Quaternion(), new Vector3(p.width, H, p.depth));
      m.setMatrixAt(i, matrix);
      m.setColorAt(i, color.set(ACCENT_HEX[p.pod.accent]));
    });
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
  }, [placed]);


  return (
    <group>
      <instancedMesh
        ref={fills}
        args={[undefined, undefined, placed.length]}
        material={glass}
        renderOrder={2}
      >
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
      <lineSegments geometry={edges}>
        <lineBasicMaterial color={edgeBoost} vertexColors transparent opacity={0.95} toneMapped={false} />
      </lineSegments>
    </group>
  );
}

/**
 * Every pod hologram on the floor as one instanced mesh of boxes, spinning slowly above its pod: the kind
 * hologram until the floor's shapes load (after its first frame), then each pod's own sculpture, growing in over
 * 0.6 s to a fifth above the kind's scale, so its detail reads from the follow camera (at once under reduced motion).
 */
function PodHolograms({ placed, shapes, group, tier }: { placed: PlacedPod[]; shapes: string; group: RefObject<Group | null>; tier: "full" | "lite" }) {
  const reduced = useHQStore((s) => s.reducedMotion);
  const mesh = useRef<InstancedMesh>(null);
  const own = useShapes<HologramPart[]>("L3", shapes, group);
  const parts = useMemo(
    () =>
      placed.flatMap((p, podIndex) => {
        const hero = p.pod.tier === "hero";
        return (own.items?.[p.pod.slug] ?? hologramParts(p.pod.hologram)).map((part) => ({ part, podIndex, scale: hero ? 1.5 : 1, lift: hero ? 1.6 : 1.3, color: ACCENT_HEX[p.pod.accent] }));
      }),
    [placed, own.items],
  );
  const dummy = useMemo(() => new Object3D(), []);
  const boost = tier === "full" ? 1.6 : 1;
  const local = useRef({ angles: placed.map((_, i) => i * 0.7), levels: placed.map(() => -1), color: new Color() });

  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const color = new Color();
    parts.forEach((p, i) => m.setColorAt(i, color.set(p.color).multiplyScalar(0.6 * boost * (p.part.k ?? 1))));
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    // New parts (the sculptures arrived): the next frame recolors every pod at its level.
    local.current.levels.fill(-1);
  }, [parts, boost]);

  const writeParts = (m: InstancedMesh, t: number, hidden: string | null) => {
    const l = local.current;
    const grow = own.items ? 1.2 * own.fadeIn.value : 1;
    parts.forEach(({ part, podIndex, scale: s0, lift }, i) => {
      const pod = placed[podIndex];
      const off = pod.room === hidden ? 0 : 1;
      const scale = s0 * grow + 1e-4;
      const angle = l.angles[podIndex];
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      const pulse = part.pulse !== undefined && !reduced ? 0.65 + 0.35 * Math.sin(t * 3 + part.pulse) : 1;
      dummy.position.set(pod.center.x + (part.x * c + part.z * s) * scale, lift + part.y * scale, pod.center.z + (-part.x * s + part.z * c) * scale);
      dummy.rotation.set(0, angle, part.r ?? 0);
      dummy.scale.set(part.w * scale * off + 1e-4, part.h * scale * pulse * off + 1e-4, part.d * scale * off + 1e-4);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  };

  useFrame((state, rawDt) => {
    const m = mesh.current;
    if (!m) return;
    const t = state.clock.elapsedTime;
    const dt = Math.min(rawDt, 0.1);
    const l = local.current;
    // Holograms near the rover wake up: brighter (0.6 to 1) and faster (0.4 to 0.9 rad/s).
    const onFloor = Math.abs(roverRuntime.y - floorY("L3")) < 0.5;
    // A Tech Reactor pick dims the holograms of pods outside it (`reactor.tech`).
    const picked = getHQStore().getState().reactor.tech?.pods;
    let recolor = false;
    placed.forEach((p, i) => {
      const d = onFloor ? Math.hypot(roverRuntime.x - p.center.x, roverRuntime.z - p.center.z) - Math.max(p.width, p.depth) / 2 : Infinity;
      const near = Math.min(1, Math.max(0, (6 - d) / 4.5));
      if (!reduced) l.angles[i] += dt * (IDLE_SPIN + 0.5 * near);
      const dim = picked && !picked.includes(p.pod.slug) ? DIMMED : 1;
      const level = Math.round((0.6 + 0.4 * near) * dim * 50) / 50;
      if (level !== l.levels[i]) {
        l.levels[i] = level;
        recolor = true;
      }
    });
    if (recolor) {
      parts.forEach((p, i) => m.setColorAt(i, l.color.set(p.color).multiplyScalar(l.levels[p.podIndex] * boost * (p.part.k ?? 1))));
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    // The pod whose hologram view is open shows the diagram instead.
    const hs = getHQStore().getState();
    const hidden = hs.phase === "hologram" ? hs.activeRoom : null;
    // The matrices only matter when the floor's content is drawn: skip them while FloorLevel hides it
    // (a neighbour floor), and catch up before the render that shows it again (scene/drawnWork.ts).
    whenDrawn(m, () => writeParts(m, t, hidden));
  });

  useEffect(() => {
    const m = mesh.current;
    return () => {
      if (m) forgetDrawn(m);
    };
    // The mesh is rebuilt when the part count changes (the sculptures arriving).
  }, [parts.length]);

  return (
    <instancedMesh key={parts.length} ref={mesh} args={[undefined, undefined, parts.length]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      {/* Instance colors carry each pod's accent; unlit and not tone mapped so bloom picks them up on the full tier. */}
      <meshBasicMaterial color="#ffffff" toneMapped={false} transparent opacity={tier === "full" ? 0.95 : 0.85} />
    </instancedMesh>
  );
}

/** Pod titles floating above each pod, always facing the camera (it turns to face each pod at its door; hidden in the hologram view). */
function PodLabels({ placed }: { placed: PlacedPod[] }) {
  const hologram = useHQStore((s) => s.phase === "hologram");
  return (
    <group visible={!hologram}>
      {placed.map((p) => {
        const hero = p.pod.tier === "hero";
        return (
          <Billboard key={p.room} position={[p.center.x, H + (hero ? 2.3 : 1.7), p.center.z]}>
            <Text
              font={FONTS.sansBold}
              fontSize={hero ? 0.62 : 0.46}
              maxWidth={hero ? 9 : 7}
              textAlign="center"
              lineHeight={1.15}
              color="#f4f4f5"
              outlineWidth={0.02}
              outlineColor="#05050c"
              anchorX="center"
              anchorY="bottom"
            >
              {p.pod.title}
            </Text>
          </Billboard>
        );
      })}
    </group>
  );
}

export function Pods({ placed, shapes, tier }: { placed: PlacedPod[]; shapes: string; tier: "full" | "lite" }) {
  const group = useRef<Group>(null);
  return (
    <group ref={group} name="labs-pods">
      <PodShells placed={placed} />
      <PodHolograms placed={placed} shapes={shapes} group={group} tier={tier} />
      <Suspense fallback={null}>
        <PodLabels placed={placed} />
      </Suspense>
    </group>
  );
}
