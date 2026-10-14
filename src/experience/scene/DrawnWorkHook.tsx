"use client";

import { useThree } from "@react-three/fiber";
import { useEffect } from "react";
import { installDrawnWork } from "./drawnWork";

/** Runs `whenDrawn` work that waited for a hidden object right before each render of the scene (drawnWork.ts). */
export function DrawnWork() {
  const scene = useThree((s) => s.scene);
  useEffect(() => installDrawnWork(scene), [scene]);
  return null;
}
