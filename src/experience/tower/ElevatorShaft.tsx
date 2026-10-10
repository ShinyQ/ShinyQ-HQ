"use client";

import { Text } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef } from "react";
import { MeshBasicMaterial, type Group } from "three";
import type { FloorId } from "@/content/schema";
import { getHQStore, useHQStore } from "@/store/useHQStore";
import { COLORS, FLOOR_COLOR, floorY, SHAFT, SHAFT_EAST_FACE, SLAB_THICKNESS } from "../config";
import { rimGeometry } from "../fx/geometry";
import { neonColor } from "../fx/materials";
import type { FloorLayout } from "../types";
import { carY, doorsOpen } from "./elevator";
import { BoxEdges, FONTS, GlassBox } from "./primitives";

const TOP = floorY("RF") + 8;
const HEIGHT = TOP + SLAB_THICKNESS;
const DOOR_W = 1.5;
const DOOR_H = 3.2;

function setOpacity(m: MeshBasicMaterial, want: number, dt: number) {
  m.opacity += (want - m.opacity) * Math.min(1, dt * 6);
}

function Car() {
  const ref = useRef<Group>(null);
  const tier = useHQStore((st) => st.tier);
  const bands = useMemo(() => rimGeometry(SHAFT.size + 0.15, 0.05, SHAFT.size + 0.15, 0.06), []);
  const band = useMemo(() => new MeshBasicMaterial({ color: neonColor(COLORS.cyan, 2.2, tier), transparent: true, opacity: 0.3, toneMapped: false }), [tier]);
  useEffect(
    () => () => {
      bands.dispose();
      band.dispose();
    },
    [bands, band],
  );
  useFrame((_, dt) => {
    const s = getHQStore().getState();
    if (ref.current) ref.current.position.y = s.ride ? carY(s.ride, s.reducedMotion) : floorY(s.floor);
    // Light bands ride with the car and flare while it moves.
    setOpacity(band, s.ride ? 1 : 0.3, dt);
  });
  return (
    <group ref={ref} position={[SHAFT.x, 0, SHAFT.z]}>
      {[0.12, 3.7].map((y) => (
        <mesh key={y} geometry={bands} material={band} position={[0, y, 0]} raycast={() => null} />
      ))}
      <GlassBox size={[5.4, 0.25, 5.4]} position={[0, 0.06, 0]} color={COLORS.cyan} fillOpacity={0.25} />
      <BoxEdges size={[5.4, 3.6, 5.4]} position={[0, 1.8, 0]} color={COLORS.cyan} opacity={0.35} />
    </group>
  );
}

function Doors({ floor }: { floor: FloorId }) {
  const left = useRef<Group>(null);
  const right = useRef<Group>(null);
  useFrame(() => {
    const s = getHQStore().getState();
    const open = doorsOpen(s.ride, floor, s.reducedMotion);
    if (left.current) left.current.position.z = -DOOR_W / 2 - open * DOOR_W;
    if (right.current) right.current.position.z = DOOR_W / 2 + open * DOOR_W;
  });
  const panel = (
    <mesh>
      <boxGeometry args={[0.08, DOOR_H, DOOR_W]} />
      <meshBasicMaterial color={COLORS.cyan} transparent opacity={0.2} depthWrite={false} toneMapped={false} />
    </mesh>
  );
  return (
    <group position={[SHAFT_EAST_FACE, floorY(floor) + DOOR_H / 2, SHAFT.z]}>
      <group ref={left}>{panel}</group>
      <group ref={right}>{panel}</group>
    </group>
  );
}

/** Floor code above each landing door, lit on the current floor. */
function Indicator({ floor }: { floor: FloorId }) {
  const current = useHQStore((s) => s.floor === floor);
  return (
    <Text
      font={FONTS.monoBold}
      fontSize={0.55}
      letterSpacing={0.1}
      color={current ? FLOOR_COLOR[floor] : "#52525b"}
      anchorX="center"
      anchorY="bottom"
      position={[SHAFT_EAST_FACE + 0.06, floorY(floor) + DOOR_H + 0.35, SHAFT.z]}
      rotation={[0, Math.PI / 2, 0]}
      material-toneMapped={false}
    >
      {floor}
    </Text>
  );
}

function Bridge({ layout }: { layout: FloorLayout }) {
  const length = layout.door.x - SHAFT_EAST_FACE;
  if (length <= 0) return null;
  return (
    <mesh position={[SHAFT_EAST_FACE + length / 2, floorY(layout.id) - SLAB_THICKNESS / 2, layout.door.z]}>
      <boxGeometry args={[length, SLAB_THICKNESS, 4]} />
      <meshBasicMaterial color="#07070f" />
    </mesh>
  );
}

/** Glass shaft on the west side of the tower with the car, doors and door bridges. */
export function ElevatorShaft({ layouts, near }: { layouts: Record<FloorId, FloorLayout>; near: FloorId[] }) {
  return (
    <group name="elevator">
      <GlassBox size={[SHAFT.size, HEIGHT, SHAFT.size]} position={[SHAFT.x, HEIGHT / 2 - SLAB_THICKNESS, SHAFT.z]} color={COLORS.cyan} fillOpacity={0.035} edgeOpacity={0.85} />
      <Car />
      {near.map((id) => (
        <group key={id}>
          <Doors floor={id} />
          <Suspense fallback={null}>
            <Indicator floor={id} />
          </Suspense>
          <Bridge layout={layouts[id]} />
        </group>
      ))}
    </group>
  );
}
