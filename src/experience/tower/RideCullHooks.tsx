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

function rideRunning(): boolean {
  const { ride, phase } = getHQStore().getState();
  return ride !== null && phase !== "boot" && phase !== "intro";
}

/** Runs the ride cull (rideCull.ts) around every render of the scene while the elevator runs (not in boot or intro). */
export function RideCull() {
  const scene = useThree((s) => s.scene);
  useEffect(() => installRideCull(scene, rideRunning, floorsNow), [scene]);
  return null;
}
