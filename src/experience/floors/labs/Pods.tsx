"use client";

import { Text } from "@react-three/drei";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef } from "react";
import { Color, Matrix4, Object3D, Quaternion, Vector3, type InstancedMesh } from "three";
import type { Accent } from "@/content/schema";
import { getHQStore, useHQStore } from "@/store/useHQStore";
import { intents } from "../../input/intents";
import { FONTS } from "../../tower/primitives";
import { hologramParts } from "./hologramParts";
import { LABS, type PlacedPod } from "./layout";
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
const LABEL_ROTATION: [number, number, number] = [0, Math.PI / 4, 0];
const IDLE_SPIN = 0.4;

function setCursor(value: string) {
  document.body.style.cursor = value;
}

/** Pod rooms: glass walls (one instanced mesh), neon edges, door markers and hero stages (one line batch). */
function PodShells({ placed }: { placed: PlacedPod[] }) {
  const fills = useRef<InstancedMesh>(null);
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

  // Clicking a pod drives the rover to its door, where the trigger opens the drawer.
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 6 || e.instanceId === undefined) return;
    e.stopPropagation();
    const p = placed[e.instanceId];
    if (p) intents.emit({ type: "goto", point: p.door });
  };

  return (
    <group>
      <instancedMesh
        ref={fills}
        args={[undefined, undefined, placed.length]}
        onClick={onClick}
        onPointerOver={() => setCursor("pointer")}
        onPointerOut={() => setCursor("")}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial transparent opacity={0.07} depthWrite={false} toneMapped={false} />
      </instancedMesh>
      <lineSegments geometry={edges}>
        <lineBasicMaterial vertexColors transparent opacity={0.95} toneMapped={false} />
      </lineSegments>
    </group>
  );
}

/** Every pod hologram on the floor as one instanced mesh of boxes, spinning slowly above its pod. */
function PodHolograms({ placed, tier }: { placed: PlacedPod[]; tier: "full" | "lite" }) {
  const reduced = useHQStore((s) => s.reducedMotion);
  const mesh = useRef<InstancedMesh>(null);
  const parts = useMemo(
    () =>
      placed.flatMap((p, podIndex) => {
        const hero = p.pod.tier === "hero";
        const scale = hero ? 1.5 : 1;
        const lift = hero ? 1.6 : 1.3;
        return hologramParts(p.pod.hologram).map((part) => ({ part, podIndex, scale, lift, color: ACCENT_HEX[p.pod.accent] }));
      }),
    [placed],
  );
  const dummy = useMemo(() => new Object3D(), []);

  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const color = new Color();
    parts.forEach((p, i) => m.setColorAt(i, color.set(p.color)));
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [parts]);

  useFrame((state) => {
    const m = mesh.current;
    if (!m) return;
    const t = state.clock.elapsedTime;
    const spin = reduced ? 0 : t * IDLE_SPIN;
    // The pod whose hologram view is open shows the diagram instead.
    const hs = getHQStore().getState();
    const hidden = hs.phase === "hologram" ? hs.activeRoom : null;
    parts.forEach(({ part, podIndex, scale, lift }, i) => {
      const pod = placed[podIndex];
      const off = pod.room === hidden ? 0 : 1;
      const angle = spin + podIndex * 0.7;
      const c = Math.cos(angle);
      const s = Math.sin(angle);
      const pulse = part.pulse !== undefined && !reduced ? 0.65 + 0.35 * Math.sin(t * 3 + part.pulse) : 1;
      dummy.position.set(pod.center.x + (part.x * c + part.z * s) * scale, lift + part.y * scale, pod.center.z + (-part.x * s + part.z * c) * scale);
      dummy.rotation.set(0, angle, 0);
      dummy.scale.set(part.w * scale * off + 1e-4, part.h * scale * pulse * off + 1e-4, part.d * scale * off + 1e-4);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, parts.length]} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      {/* Instance colors carry each pod's accent; unlit and not tone mapped so bloom picks them up on the full tier. */}
      <meshBasicMaterial color="#ffffff" toneMapped={false} transparent opacity={tier === "full" ? 0.95 : 0.85} />
    </instancedMesh>
  );
}

/** Pod titles floating above each pod, turned toward the follow camera (hidden in the hologram view). */
function PodLabels({ placed }: { placed: PlacedPod[] }) {
  const hologram = useHQStore((s) => s.phase === "hologram");
  return (
    <group visible={!hologram}>
      {placed.map((p) => {
        const hero = p.pod.tier === "hero";
        return (
          <Text
            key={p.room}
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
            position={[p.center.x, H + (hero ? 2.3 : 1.7), p.center.z]}
            rotation={LABEL_ROTATION}
          >
            {p.pod.title}
          </Text>
        );
      })}
    </group>
  );
}

export function Pods({ placed, tier }: { placed: PlacedPod[]; tier: "full" | "lite" }) {
  return (
    <group name="labs-pods">
      <PodShells placed={placed} />
      <PodHolograms placed={placed} tier={tier} />
      <Suspense fallback={null}>
        <PodLabels placed={placed} />
      </Suspense>
    </group>
  );
}
