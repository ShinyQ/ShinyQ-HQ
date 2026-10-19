"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useRef, useState } from "react";
import type { Group, Material, Object3D } from "three";
import { getHQStore, useHQStore } from "@/store/useHQStore";
import { afterFirstFrameIdle } from "../../../boot-signals";
import { COLORS, LOBBY } from "../../../config";
import { sceneProbes } from "../../../fx/probes";
import { MAX_FRAME_DT } from "../../../rover/controller";
import { roverRuntime } from "../../../rover/runtime";
import { animationSpeed } from "../../../scene/animationSpeed";
import type { GpuTier } from "../../../types";
import { speculativePrefetchOn } from "../../floorChunks";
import { MergedBoxes, MergedEdges } from "../../roof/kit";
import type { OfficeTranslate } from "../officeLayout";
import { officeShellBoxes } from "../officeShell";
import { countOfficeAsk, loadOffice, officeChunkState, officeLoadWanted, useOfficeModule } from "./chunk";

/** One stable list, so MergedBoxes and MergedEdges build their geometry once. */
const SHELL = officeShellBoxes();

/** The live scene fades in over this long once it shows (s), so the Rovers and the wall never pop in. */
export const OFFICE_FADE_IN = 0.25;

/** A material's opacity the fade scales: the holo shader's `uOpacity` uniform, else a hashed-alpha material's opacity. */
interface FadeSlot {
  material: Material;
  uniform: { value: number } | undefined;
  base: number;
}

/**
 * Every material under the live scene the fade can scale without a new program: hashed-alpha materials (`alphaHash`
 * keeps them opaque, so opacity only changes a uniform) and holo shaders (`uOpacity`). Read once, when the scene shows.
 */
export function officeFadeSlots(root: Object3D): FadeSlot[] {
  const seen = new Set<Material>();
  const out: FadeSlot[] = [];
  root.traverse((o) => {
    const m = (o as { material?: Material }).material;
    if (!m || seen.has(m)) return;
    seen.add(m);
    const uniform = (m as { uniforms?: Record<string, { value: unknown }> }).uniforms?.uOpacity as { value: number } | undefined;
    if (uniform) out.push({ material: m, uniform, base: uniform.value });
    else if (m.alphaHash) out.push({ material: m, uniform: undefined, base: m.opacity });
  });
  return out;
}

/** Scales every slot to `k` (0 to 1) of its own opacity. */
export function setOfficeFade(slots: readonly FadeSlot[], k: number): void {
  for (const s of slots) {
    if (s.uniform) s.uniform.value = s.base * k;
    else s.material.opacity = s.base * k;
  }
}

/**
 * L1 Agent Office mount (main path). Always draws the furniture shell (2 calls on the programs the observatory
 * already uses), which matches the navgrid obstacles, so the rover never bumps into an invisible desk before the
 * chunk loads or if it fails. Every 0.5 s after the first frame went idle it asks `officeLoadWanted` (on L1 or
 * riding there, near the office or on a mission bound for it, `?prefetch=off` respected) and starts the chunk (every office drawer open starts it too,
 * beside its own body chunk, `loadOfficeBody`). The live scene mounts once loaded and `ready` (the full tier's composer exists, like the
 * intro beacons), never in the middle of the intro (its first compile would hitch the orbit); a load during the
 * boot card mounts at once, so the reveal ring switches it on. Once mounted it stays; it fades in over
 * `OFFICE_FADE_IN` the first time it shows (a cut under reduced motion), so the Rovers do not pop in beside the shell.
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
  const live = useRef<Group>(null);
  const fade = useRef<{ t: number; slots: FadeSlot[] | null }>({ t: 0, slots: null });
  useEffect(
    () =>
      afterFirstFrameIdle(() => {
        idle.current = true;
      }),
    [],
  );
  // The fade-in (frame deltas, a cut under reduced motion), from the frame the live scene shows (`OfficeReady`).
  useFrame((_, rawDt) => {
    const f = fade.current;
    const g = live.current;
    if (f.t >= OFFICE_FADE_IN || !g || !sceneProbes.office.loaded) return;
    f.slots ??= officeFadeSlots(g);
    f.t = getHQStore().getState().reducedMotion ? OFFICE_FADE_IN : f.t + Math.min(rawDt, MAX_FRAME_DT) * animationSpeed();
    setOfficeFade(f.slots, Math.min(1, f.t / OFFICE_FADE_IN));
  });
  useFrame(({ clock }) => {
    if (clock.elapsedTime < next.current || officeChunkState() !== "idle") return;
    next.current = clock.elapsedTime + 0.5;
    prefetch.current ??= speculativePrefetchOn(window.location.search);
    if (idle.current) countOfficeAsk();
    const s = getHQStore().getState();
    const want = officeLoadWanted({
      idle: idle.current,
      state: officeChunkState(),
      prefetch: prefetch.current,
      floor: s.floor,
      rideTo: s.ride?.to ?? null,
      at: s.ride ? LOBBY.arrival : roverRuntime,
      mission: s.mission?.status === "running" ? s.mission.id : null,
    });
    if (want) void loadOffice().catch(() => null);
  });
  const Scene = mounted ? mod?.OfficeScene : undefined;
  return (
    <group name="agent-office">
      <MergedBoxes boxes={SHELL} color="#0b1020" emissive={COLORS.cyan} emissiveIntensity={0.05} />
      <MergedEdges boxes={SHELL} color={COLORS.cyan} tier={tier} opacity={0.6} />
      {Scene && (
        <group ref={live}>
          <Scene tier={tier} t={t} />
        </group>
      )}
    </group>
  );
}
