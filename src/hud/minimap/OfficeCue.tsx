"use client";

import { LOBBY } from "@/experience/config";
import { officeDockPad } from "@/experience/floors/lobby/officeLayout";
import { officeSignal, setOfficeSignal, subscribeOfficeSignal, useOfficeSignal } from "@/experience/floors/lobby/office/officeSignal";

/** How long the deploy cue shows (ms): the deploy beam's 8 s (`BEAM.s` in the beacon chunk, kept literal so this chunk never imports it). */
export const DEPLOY_CUE_MS = 8000;
const DOCK = officeDockPad(LOBBY.officeWing);
/** The fresh production deploy the cue last showed (one deploy shows once, also across a cleared signal, like the beam) and whether it shows. */
const cue = { at: null as number | null, on: false };
let off: ReturnType<typeof setTimeout> | undefined;

/** Lights the cue for `DEPLOY_CUE_MS` on a new `officeSignal.deployAt`; the signal's own notify re-renders the cues. */
function watchDeploy(): void {
  const at = officeSignal.deployAt;
  if (at === null || at === cue.at) return;
  cue.at = at;
  cue.on = true;
  clearTimeout(off);
  off = setTimeout(() => {
    cue.on = false;
    setOfficeSignal({});
  }, DEPLOY_CUE_MS);
  setOfficeSignal({});
}

// At import too: the scene chunk may have fed the signal first.
subscribeOfficeSignal(watchDeploy);
watchDeploy();

/** A pulsing ring at `at`, or a pip on the rim pointing at it when it lies outside the window (`center`, `radius`). */
function Cue({ at, center, radius, tone, name }: { at: { x: number; z: number }; center: { x: number; z: number } | null; radius: number; tone: string; name: string }) {
  const dx = center ? at.x - center.x : 0;
  const dz = center ? at.z - center.z : 0;
  const d = Math.hypot(dx, dz);
  if (!center || d <= radius - 2) {
    return (
      <g data-map={name}>
        <circle data-cue="ring" cx={at.x} cy={at.z} r={3.2} fill="none" stroke={tone} strokeWidth={1.2} className="office-cue" vectorEffect="non-scaling-stroke" />
      </g>
    );
  }
  // 2.5 in from the rim: the pip (r 1.6) pulses to 1.35 times its size (2.16) and stays inside the clip.
  const k = (radius - 2.5) / d;
  return (
    <g data-map={name}>
      <circle data-cue="pip" cx={center.x + dx * k} cy={center.z + dz * k} r={1.6} fill={tone} className="office-cue" />
    </g>
  );
}

/**
 * The minimap's office cues (design 5.3): Needs Kurniadi, a pink pulsing ring at the office stop, and a fresh
 * production deploy, a green one at the ship dock for the beam's 8 s (owner decision 2026-10-21); each a pip on the rim
 * pointing at it from outside the window, steady under reduced motion (`.office-cue`). It ships in the office watch
 * chunk (`watchChunk.ts`): `MapLayers` draws it once that chunk loaded, never imports it.
 */
export function OfficeCue({ center, radius }: { center: { x: number; z: number } | null; radius: number }) {
  const asks = useOfficeSignal((s) => s.needsKurniadi);
  const deploy = useOfficeSignal(() => cue.on);
  return (
    <>
      {deploy && <Cue at={DOCK} center={center} radius={radius} tone="var(--color-green)" name="office-deploy-cue" />}
      {asks && <Cue at={LOBBY.officeWing.stop} center={center} radius={radius} tone="var(--color-pink)" name="office-cue" />}
    </>
  );
}
