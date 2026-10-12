"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { getHQStore, useHQStore } from "@/store/useHQStore";
import type { GpuTier } from "../types";
import { FLOOR_ROOT, getFloorContent } from "../tower/floorRegistry";
import { precompileFloor, precompileScene } from "./precompile";
import { warmingFloor, warmQueue } from "./warmState";

/** Tiers that mount the other floors hidden during boot (Task 11 Step 8 may narrow this to full after SP9 on phones). */
export const STAGED_WARM_TIERS: readonly GpuTier[] = ["full", "lite"];

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
/** Frames to wait for a warmed floor's main group (its Suspense content: fonts, textures). */
const MOUNT_FRAMES = 180;

/**
 * Shader warm-up (REPORT F5.6, SP9; owner request 4): compiles everything mounted right after the first
 * frame, then, only while the boot card is up (still camera), mounts each other floor hidden, compiles
 * and pins its programs, and unmounts it. The floor in flight finishes when the intro starts; nothing
 * new mounts after that. Never draws: the exterior shows only the Lobby's and L2's detail (tower/visibility.ts),
 * and a Career Road mounted for warming is hidden (floors/CareerArchive.tsx).
 */
export function ProgramWarmup({ tier }: { tier: GpuTier }) {
  const phase = useHQStore((s) => s.phase);
  const frames = useRef(0);

  useFrame(() => {
    if (frames.current > 2) return;
    frames.current += 1;
    if (frames.current === 3) void precompileScene();
  });

  useEffect(() => {
    if (phase !== "boot" || !STAGED_WARM_TIERS.includes(tier)) return;
    let cancelled = false;
    void (async () => {
      for (const id of warmQueue(getHQStore().getState().floor)) {
        if (cancelled || getHQStore().getState().phase !== "boot") break;
        warmingFloor.set(id);
        // Let React commit the floor (and its Suspense children) before compiling.
        for (let i = 0; i < 3 || (i < MOUNT_FRAMES && !getFloorContent(id)?.getObjectByName(FLOOR_ROOT[id])); i++) await nextFrame();
        if (cancelled || getHQStore().getState().phase !== "boot") break;
        await precompileFloor(id, { timeoutMs: 3000 });
      }
      warmingFloor.set(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [phase, tier]);

  return null;
}
