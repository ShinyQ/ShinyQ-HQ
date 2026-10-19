"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { MeshBasicMaterial, type Group, type LineBasicMaterial, type LineSegments, type Mesh } from "three";
import { getHQStore } from "@/store/useHQStore";
import { ceilingOpacity } from "../camera/firstPerson";
import { floorY, SLAB_THICKNESS } from "../config";
import { roverRuntime } from "../rover/runtime";
import type { FloorId } from "@/content/schema";
import { MAX_FRAME_DT } from "../rover/controller";
import { animationSpeed } from "../scene/animationSpeed";
import type { FloorLayout } from "../types";
import { slabBox, slabRects } from "../nav/slab";
import { GridFloor } from "../fx/GridFloor";
import { sceneProbes } from "../fx/probes";
import { ProximityGlow } from "../fx/ProximityGlow";
import { PadGlow } from "../fx/PadGlow";
import { registerFloorContent, registerFloorSlab } from "./floorRegistry";
import { floorContentVisible } from "./near";
import { ghostOutlineHidden, ghostOutlineOpacity, stepGhostOutline } from "./ghostOutline";
import { floorReady } from "./ridePrep";
import { slabOutline } from "./slabOutline";
import { contentVisible } from "./visibility";
import { useDispose } from "../fx/useDispose";

const SLAB_COLOR = "#07070f";
const SOLID = 1;
const GHOST = 0.03;

/** The slab fill (shared by every slab rect): solid and depth-writing, or a faint ghost above the rover. */
function ghostFill(fill: MeshBasicMaterial, above: boolean, ghost: number) {
  fill.opacity = above ? GHOST * ghost : SOLID;
  fill.depthWrite = !above;
}

/**
 * One floor slab (one box and one grid per slab rect: the bounds plus any wings) with accent edges and
 * its content. Floors above the rover turn into ghosts each frame so the follow camera, which sits
 * higher than FLOOR_GAP, can look down through them. In first person (round 5) the ghosts
 * fade out and hide, so no ceiling hangs over the rover's eyes. A ghost's outline also fades out while the rover is
 * in an area of its floor that looks under the slabs above (the L1 office wing: tower/ghostOutline.ts). The slab takes no
 * clicks: the rover only drives to point-and-go targets (interact/InteractLayer.tsx).
 */
export function FloorLevel({
  layout,
  layouts,
  near,
  children,
}: {
  layout: FloorLayout;
  /** Every floor's layout: the rover's floor marks where the floors above hide their ghost outline. */
  layouts?: Record<FloorId, FloorLayout>;
  near: boolean;
  children?: ReactNode;
}) {
  const y = floorY(layout.id);
  const { bounds, wings, accent } = layout;
  const edge = useRef<LineBasicMaterial>(null);
  const edgeLines = useRef<LineSegments>(null);
  const content = useRef<Group>(null);
  const slab = useRef<Group>(null);
  const slabFills = useRef<(Mesh | null)[]>([]);
  /** The ghost outline's hide amount (0 shown, 1 hidden), eased by `stepGhostOutline`. */
  const outline = useRef(0);
  // Every rect's box and grid, the grids faded as one floor around the slab's box.
  const rects = useMemo(
    () =>
      slabRects({ bounds, wings }).map((r) => ({
        w: r.maxX - r.minX,
        d: r.maxZ - r.minZ,
        center: [(r.minX + r.maxX) / 2, (r.minZ + r.maxZ) / 2] as [number, number],
      })),
    [bounds, wings],
  );
  const fade = useMemo(() => {
    const b = slabBox({ bounds, wings });
    return { center: [(b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2] as [number, number], radius: Math.hypot(b.maxX - b.minX, b.maxZ - b.minZ) / 2 };
  }, [bounds, wings]);
  const fill = useMemo(() => new MeshBasicMaterial({ color: SLAB_COLOR, transparent: true, opacity: SOLID }), []);
  useDispose(fill);
  const edges = useMemo(() => slabOutline({ bounds, wings }, SLAB_THICKNESS), [bounds, wings]);
  useDispose(edges);

  useFrame((_, rawDt) => {
    const { phase, ride, floor, reducedMotion } = getHQStore().getState();
    const exterior = phase === "boot" || phase === "intro";
    // Slabs above the rover are ghosts in every phase, the boot and the intro orbit included.
    const above = y > roverRuntime.y + 0.5;
    const ghost = above ? ceilingOpacity(roverRuntime.cameraBlend) : 1;
    if (slab.current) slab.current.visible = ghost > 0.01;
    sceneProbes.ghosts[layout.id] = above && ghost > 0.01;
    ghostFill(fill, above, ghost);
    const hidden = ghostOutlineHidden(layout.id, roverRuntime, layouts?.[floor]);
    outline.current = stepGhostOutline(outline.current, hidden, Math.min(rawDt, MAX_FRAME_DT) * animationSpeed(), reducedMotion);
    const shown = above ? ghostOutlineOpacity(outline.current) : 1;
    if (edge.current) edge.current.opacity = above ? 0.16 * ghost * shown : 0.95;
    // A hidden outline leaves the draw instead of drawing at opacity 0.
    if (edgeLines.current) edgeLines.current.visible = shown > 0.01;
    // Ghosts above, hidden under the current slab unless the elevator runs, and a floor below that is
    // still compiling waits for the car to move (tower/near.ts, R5 P6). On top of that, a ride draws only
    // its target and the floors right under the car, and the boot and intro only L1 (tower/visibility.ts).
    if (content.current) {
      content.current.visible =
        floorContentVisible({ floorY: y, roverY: roverRuntime.y, exterior, ride, ready: floorReady(layout.id) }) &&
        contentVisible({ id: layout.id, floorY: y, roverY: roverRuntime.y, exterior, rideTo: ride?.to ?? null });
    }
  });

  useEffect(() => {
    registerFloorContent(layout.id, content.current);
    registerFloorSlab(layout.id, slabFills.current.slice(0, rects.length).filter((m): m is Mesh => m !== null));
    return () => {
      registerFloorContent(layout.id, null);
      registerFloorSlab(layout.id, null);
    };
  }, [layout.id, rects]);

  return (
    <group position={[0, y, 0]} name={`floor-${layout.id}`}>
      <group ref={slab}>
        {rects.map((r, i) => (
          <mesh
            key={i}
            ref={(m) => {
              slabFills.current[i] = m;
            }}
            position={[r.center[0], -SLAB_THICKNESS / 2, r.center[1]]}
            material={fill}
          >
            <boxGeometry args={[r.w, SLAB_THICKNESS, r.d]} />
          </mesh>
        ))}
        <lineSegments ref={edgeLines} geometry={edges}>
          <lineBasicMaterial ref={edge} color={accent} transparent opacity={0.95} toneMapped={false} />
        </lineSegments>
      </group>
      <group ref={content}>
        {near && rects.map((r, i) => <GridFloor key={i} width={r.w} depth={r.d} center={r.center} fade={fade} />)}
        {near && layout.doors && <ProximityGlow doors={layout.doors} color={accent} floorY={y} />}
        {near && layout.pads && <PadGlow pads={layout.pads} floorY={y} />}
        {children}
      </group>
    </group>
  );
}
