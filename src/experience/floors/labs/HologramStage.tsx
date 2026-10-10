"use client";

import { Text } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { BufferGeometry, Float32BufferAttribute, Object3D, type Group, type InstancedMesh, type LineSegments } from "three";
import type { Locale } from "@/content/schema";
import type { RoomArchitecture, RoomViews } from "@/content/room-views/types";
import { loadRoomViews } from "@/hud/drawer/data";
import { useHQStore, getHQStore } from "@/store/useHQStore";
import { cameraFocus } from "../../camera/focus";
import { hologramPose } from "../../camera/rigs";
import { COLORS, floorY } from "../../config";
import { neonColor } from "../../fx/materials";
import { FONTS, GlassBox } from "../../tower/primitives";
import { layBoard, type Laid } from "./board";
import { BOARD, type PlacedPod } from "./layout";

const KIND_COLOR: Record<RoomArchitecture["nodes"][number]["kind"], string> = {
  client: "#22d3ee",
  service: "#60a5fa",
  ai: "#a78bfa",
  data: "#34d399",
  human: "#fbbf24",
  external: "#e5e7eb",
};

const ASSEMBLE_S = 0.9;
const PACKET_SPEED = 2;
const L3_Y = floorY("L3");

function segments(edges: Laid["edges"]) {
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(edges.flatMap((e) => [e.from[0], e.from[1], 0.05, e.to[0], e.to[1], 0.05]), 3));
  return g;
}

/** The assembled architecture diagram on a hero pod's stage, plus the camera fly-in and world dim. */
/** Ease with a small overshoot (back easing), 0 to 1. */
function easeOutBack(x: number): number {
  const c = 1.70158;
  return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2);
}

function Diagram({ pod, arch, tier }: { pod: PlacedPod; arch: RoomArchitecture; tier: "full" | "lite" }) {
  const reduced = useHQStore((s) => s.reducedMotion);
  const laid = useMemo(() => layBoard(arch), [arch]);
  const sync = useMemo(() => segments(laid.edges.filter((e) => !e.async)), [laid]);
  const async = useMemo(() => segments(laid.edges.filter((e) => e.async)), [laid]);
  const nodeRefs = useRef<(Group | null)[]>([]);
  const packets = useRef<InstancedMesh>(null);
  const edgeGroup = useRef<Group>(null);
  const dummy = useMemo(() => new Object3D(), []);
  const start = useRef<number | null>(null);
  const rotation = pod.facing > 0 ? 0 : Math.PI;
  const packetColor = useMemo(() => neonColor("#ffffff", 2.5, tier === "full" ? "full" : "lite"), [tier]);
  useEffect(
    () => () => {
      sync.dispose();
      async.dispose();
    },
    [sync, async],
  );

  useEffect(() => {
    start.current = null;
    return () => {
      cameraFocus.pose = null;
    };
  }, [arch]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    start.current ??= t;
    const age = reduced ? Infinity : t - start.current;
    nodeRefs.current.forEach((g, i) => {
      if (!g) return;
      // Nodes pop in one by one (60 ms apart) with a slight overshoot over 180 ms.
      const p = Math.min(1, Math.max(0, (age - i * 0.06) / 0.18));
      g.scale.setScalar(Math.max(0.001, easeOutBack(p)));
      g.visible = p > 0;
    });
    if (edgeGroup.current) edgeGroup.current.visible = age > ASSEMBLE_S * 0.6;
    const m = packets.current;
    if (m) {
      laid.edges.forEach((e, i) => {
        const len = Math.hypot(e.to[0] - e.from[0], e.to[1] - e.from[1]) || 1;
        const f = reduced ? 0.5 : ((t * PACKET_SPEED + i * 0.37) % len) / len;
        dummy.position.set(e.from[0] + (e.to[0] - e.from[0]) * f, e.from[1] + (e.to[1] - e.from[1]) * f, 0.08);
        dummy.scale.setScalar(age > ASSEMBLE_S ? 1 : 0.001);
        dummy.updateMatrix();
        m.setMatrixAt(i, dummy.matrix);
      });
      m.instanceMatrix.needsUpdate = true;
    }
    const { width, height } = state.size;
    const s = getHQStore().getState();
    cameraFocus.pose = hologramPose(s.device.camera, [pod.center.x, L3_Y + BOARD.y, pod.center.z], { x: 0, z: pod.facing }, width / Math.max(1, height), laid.width, L3_Y);
  });

  const w = BOARD.nodeW * laid.scale;
  const h = BOARD.nodeH * laid.scale;
  return (
    <group position={[pod.center.x, 0, pod.center.z]} rotation={[0, rotation, 0]} name="hologram-board">
      {/* World dim: a dark veil just behind the board covers the rest of the floor (about 25% brightness). */}
      <mesh position={[0, 0, -1.2]} renderOrder={5}>
        <planeGeometry args={[400, 200]} />
        <meshBasicMaterial color={COLORS.void} transparent opacity={0.75} depthWrite={false} toneMapped={false} />
      </mesh>
      {laid.nodes.map((node, i) => (
        <group
          key={node.id}
          ref={(g) => {
            nodeRefs.current[i] = g;
          }}
          position={[node.x, node.y, 0]}
          renderOrder={6}
        >
          <GlassBox size={[w, h, 0.08]} color={KIND_COLOR[node.kind]} fillOpacity={tier === "full" ? 0.22 : 0.3} />
          {/* Labels load fonts asynchronously; the board and the fly-in must not wait for them. */}
          <Suspense fallback={null}>
            <Text font={FONTS.sansBold} fontSize={0.19 * laid.scale + 0.03} maxWidth={w - 0.15} textAlign="center" color="#e4e4e7" outlineWidth={0.012} outlineColor="#05050c" anchorX="center" anchorY="middle" position={[0, 0, 0.06]}>
              {node.label}
            </Text>
          </Suspense>
        </group>
      ))}
      <group ref={edgeGroup}>
        <lineSegments geometry={sync}>
          <lineBasicMaterial color={COLORS.packet} transparent opacity={0.9} toneMapped={false} />
        </lineSegments>
        <lineSegments geometry={async} onUpdate={(l: LineSegments) => l.computeLineDistances()}>
          <lineDashedMaterial color={COLORS.packet} dashSize={0.18} gapSize={0.14} transparent opacity={0.9} toneMapped={false} />
        </lineSegments>
      </group>
      {laid.edges.length > 0 && (
        <instancedMesh ref={packets} args={[undefined, undefined, laid.edges.length]} frustumCulled={false}>
          <sphereGeometry args={[0.085, 10, 8]} />
          <meshBasicMaterial color={packetColor} toneMapped={false} />
        </instancedMesh>
      )}
    </group>
  );
}

/** Mounts the diagram on the active hero pod while the hologram view is open. */
export function HologramStage({ placed, locale, tier }: { placed: PlacedPod[]; locale: Locale; tier: "full" | "lite" }) {
  const active = useHQStore((s) => (s.phase === "hologram" ? s.activeRoom : null));
  const [views, setViews] = useState<RoomViews | null>(null);
  useEffect(() => {
    if (!active || views) return;
    let live = true;
    loadRoomViews(locale).then(
      (v) => live && setViews(v),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [active, views, locale]);
  const pod = active ? placed.find((p) => p.room === active) : undefined;
  const arch = active && views ? views[active]?.architecture : undefined;
  if (!pod || !arch) return null;
  return <Diagram key={active} pod={pod} arch={arch} tier={tier} />;
}
