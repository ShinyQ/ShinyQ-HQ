"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Group } from "three";
import type { FloorId } from "@/content/schema";
import { getHQStore } from "@/store/useHQStore";
import { COLORS, floorY, SHAFT, SHAFT_EAST_FACE, SLAB_THICKNESS } from "../config";
import type { FloorLayout } from "../types";
import { carY, doorsOpen } from "./elevator";
import { BoxEdges, GlassBox } from "./primitives";

const TOP = floorY("RF") + 8;
const HEIGHT = TOP + SLAB_THICKNESS;
const DOOR_W = 1.5;
const DOOR_H = 3.2;

function Car() {
  const ref = useRef<Group>(null);
  useFrame(() => {
    const s = getHQStore().getState();
    if (ref.current) ref.current.position.y = s.ride ? carY(s.ride, s.reducedMotion) : floorY(s.floor);
  });
  return (
    <group ref={ref} position={[SHAFT.x, 0, SHAFT.z]}>
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
          <Bridge layout={layouts[id]} />
        </group>
      ))}
    </group>
  );
}
