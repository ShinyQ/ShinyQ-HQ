"use client";

import { Billboard, Text } from "@react-three/drei";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef } from "react";
import {
  AdditiveBlending,
  BoxGeometry,
  EdgesGeometry,
  Object3D,
  Raycaster,
  Vector2,
  Vector3,
  type InstancedMesh,
  type LineBasicMaterial,
  type LineSegments,
  type Mesh,
  type MeshBasicMaterial,
} from "three";
import { getHQStore, useHQStore } from "@/store/useHQStore";
import { floorY } from "../config";
import { intents } from "../input/intents";
import { FONTS } from "../tower/primitives";
import type { FloorLayouts, GpuTier } from "../types";
import { canPoint, clickDecision, highlightOpacity, isDragClick, labelAnchor, pickVolume } from "./pick";
import type { Interactable, InteractData } from "./registry";
import { interactRuntime } from "./runtime";
import { useInteractables } from "./useInteractables";

const GLOW = "#67e8f9";
const NO_RAYCAST = () => null;

/** Outline of the pick volume, a destination ring where the rover will stop, and (full tier) a faint additive fill. */
function Highlight({ item, tier, reducedMotion }: { item: Interactable; tier: GpuTier; reducedMotion: boolean }) {
  const edges = useMemo(() => {
    const box = new BoxGeometry(1, 1, 1);
    const geometry = new EdgesGeometry(box);
    box.dispose();
    return geometry;
  }, []);
  useEffect(() => () => edges.dispose(), [edges]);
  const line = useRef<LineSegments>(null);
  const fill = useRef<Mesh>(null);
  const ring = useRef<Mesh>(null);
  const { center, size } = pickVolume(item);

  useFrame(({ clock }) => {
    const opacity = highlightOpacity(clock.elapsedTime, reducedMotion);
    interactRuntime.highlight = opacity;
    if (line.current) (line.current.material as LineBasicMaterial).opacity = opacity;
    if (ring.current) (ring.current.material as MeshBasicMaterial).opacity = opacity;
    if (fill.current) (fill.current.material as MeshBasicMaterial).opacity = opacity * 0.12;
  });

  return (
    <group name="interact-highlight">
      <lineSegments ref={line} geometry={edges} position={center} scale={size} raycast={NO_RAYCAST}>
        <lineBasicMaterial color={GLOW} transparent toneMapped={false} />
      </lineSegments>
      {tier === "full" && (
        <mesh ref={fill} position={center} scale={size} raycast={NO_RAYCAST}>
          <boxGeometry args={[1, 1, 1]} />
          <meshBasicMaterial color={GLOW} transparent blending={AdditiveBlending} depthWrite={false} toneMapped={false} />
        </mesh>
      )}
      <mesh ref={ring} position={[item.at.x, 0.05, item.at.z]} rotation={[-Math.PI / 2, 0, 0]} raycast={NO_RAYCAST}>
        <ringGeometry args={[0.8, 1.05, 40]} />
        <meshBasicMaterial color={GLOW} transparent depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** The target's name floating above it, always facing the camera (one troika draw call). */
function Label({ item }: { item: Interactable }) {
  return (
    <Billboard position={labelAnchor(item)}>
      <Text
        font={FONTS.sansBold}
        fontSize={0.6}
        maxWidth={9}
        textAlign="center"
        anchorX="center"
        anchorY="bottom"
        lineHeight={1.1}
        color="#f4f4f5"
        outlineWidth={0.05}
        outlineColor="#05050c"
        material-toneMapped={false}
      >
        {item.label}
      </Text>
    </Billboard>
  );
}

/**
 * Point-and-go (owner request): every target of the current floor is one instance of an invisible unit
 * box (one raycast, no draw call, no per-object listeners). Hover (mouse, pen) sets `store.hover`; a
 * click emits `interact`; on touch the first tap selects and a second tap on the same target goes.
 */
export function InteractLayer({ layouts, data, tier }: { layouts: FloorLayouts; data: InteractData; tier: GpuTier }) {
  const floor = useHQStore((s) => s.floor);
  const hover = useHQStore((s) => s.hover);
  const reducedMotion = useHQStore((s) => s.reducedMotion);
  const items = useInteractables(floor, layouts, data);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const mesh = useRef<InstancedMesh>(null);
  const lastDown = useRef("mouse");
  const y = floorY(floor);

  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const d = new Object3D();
    items.forEach((item, i) => {
      const v = pickVolume(item);
      d.position.set(...v.center);
      d.scale.set(...v.size);
      d.updateMatrix();
      m.setMatrixAt(i, d.matrix);
    });
    m.count = items.length;
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [items]);

  useEffect(() => {
    interactRuntime.items = items;
    interactRuntime.floorY = y;
  }, [items, y]);

  useEffect(() => {
    const v = new Vector3();
    interactRuntime.project = (p) => {
      v.set(p.x, p.y, p.z).project(camera);
      if (v.z > 1) return null;
      const x = ((v.x + 1) / 2) * size.width;
      const top = ((1 - v.y) / 2) * size.height;
      return x >= 0 && x <= size.width && top >= 0 && top <= size.height ? { x, y: top } : null;
    };
    const ray = new Raycaster();
    const ndc = new Vector2();
    interactRuntime.hitAt = (x, y) => {
      const m = mesh.current;
      if (!m) return null;
      ndc.set((x / size.width) * 2 - 1, 1 - (y / size.height) * 2);
      ray.setFromCamera(ndc, camera);
      const id = ray.intersectObject(m, false)[0]?.instanceId;
      return id === undefined ? null : (interactRuntime.items[id]?.id ?? null);
    };
    return () => {
      interactRuntime.project = null;
      interactRuntime.hitAt = null;
    };
  }, [camera, size]);

  // A new floor starts with nothing pointed at; a ride, a beam, a picker or an overlay clears the target.
  useEffect(() => {
    const store = getHQStore();
    store.getState().setHover(null);
    return store.subscribe((s) => {
      if (s.hover && !canPoint(s)) s.setHover(null);
    });
  }, [floor]);

  useEffect(() => {
    if (hover?.via !== "pointer") return;
    document.body.style.cursor = "pointer";
    return () => {
      document.body.style.cursor = "";
    };
  }, [hover]);

  const itemOf = (e: { instanceId?: number }) => (e.instanceId === undefined ? undefined : items[e.instanceId]);

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    lastDown.current = e.pointerType || "mouse";
  };
  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    if (e.pointerType === "touch") return;
    const item = itemOf(e);
    const s = getHQStore().getState();
    if (!item || !canPoint(s)) return;
    e.stopPropagation();
    s.setHover({ item, via: "pointer" });
  };
  const onPointerOut = () => {
    const s = getHQStore().getState();
    if (s.hover?.via === "pointer") s.setHover(null);
  };
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    const item = itemOf(e);
    const pointerType = lastDown.current;
    if (!item || isDragClick(e.delta, pointerType)) return;
    const s = getHQStore().getState();
    if (!canPoint(s)) return;
    e.stopPropagation();
    if (clickDecision(s.hover, item, pointerType) === "select") {
      s.setHover({ item, via: "tap" });
      return;
    }
    if (s.hover?.via === "tap") s.setHover(null);
    intents.emit({ type: "interact", item });
  };

  return (
    <group position={[0, y, 0]} name="interact">
      <instancedMesh
        key={`${floor}:${items.length}`}
        ref={mesh}
        args={[undefined, undefined, Math.max(1, items.length)]}
        visible={false}
        frustumCulled={false}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerOut={onPointerOut}
        onClick={onClick}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial />
      </instancedMesh>
      {hover && hover.item.floor === floor && (
        <>
          <Highlight item={hover.item} tier={tier} reducedMotion={reducedMotion} />
          {/* Text loads its font asynchronously; keep it from holding back the outline. */}
          <Suspense fallback={null}>
            <Label item={hover.item} />
          </Suspense>
        </>
      )}
    </group>
  );
}
