"use client";

import { useFrame } from "@react-three/fiber";
import { useRef, type ReactNode } from "react";
import type { Group } from "three";
import { roverRuntime } from "../rover/runtime";
import type { Rect } from "../types";
import { introRuntime, revealDistance } from "./runtime";

/** Neon flicker after the ring reaches the rect: on for 0.06 s, off until 0.14 s, then on for good. */
const FLICKER_OFF = 0.06;
const FLICKER_ON = 0.14;

/**
 * Hides a Lobby landmark during the intro until the reveal ring (centered on the rover) reaches `rect`, then
 * switches it on with a quick neon flicker. Visibility is written per frame, never through React state. three's
 * `compile` prepares the programs of hidden objects too (it only gathers lights from visible ones), so the boot
 * precompile builds and pins the hidden landmarks' programs; their buffers and textures still upload on the
 * first frame they draw.
 */
export function IntroReveal({ rect, children }: { rect: Rect; children: ReactNode }) {
  const group = useRef<Group>(null);
  const crossed = useRef<number | null>(null);

  useFrame(() => {
    const g = group.current;
    if (!g) return;
    if (!introRuntime.active) {
      crossed.current = null;
      if (!g.visible) g.visible = true;
      return;
    }
    const reached = introRuntime.reveal >= revealDistance(roverRuntime, rect);
    if (reached && crossed.current === null) crossed.current = introRuntime.t;
    const dt = crossed.current === null ? 0 : introRuntime.t - crossed.current;
    const visible = reached && !(dt >= FLICKER_OFF && dt < FLICKER_ON);
    if (g.visible !== visible) g.visible = visible;
  });

  return <group ref={group}>{children}</group>;
}
