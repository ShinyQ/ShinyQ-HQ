"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { BoxGeometry, EdgesGeometry, type Group, type LineBasicMaterial, type Mesh, type MeshBasicMaterial } from "three";
import { getHQStore } from "@/store/useHQStore";
import { ceilingOpacity } from "../camera/firstPerson";
import { floorY, SLAB_THICKNESS } from "../config";
import { roverRuntime } from "../rover/runtime";
import type { FloorLayout } from "../types";
import { GridFloor } from "../fx/GridFloor";
import { sceneProbes } from "../fx/probes";
import { ProximityGlow } from "../fx/ProximityGlow";
import { PadGlow } from "../fx/PadGlow";
import { registerFloorContent, registerFloorSlab } from "./floorRegistry";
import { floorContentVisible } from "./near";
import { floorReady } from "./ridePrep";
import { contentVisible, introGhost } from "./visibility";
import { useDispose } from "../fx/useDispose";

const SLAB_COLOR = "#07070f";
const SOLID = 1;
const GHOST = 0.03;

/**
 * One floor slab with accent edges and its content. Floors above the rover turn
 * into ghosts each frame so the follow camera, which sits higher than
 * FLOOR_GAP, can look down through them. In first person (round 5) the ghosts
 * fade out and hide, so no ceiling hangs over the rover's eyes. The slab takes no
 * clicks: the rover only drives to point-and-go targets (interact/InteractLayer.tsx).
 */
export function FloorLevel({ layout, near, children }: { layout: FloorLayout; near: boolean; children?: ReactNode }) {
  const y = floorY(layout.id);
  const { bounds, accent } = layout;
  const w = bounds.maxX - bounds.minX;
  const d = bounds.maxZ - bounds.minZ;
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cz = (bounds.minZ + bounds.maxZ) / 2;
  const fill = useRef<MeshBasicMaterial>(null);
  const edge = useRef<LineBasicMaterial>(null);
  const content = useRef<Group>(null);
  const slab = useRef<Group>(null);
  const slabFill = useRef<Mesh>(null);
  const center = useMemo<[number, number]>(() => [cx, cz], [cx, cz]);
  const edges = useMemo(() => new EdgesGeometry(new BoxGeometry(w, SLAB_THICKNESS, d)), [w, d]);
  useDispose(edges);

  useFrame(() => {
    const { phase, ride } = getHQStore().getState();
    const exterior = phase === "boot" || phase === "intro";
    // The exterior keeps every slab solid; the intro fly-in fades the slabs above the rover into ghosts (Round 9 M).
    const fade = exterior ? introGhost(roverRuntime.introFly) : 1;
    const above = fade > 0 && y > roverRuntime.y + 0.5;
    const ghost = above ? ceilingOpacity(roverRuntime.cameraBlend) : 1;
    if (slab.current) slab.current.visible = ghost > 0.01;
    sceneProbes.ghosts[layout.id] = above && fade >= 1 && ghost > 0.01;
    if (fill.current) {
      fill.current.opacity = above ? SOLID + (GHOST * ghost - SOLID) * fade : SOLID;
      fill.current.depthWrite = !above;
    }
    if (edge.current) edge.current.opacity = above ? 0.95 + (0.16 * ghost - 0.95) * fade : 0.95;
    // Ghosts above, hidden under the current slab unless the elevator runs, and a floor below that is
    // still compiling waits for the car to move (tower/near.ts, R5 P6). On top of that, a ride draws only
    // its target and the floors right under the car, and the exterior only L1 and L2 (tower/visibility.ts).
    if (content.current) {
      content.current.visible =
        floorContentVisible({ floorY: y, roverY: roverRuntime.y, exterior, ride, ready: floorReady(layout.id) }) &&
        contentVisible({ id: layout.id, floorY: y, roverY: roverRuntime.y, exterior, rideTo: ride?.to ?? null, introFly: roverRuntime.introFly });
    }
  });

  useEffect(() => {
    registerFloorContent(layout.id, content.current);
    registerFloorSlab(layout.id, slabFill.current);
    return () => {
      registerFloorContent(layout.id, null);
      registerFloorSlab(layout.id, null);
    };
  }, [layout.id]);

  return (
    <group position={[0, y, 0]} name={`floor-${layout.id}`}>
      <group ref={slab}>
        <mesh ref={slabFill} position={[cx, -SLAB_THICKNESS / 2, cz]}>
          <boxGeometry args={[w, SLAB_THICKNESS, d]} />
          <meshBasicMaterial ref={fill} color={SLAB_COLOR} transparent opacity={SOLID} />
        </mesh>
        <lineSegments geometry={edges} position={[cx, -SLAB_THICKNESS / 2, cz]}>
          <lineBasicMaterial ref={edge} color={accent} transparent opacity={0.95} toneMapped={false} />
        </lineSegments>
      </group>
      <group ref={content}>
        {near && <GridFloor width={w} depth={d} center={center} />}
        {near && layout.doors && <ProximityGlow doors={layout.doors} color={accent} floorY={y} />}
        {near && layout.pads && <PadGlow pads={layout.pads} floorY={y} />}
        {children}
      </group>
    </group>
  );
}
