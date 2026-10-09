"use client";

import type { ThreeEvent } from "@react-three/fiber";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef, type ReactNode } from "react";
import { BoxGeometry, EdgesGeometry, type Group, type LineBasicMaterial, type MeshBasicMaterial } from "three";
import { getHQStore } from "@/store/useHQStore";
import { COLORS, floorY, SLAB_THICKNESS } from "../config";
import { intents } from "../input/intents";
import { roverRuntime } from "../rover/runtime";
import type { FloorLayout } from "../types";
import { GridLines } from "./primitives";

const SLAB_COLOR = "#07070f";
const SOLID = 1;
const GHOST = 0.03;

function onFloorClick(e: ThreeEvent<MouseEvent>) {
  // Ignore clicks that ended an orbit drag.
  if (e.delta > 6) return;
  e.stopPropagation();
  intents.emit({ type: "goto", point: { x: e.point.x, z: e.point.z } });
}

/**
 * One floor slab with accent edges and its content. Floors above the rover turn
 * into ghosts each frame so the follow camera, which sits higher than
 * FLOOR_GAP, can look down through them.
 */
export function FloorLevel({
  layout,
  near,
  interactive,
  children,
}: {
  layout: FloorLayout;
  near: boolean;
  interactive: boolean;
  children?: ReactNode;
}) {
  const y = floorY(layout.id);
  const { bounds, accent } = layout;
  const w = bounds.maxX - bounds.minX;
  const d = bounds.maxZ - bounds.minZ;
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cz = (bounds.minZ + bounds.maxZ) / 2;
  const fill = useRef<MeshBasicMaterial>(null);
  const edge = useRef<LineBasicMaterial>(null);
  const content = useRef<Group>(null);
  const edges = useMemo(() => new EdgesGeometry(new BoxGeometry(w, SLAB_THICKNESS, d)), [w, d]);

  useFrame(() => {
    const phase = getHQStore().getState().phase;
    const exterior = phase === "boot" || phase === "intro";
    const above = !exterior && y > roverRuntime.y + 0.5;
    if (fill.current) {
      fill.current.opacity = above ? GHOST : SOLID;
      fill.current.depthWrite = !above;
    }
    if (edge.current) edge.current.opacity = above ? 0.16 : 0.95;
    if (content.current) content.current.visible = !above;
  });

  return (
    <group position={[0, y, 0]} name={`floor-${layout.id}`}>
      <mesh position={[cx, -SLAB_THICKNESS / 2, cz]} onClick={interactive ? onFloorClick : undefined}>
        <boxGeometry args={[w, SLAB_THICKNESS, d]} />
        <meshBasicMaterial ref={fill} color={SLAB_COLOR} transparent opacity={SOLID} />
      </mesh>
      <lineSegments geometry={edges} position={[cx, -SLAB_THICKNESS / 2, cz]}>
        <lineBasicMaterial ref={edge} color={accent} transparent opacity={0.95} toneMapped={false} />
      </lineSegments>
      <group ref={content}>
        {near && <GridLines width={w} depth={d} step={2} color={COLORS.grid} opacity={0.28} position={[cx, 0.01, cz]} />}
        {children}
      </group>
    </group>
  );
}
