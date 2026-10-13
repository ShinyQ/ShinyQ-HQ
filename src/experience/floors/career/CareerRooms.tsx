"use client";

import { Text } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from "react";
import { BoxGeometry, BufferGeometry, Color, CylinderGeometry, Float32BufferAttribute, type InstancedMesh, type Mesh, Object3D } from "three";
import { getHQStore, useHQStore } from "@/store/useHQStore";
import { COLORS } from "../../config";
import { BatchedLabels, type BatchedLabelsHandle } from "../../fx/BatchedLabels";
import { HoloIcon, type HoloIconInstance } from "../../fx/HoloIcon";
import { Readable } from "../../fx/Readable";
import { CAREER_ICONS, CAREER_TONE } from "../../fx/holoIcons";
import { sceneProbes } from "../../fx/probes";
import { readableFlip } from "../../fx/readableFlip";
import { useDispose } from "../../fx/useDispose";
import { roverRuntime } from "../../rover/runtime";
import { FONTS, tierFill } from "../../tower/primitives";
import type { CareerEntryView, CareerType, GpuTier } from "../../types";
import { roomLabelSet, type LabelSet } from "./labels";
import { labelFade, type CareerRoom } from "./layout";

const TYPES: readonly CareerType[] = ["job", "freelance", "education", "award", "milestone"];
/** Neon type icon height above the floor (award icons float above the placings count). */
const ICON_Y: Record<CareerType, number> = { job: 2.7, freelance: 2.7, education: 2.7, milestone: 2.7, award: 2.9 };
const ICON_SIZE = 2.6;
const FRAME_H = 2.2;

const dummy = new Object3D();

/**
 * Award rooms: the placings that year as "×10" on the plinth, under the trophy icon (the old ring of
 * cups read as a second, distorted trophy from the rail camera). One small label per award room.
 */
function Placings({ rooms, counts }: { rooms: CareerRoom[]; counts: Map<string, number> }) {
  return (
    <>
      {rooms.map((room) => {
        const n = counts.get(room.slug) ?? 0;
        if (n < 1) return null;
        return (
          <Readable key={room.id} position={[room.center.x, 0.6, room.center.z + 1.15]} pivot={[room.center.x, room.center.z]}>
            <Text
              font={FONTS.monoBold}
              fontSize={0.55}
              color={CAREER_TONE.award}
              outlineWidth={0.03}
              outlineColor={COLORS.void}
              anchorX="center"
              anchorY="bottom"
              rotation={[-0.55, 0, 0]}
              material-toneMapped={false}
            >
              {`\u00D7${n}`}
            </Text>
          </Readable>
        );
      })}
    </>
  );
}

/** Room floor pads tinted by type (clickable: drive to the door) and pedestals, both instanced. */
function Pads({ rooms, tier }: { rooms: CareerRoom[]; tier: GpuTier }) {
  const pads = useRef<InstancedMesh>(null);
  const pedestals = useRef<InstancedMesh>(null);
  const plane = useMemo(() => new BoxGeometry(1, 0.04, 1), []);
  const pedestal = useMemo(() => new CylinderGeometry(0.95, 1.05, 0.55, 6), []);
  useDispose(plane);
  useDispose(pedestal);

  useLayoutEffect(() => {
    const color = new Color();
    rooms.forEach((room, i) => {
      dummy.rotation.set(0, 0, 0);
      dummy.position.set(room.center.x, 0.03, room.center.z);
      dummy.scale.set(room.w, 1, room.d);
      dummy.updateMatrix();
      pads.current?.setMatrixAt(i, dummy.matrix);
      pads.current?.setColorAt(i, color.set(CAREER_TONE[room.type]));
      dummy.position.set(room.center.x, 0.28, room.center.z);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      pedestals.current?.setMatrixAt(i, dummy.matrix);
    });
    if (pads.current) {
      pads.current.instanceMatrix.needsUpdate = true;
      if (pads.current.instanceColor) pads.current.instanceColor.needsUpdate = true;
    }
    if (pedestals.current) pedestals.current.instanceMatrix.needsUpdate = true;
  }, [rooms]);


  return (
    <>
      <instancedMesh
        ref={pads}
        args={[plane, undefined, rooms.length]}
        frustumCulled={false}
      >
        <meshBasicMaterial transparent opacity={tierFill(0.12, tier)} depthWrite={false} toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={pedestals} args={[pedestal, undefined, rooms.length]} frustumCulled={false}>
        <meshStandardMaterial color="#0b0b18" roughness={0.8} metalness={0.2} />
      </instancedMesh>
    </>
  );
}

