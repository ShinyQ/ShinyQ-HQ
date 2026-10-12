"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Group } from "three";
import { sceneProbes } from "./probes";
import { readableFlip } from "./readableFlip";

/**
 * Turns its children half a turn around `pivot` (floor-local x, z; default `position`) whenever the
 * camera is behind them, so text and signs never read mirrored (`readableFlip`). `position` is where
 * the children would sit without this wrapper (they keep their own rotation); `yaw` is the side they
 * face (0 faces +z) and only drives the side test. Seen from the front nothing moves, so the default
 * views keep their pixels.
 */
export function Readable({
  position,
  pivot,
  yaw = 0,
  children,
}: {
  position: [number, number, number];
  pivot?: readonly [number, number];
  yaw?: number;
  /** A function child re-renders on a flip, for direction marks such as arrows. */
  children: ReactNode | ((flipped: boolean) => ReactNode);
}) {
  const outer = useRef<Group>(null);
  const flipped = useRef(false);
  const [side, setSide] = useState(false);
  const live = typeof children === "function";
  useEffect(
    () => () => {
      if (flipped.current) sceneProbes.flippedSigns -= 1;
    },
    [],
  );
  const [px, pz] = pivot ?? [position[0], position[2]];

  useFrame(({ camera }) => {
    const g = outer.current;
    if (!g) return;
    const m = g.matrixWorld.elements;
    const next = readableFlip(flipped.current, yaw, { x: m[12], z: m[14] }, { x: camera.position.x, z: camera.position.z });
    if (next !== flipped.current) {
      flipped.current = next;
      sceneProbes.flippedSigns += next ? 1 : -1;
      g.rotation.y = next ? Math.PI : 0;
      if (live) setSide(next);
    }
  });

  return (
    <group ref={outer} position={[px, position[1], pz]}>
      <group position={[position[0] - px, 0, position[2] - pz]}>
        {typeof children === "function" ? children(side) : children}
      </group>
    </group>
  );
}
