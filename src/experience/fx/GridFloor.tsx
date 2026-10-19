"use client";

import { useEffect, useMemo } from "react";
import { createGridFloorMaterial } from "./materials";

export const GRID_LINE = "#4f46e5";
export const GRID_BG = "#0a0a0f";

/**
 * Prototype floor: anti-aliased 1 u and 5 u grid with a radial fade (one draw call, no events). The fade
 * centers on the plane unless `fade` gives the whole slab's (one grid per slab rect, faded as one floor).
 */
export function GridFloor({
  width,
  depth,
  center,
  line = GRID_LINE,
  y = 0.01,
  fade,
}: {
  width: number;
  depth: number;
  center: [number, number];
  line?: string;
  y?: number;
  fade?: { center: [number, number]; radius: number };
}) {
  const radius = fade?.radius ?? Math.hypot(width, depth) / 2;
  const fadeCenter = fade?.center ?? center;
  const material = useMemo(() => createGridFloorMaterial({ line, bg: GRID_BG, radius, center: fadeCenter }), [line, radius, fadeCenter]);
  useEffect(() => () => material.dispose(), [material]);
  return (
    <mesh material={material} rotation={[-Math.PI / 2, 0, 0]} position={[center[0], y, center[1]]} raycast={() => null}>
      <planeGeometry args={[width, depth]} />
    </mesh>
  );
}