/** Neon room frames (floor outline with a doorway on the road side, top rim and corner posts), one draw call. */
function Frames({ rooms }: { rooms: CareerRoom[] }) {
  const geometry = useMemo(() => {
    const pts: number[] = [];
    const colors: number[] = [];
    const c = new Color();
    for (const r of rooms) {
      c.set(CAREER_TONE[r.type]);
      const seg = (ax: number, ay: number, az: number, bx: number, by: number, bz: number) => {
        pts.push(ax, ay, az, bx, by, bz);
        colors.push(c.r, c.g, c.b, c.r, c.g, c.b);
      };
      const x0 = r.center.x - r.w / 2;
      const x1 = r.center.x + r.w / 2;
      const zi = r.door.z;
      const zo = r.center.z + r.side * (r.d / 2);
      const gap = 1.4;
      for (const y of [0.06, FRAME_H]) {
        // The doorway stays open at floor level; the rim spans it like a lintel.
        if (y < 1) {
          seg(x0, y, zi, r.center.x - gap, y, zi);
          seg(r.center.x + gap, y, zi, x1, y, zi);
        } else seg(x0, y, zi, x1, y, zi);
        seg(x0, y, zi, x0, y, zo);
        seg(x1, y, zi, x1, y, zo);
        seg(x0, y, zo, x1, y, zo);
      }
      for (const [x, z] of [
        [x0, zi],
        [x1, zi],
        [x0, zo],
        [x1, zo],
      ])
        seg(x, 0.06, z, x, FRAME_H, z);
    }
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(pts, 3));
    g.setAttribute("color", new Float32BufferAttribute(colors, 3));
    return g;
  }, [rooms]);
  useDispose(geometry);
  return (
    <lineSegments geometry={geometry} raycast={() => null}>
      <lineBasicMaterial vertexColors transparent opacity={0.7} toneMapped={false} />
    </lineSegments>
  );
}

/** Pulsing ring under the open room. */
function ActiveRing({ rooms }: { rooms: CareerRoom[] }) {
  const active = useHQStore((s) => s.activeRoom);
  const ref = useRef<Mesh>(null);
  const room = rooms.find((r) => r.id === active);
  useFrame((state) => {
    if (ref.current) ref.current.scale.setScalar(getHQStore().getState().reducedMotion ? 1 : 1 + Math.sin(state.clock.elapsedTime * 3) * 0.05);
  });
  if (!room) return null;
  return (
    <mesh ref={ref} position={[room.center.x, 0.08, room.center.z]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[1.6, 1.85, 32]} />
      <meshBasicMaterial color={CAREER_TONE[room.type]} transparent opacity={0.9} toneMapped={false} />
    </mesh>
  );
}

type FadeText = Object3D & { fillOpacity?: number; outlineOpacity?: number };

/**
 * Applies the distance fade to labels at `xs` each frame (troika reads the opacities at render, no
 * re-layout). `base` scales a label's fill opacity (for faint floor text).
 */
export function useLabelFade(xs: readonly number[], base?: readonly number[]) {
  const labels = useRef<(FadeText | null)[]>([]);
  useFrame(() => {
    xs.forEach((x, i) => {
      const label = labels.current[i];
      if (!label) return;
      const k = labelFade(x - roverRuntime.x);
      label.visible = k > 0.01;
      label.fillOpacity = k * (base?.[i] ?? 1);
      label.outlineOpacity = k;
    });
  });
  return (i: number) => (el: Object3D | null) => {
    labels.current[i] = el as FadeText | null;
  };
}

