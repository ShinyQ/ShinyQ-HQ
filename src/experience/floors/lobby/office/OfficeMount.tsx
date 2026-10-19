"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import { getHQStore, useHQStore } from "@/store/useHQStore";
import { afterFirstFrameIdle } from "../../../boot-signals";
import { COLORS, LOBBY } from "../../../config";
import { roverRuntime } from "../../../rover/runtime";
import type { GpuTier } from "../../../types";
import { speculativePrefetchOn } from "../../floorChunks";
import { MergedBoxes, MergedEdges } from "../../roof/kit";
import type { OfficeTranslate } from "../officeLayout";
import { officeShellBoxes } from "../officeShell";
import { loadOffice, officeChunkState, officeLoadWanted, useOfficeModule } from "./chunk";

/** One stable list, so MergedBoxes and MergedEdges build their geometry once. */
const SHELL = officeShellBoxes();

/**
 * L1 Agent Office mount (main path). Always draws the furniture shell (2 calls on the programs the observatory
 * already uses), which matches the navgrid obstacles, so the rover never bumps into an invisible desk before the
 * chunk loads or if it fails. Every 0.5 s after the first frame went idle it asks `officeLoadWanted` (on L1 or
 * riding there, near the office, `?prefetch=off` respected) and starts the chunk (an office drawer loads only its own
 * body chunk, `loadOfficeBody`). The live scene mounts once loaded and `ready` (the full tier's composer exists, like the
 * intro beacons), never in the middle of the intro (its first compile would hitch the orbit); a load during the
 * boot card mounts at once, so the reveal ring switches it on. Once mounted it stays.
 */
export function OfficeMount({ tier, t, ready }: { tier: GpuTier; t: OfficeTranslate; ready: boolean }) {
  const mod = useOfficeModule();
  const onL1 = useHQStore((s) => (s.ride?.to ?? s.floor) === "L1");
  const intro = useHQStore((s) => s.phase === "intro");
  const [mounted, setMounted] = useState(false);
  if (mod && onL1 && ready && !intro && !mounted) setMounted(true);
  const idle = useRef(false);
  const next = useRef(0);
  const prefetch = useRef<boolean | null>(null);
  useEffect(
    () =>
      afterFirstFrameIdle(() => {
        idle.current = true;
      }),
    [],
  );
  useFrame(({ clock }) => {
    if (clock.elapsedTime < next.current || officeChunkState() !== "idle") return;
    next.current = clock.elapsedTime + 0.5;
    prefetch.current ??= speculativePrefetchOn(window.location.search);
    const s = getHQStore().getState();
    const want = officeLoadWanted({
      idle: idle.current,
      state: officeChunkState(),
      prefetch: prefetch.current,
      floor: s.floor,
      rideTo: s.ride?.to ?? null,
      at: s.ride ? LOBBY.arrival : roverRuntime,
    });
    if (want) void loadOffice().catch(() => null);
  });
  const Scene = mounted ? mod?.OfficeScene : undefined;
  return (
    <group name="agent-office">
      <MergedBoxes boxes={SHELL} color="#0b1020" emissive={COLORS.cyan} emissiveIntensity={0.05} />
      <MergedEdges boxes={SHELL} color={COLORS.cyan} tier={tier} opacity={0.6} />
      {Scene && <Scene tier={tier} t={t} />}
    </group>
  );
}
