"use client";

import { useMemo } from "react";
import { gridPlanesGeometry, type GridRect } from "./geometry";
import { createGridFloorMaterial } from "./materials";
import { useDispose } from "./useDispose";

export const GRID_LINE = "#4f46e5";
export const GRID_BG = "#0a0a0f";

/**
 * Prototype floor: anti-aliased 1 u and 5 u grid with a radial fade around `fade` (no events). Every rect (a slab
 * and its wings) is a plane of one geometry, so the floor is one draw call faded as one floor.
 */
export function GridFloor({
  rects,
  fade,
  line = GRID_LINE,
  y = 0.01,
}: {
  rects: readonly GridRect[];
  fade: { center: [number, number]; radius: number };
  line?: string;
  y?: number;
}) {
  const material = useMemo(() => createGridFloorMaterial({ line, bg: GRID_BG, radius: fade.radius, center: fade.center }), [line, fade]);
  useDispose(material);
  const geometry = useMemo(() => gridPlanesGeometry(rects), [rects]);
  useDispose(geometry);
  return <mesh geometry={geometry} material={material} rotation={[-Math.PI / 2, 0, 0]} position={[0, y, 0]} raycast={() => null} />;
}