/**
 * Per-frame upkeep for the members of a career `BatchedLabels`: the distance fade (the batch packs each
 * member's opacities every frame) and the camera-behind turn of `Readable` (round 5, the camera orbits
 * 360 degrees): a member turns half a turn around its pivot, with the same side test and hysteresis.
 */
export function useMemberFade(handle: RefObject<BatchedLabelsHandle | null>, set: LabelSet) {
  const flipped = useRef<boolean[]>([]);
  useEffect(
    () => () => {
      sceneProbes.flippedSigns -= flipped.current.filter(Boolean).length;
      flipped.current = [];
    },
    [set],
  );
  useFrame(({ camera }) => {
    const members = handle.current?.members;
    if (!members || members.length !== set.labels.length) return;
    set.labels.forEach((label, i) => {
      const member = members[i];
      const k = labelFade(set.xs[i] - roverRuntime.x);
      const opacity = k > 0.01 ? k : 0;
      member.fillOpacity = opacity;
      member.outlineOpacity = opacity;
      const [px, pz] = set.pivots[i];
      const was = flipped.current[i] ?? false;
      const next = readableFlip(was, label.yaw ?? 0, { x: px, z: pz }, { x: camera.position.x, z: camera.position.z });
      if (next === was) return;
      flipped.current[i] = next;
      sceneProbes.flippedSigns += next ? 1 : -1;
      const [x, y, z] = label.position;
      member.position.set(next ? 2 * px - x : x, y, next ? 2 * pz - z : z);
      member.rotation.set(label.tilt ? -label.tilt : 0, (label.yaw ?? 0) + (next ? Math.PI : 0), 0, "YXZ");
      const text = next ? (set.flippedText?.[i] ?? label.text) : label.text;
      if (member.text !== text) member.text = text;
    });
  });
}

/**
 * Career rooms docked on the year plazas: tinted pads, neon frames, pedestals, one Neon line type
 * icon per room (one draw call per type, two on the full tier), the placings count on award plinths and a
 * label per room that fades with distance along the road.
 */
export function CareerRooms({
  rooms,
  entries,
  trophies,
  tier,
  reducedMotion,
}: {
  rooms: CareerRoom[];
  entries: Map<string, CareerEntryView>;
  trophies: Map<string, number>;
  tier: GpuTier;
  reducedMotion: boolean;
}) {
  const icons = useMemo(() => {
    const out = {} as Record<CareerType, HoloIconInstance[]>;
    // Icons face the default rail camera (+z); HoloIcon turns them around when the camera is behind.
    for (const type of TYPES) out[type] = rooms.filter((r) => r.type === type).map((r) => ({ x: r.center.x, y: ICON_Y[type], z: r.center.z, face: 0 }));
    return out;
  }, [rooms]);
  const awards = useMemo(() => rooms.filter((r) => r.type === "award"), [rooms]);
  const roomLabels = useMemo(() => roomLabelSet(rooms, entries), [rooms, entries]);
  const labelBatch = useRef<BatchedLabelsHandle>(null);
  useMemberFade(labelBatch, roomLabels);

  return (
    <group name="career-rooms">
      <Pads rooms={rooms} tier={tier} />
      <Frames rooms={rooms} />
      {TYPES.map((type) => (
        <HoloIcon key={type} strokes={CAREER_ICONS[type]} instances={icons[type]} color={CAREER_TONE[type]} size={ICON_SIZE} tier={tier} reducedMotion={reducedMotion} />
      ))}
      <Placings rooms={awards} counts={trophies} />
      <ActiveRing rooms={rooms} />
      <BatchedLabels ref={labelBatch} labels={roomLabels.labels} name="career-room-labels" toneMapped exactColors />
    </group>
  );
}
