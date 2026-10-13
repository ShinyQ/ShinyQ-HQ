"use client";

import { useThree } from "@react-three/fiber";
import { useEffect } from "react";
import { getHQStore } from "@/store/useHQStore";
import { FLOOR_IDS } from "../config";
import { getFloorContent, getFloorSlab } from "./floorRegistry";
import { installRideCull, type CullFloor } from "./rideCull";

function floorsNow(): CullFloor[] {
  return FLOOR_IDS.map((id) => ({ content: getFloorContent(id), slab: getFloorSlab(id) }));
}

/**
 * Off during boot and intro (the exterior shot). Otherwise on: a floor below the rover only draws during
 * a ride, plus the first frame after one (FloorLevel's visibility still holds the ride then), so outside
 * rides the cull finds nothing to test and costs a few checks per frame.
 */
function cullActive(): boolean {
  const { phase } = getHQStore().getState();
  return phase !== "boot" && phase !== "intro";
}

/** Runs the ride cull (rideCull.ts) around every render of the scene. */
export function RideCull() {
  const scene = useThree((s) => s.scene);
  useEffect(() => installRideCull(scene, cullActive, floorsNow), [scene]);
  return null;
}
