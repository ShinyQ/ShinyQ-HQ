"use client";

import { Text } from "@react-three/drei";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  type InstancedMesh,
  type Mesh,
  Object3D,
  OctahedronGeometry,
  TorusGeometry,
} from "three";
import { getHQStore, useHQStore } from "@/store/useHQStore";
import { COLORS } from "../../config";
import { intents } from "../../input/intents";
import { roverRuntime } from "../../rover/runtime";
import { FONTS, tierFill } from "../../tower/primitives";
import type { CareerEntryView, CareerType } from "../../types";
import { labelVisible, type CareerRoomLayout } from "./layout";

export const TYPE_COLOR: Record<CareerType, string> = {
  job: COLORS.cyan,
  freelance: COLORS.pink,
  education: COLORS.violet,
  award: COLORS.amber,
  milestone: COLORS.green,
};

const HOLO_Y = 2.2;
const PILLAR_H = 3.4;
/** Room labels farther than this along the corridor are too small to read and skip drawing. */
const LABEL_RANGE = 30;
const MAX_TROPHIES = 8;
const SPIN: Partial<Record<CareerType, number>> = { job: 0.5, freelance: -0.7, education: 0.4 };

const dummy = new Object3D();

/** One wireframe hologram per room of a type, in a single instanced draw call. */
function Holograms({ type, rooms }: { type: CareerType; rooms: CareerRoomLayout[] }) {
  const ref = useRef<InstancedMesh>(null);
  const geometry = useMemo(() => {
    switch (type) {
      case "job":
        return new BoxGeometry(1.5, 1.5, 1.5);
      case "freelance":
        return new OctahedronGeometry(1.15);
      case "education":
        return new TorusGeometry(0.95, 0.22, 6, 18);
      default:
        // Milestone: a tall pillar of light.
        return new CylinderGeometry(0.4, 0.4, PILLAR_H, 6, 3, true);
    }
  }, [type]);

  const place = (mesh: InstancedMesh, angle: number, t: number) => {
    rooms.forEach((room, i) => {
      const bob = type === "milestone" ? 0 : Math.sin(t * 1.3 + i) * 0.12;
      dummy.position.set(room.center.x, type === "milestone" ? 0.55 + PILLAR_H / 2 : HOLO_Y + bob, room.center.z);
      dummy.rotation.set(type === "education" ? Math.PI / 2.4 : 0, angle + i, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  };

  useLayoutEffect(() => {
    if (ref.current) place(ref.current, 0, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rooms]);

  useFrame((state) => {
    const mesh = ref.current;
    const s = getHQStore().getState();
    if (!mesh || s.floor !== "L2" || !SPIN[type]) return;
    const speed = (SPIN[type] ?? 0) * (s.reducedMotion ? 0.3 : 1);
    place(mesh, state.clock.elapsedTime * speed, s.reducedMotion ? 0 : state.clock.elapsedTime);
  });

  if (rooms.length === 0) return null;
  return (
    <instancedMesh ref={ref} args={[geometry, undefined, rooms.length]} frustumCulled={false}>
      <meshBasicMaterial color={TYPE_COLOR[type]} wireframe transparent opacity={0.9} toneMapped={false} />
    </instancedMesh>
  );
}

/** Trophy cups on the award plinths: one per placing that year, in one draw call. */
function Trophies({ rooms, counts }: { rooms: CareerRoomLayout[]; counts: Map<string, number> }) {
  const ref = useRef<InstancedMesh>(null);
  const spots = useMemo(
    () =>
      rooms.flatMap((room) => {
        const n = Math.min(MAX_TROPHIES, counts.get(room.slug) ?? 0) || 1;
        return Array.from({ length: n }, (_, k) => {
          const a = (k / n) * Math.PI * 2;
          const r = n === 1 ? 0 : 0.62;
          return { x: room.center.x + Math.cos(a) * r, z: room.center.z + Math.sin(a) * r, h: 0.55 + (k % 3) * 0.12 };
        });
      }),
    [rooms, counts],
  );
  const geometry = useMemo(() => new CylinderGeometry(0.2, 0.08, 0.5, 8), []);

  const glints = useRef<InstancedMesh>(null);
  const place = (mesh: InstancedMesh, spin: number) => {
    spots.forEach((p, i) => {
      dummy.position.set(p.x, 0.55 + p.h, p.z);
      dummy.rotation.set(0, spin + i, 0);
      dummy.scale.set(1, p.h / 0.55, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  };
  // A light glint sweeps across each award plinth every few seconds.
  const sweep = (mesh: InstancedMesh, t: number) => {
    rooms.forEach((room, i) => {
      const phase = (t * 0.45 + i * 0.37) % 2.4;
      dummy.position.set(room.center.x - 1.1 + phase, 1.25, room.center.z);
      dummy.rotation.set(0, 0, 0.35);
      dummy.scale.setScalar(phase < 2.2 ? 1 : 0.001);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  };

  useLayoutEffect(() => {
    if (ref.current) place(ref.current, 0);
    if (glints.current) sweep(glints.current, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spots, rooms]);

  useFrame((state) => {
    const s = getHQStore().getState();
    if (s.floor !== "L2" || s.reducedMotion) return;
    const t = state.clock.elapsedTime;
    if (ref.current) place(ref.current, t * 0.3);
    if (glints.current) sweep(glints.current, t);
  });

  if (spots.length === 0) return null;
  return (
    <>
      <instancedMesh ref={ref} args={[geometry, undefined, spots.length]} frustumCulled={false}>
        <meshStandardMaterial color={COLORS.amber} emissive={COLORS.amber} emissiveIntensity={0.9} metalness={0.6} roughness={0.35} />
      </instancedMesh>
      <instancedMesh ref={glints} args={[undefined, undefined, rooms.length]} frustumCulled={false} raycast={() => null}>
        <planeGeometry args={[0.16, 1.5]} />
        <meshBasicMaterial color="#fff7d6" transparent opacity={0.35} blending={AdditiveBlending} depthWrite={false} side={DoubleSide} toneMapped={false} />
      </instancedMesh>
    </>
  );
}

/** Room floor pads (clickable: drive to the door) and pedestals, both instanced. */
function Pads({ rooms }: { rooms: CareerRoomLayout[] }) {
  const tier = useHQStore((st) => st.tier);
  const pads = useRef<InstancedMesh>(null);
  const pedestals = useRef<InstancedMesh>(null);
  const plane = useMemo(() => new BoxGeometry(1, 0.04, 1), []);
  const pedestal = useMemo(() => new CylinderGeometry(0.95, 1.05, 0.55, 6), []);

  useLayoutEffect(() => {
    rooms.forEach((room, i) => {
      dummy.rotation.set(0, 0, 0);
      dummy.position.set(room.center.x, 0.03, room.center.z);
      dummy.scale.set(room.w, 1, room.d);
      dummy.updateMatrix();
      pads.current?.setMatrixAt(i, dummy.matrix);
      dummy.position.set(room.center.x, 0.28, room.center.z);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      pedestals.current?.setMatrixAt(i, dummy.matrix);
    });
    if (pads.current) pads.current.instanceMatrix.needsUpdate = true;
    if (pedestals.current) pedestals.current.instanceMatrix.needsUpdate = true;
  }, [rooms]);

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 6 || e.instanceId === undefined) return;
    e.stopPropagation();
    const room = rooms[e.instanceId];
    if (room) intents.emit({ type: "goto", point: room.at });
  };

  return (
    <>
      <instancedMesh
        ref={pads}
        args={[plane, undefined, rooms.length]}
        onClick={onClick}
        onPointerOver={() => (document.body.style.cursor = "pointer")}
        onPointerOut={() => (document.body.style.cursor = "")}
        frustumCulled={false}
      >
        <meshBasicMaterial color={COLORS.amber} transparent opacity={tierFill(0.07, tier)} depthWrite={false} toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={pedestals} args={[pedestal, undefined, rooms.length]} frustumCulled={false}>
        <meshStandardMaterial color="#0b0b18" roughness={0.8} metalness={0.2} />
      </instancedMesh>
    </>
  );
}

/** Neon outlines of every room with a gap for the door, merged into one draw call. */
function Outlines({ rooms }: { rooms: CareerRoomLayout[] }) {
  const geometry = useMemo(() => {
    const pts: number[] = [];
    const y = 0.06;
    const seg = (ax: number, az: number, bx: number, bz: number) => pts.push(ax, y, az, bx, y, bz);
    for (const r of rooms) {
      const x0 = r.center.x - r.w / 2;
      const x1 = r.center.x + r.w / 2;
      const zi = r.door.z;
      const zo = r.center.z + r.side * (r.d / 2);
      const gap = 1.4;
      seg(x0, zi, r.center.x - gap, zi);
      seg(r.center.x + gap, zi, x1, zi);
      seg(x0, zi, x0, zo);
      seg(x1, zi, x1, zo);
      seg(x0, zo, x1, zo);
    }
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(pts, 3));
    return g;
  }, [rooms]);
  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color={COLORS.amber} transparent opacity={0.75} toneMapped={false} />
    </lineSegments>
  );
}

/** Pulsing ring under the open room. */
function ActiveRing({ rooms }: { rooms: CareerRoomLayout[] }) {
  const active = useHQStore((s) => s.activeRoom);
  const ref = useRef<Mesh>(null);
  const room = rooms.find((r) => r.id === active);
  useFrame((state) => {
    if (ref.current) ref.current.scale.setScalar(1 + Math.sin(state.clock.elapsedTime * 3) * 0.05);
  });
  if (!room) return null;
  return (
    <mesh ref={ref} position={[room.center.x, 0.08, room.center.z]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[1.6, 1.85, 32]} />
      <meshBasicMaterial color={TYPE_COLOR[room.type]} transparent opacity={0.9} toneMapped={false} />
    </mesh>
  );
}

/** Year rooms: pads, pedestals, per-type holograms, trophy cases and one label per room. */
export function CareerRooms({
  rooms,
  entries,
  trophies,
}: {
  rooms: CareerRoomLayout[];
  entries: Map<string, CareerEntryView>;
  trophies: Map<string, number>;
}) {
  const labels = useRef<(Object3D | null)[]>([]);
  useFrame(() => {
    rooms.forEach((room, i) => {
      const label = labels.current[i];
      if (label) label.visible = labelVisible(room, roverRuntime.z) && Math.abs(room.center.x - roverRuntime.x) < LABEL_RANGE;
    });
  });

  const byType = useMemo(() => {
    const out: Record<CareerType, CareerRoomLayout[]> = { job: [], freelance: [], education: [], award: [], milestone: [] };
    for (const room of rooms) out[room.type].push(room);
    return out;
  }, [rooms]);

  return (
    <group name="career-rooms">
      <Pads rooms={rooms} />
      <Outlines rooms={rooms} />
      <Holograms type="job" rooms={byType.job} />
      <Holograms type="freelance" rooms={byType.freelance} />
      <Holograms type="education" rooms={byType.education} />
      <Holograms type="milestone" rooms={byType.milestone} />
      <Trophies rooms={byType.award} counts={trophies} />
      <ActiveRing rooms={rooms} />
      {rooms.map((room, i) => {
        const entry = entries.get(room.slug);
        if (!entry) return null;
        // North rooms: a low upright sign at the door, below the hologram as the rail camera sees it. South rooms sit between the camera and the corridor: the label lies flat
        // just inside the back wall, nearer the camera than the pedestal, so cups and holograms never cover it.
        const north = room.side < 0;
        const back = Math.abs(room.center.z) + room.d / 2;
        const position: [number, number, number] = north ? [room.center.x, 0.3, room.door.z - 0.1] : [room.center.x, 0.08, back - 0.35];
        return (
          <Text
            key={room.id}
            ref={(el: Object3D | null) => {
              labels.current[i] = el;
            }}
            font={FONTS.sansBold}
            fontSize={north ? 0.38 : 0.36}
            lineHeight={1.25}
            maxWidth={room.w - 0.6}
            outlineWidth={0.02}
            outlineColor="#05050c"
            textAlign="center"
            color="#f4f4f5"
            anchorX="center"
            anchorY="bottom"
            position={position}
            rotation={north ? [-0.32, 0, 0] : [-Math.PI / 2, 0, 0]}
          >
            {`${entry.role}\n${entry.org} \u00B7 ${entry.period}`}
          </Text>
        );
      })}
    </group>
  );
}
