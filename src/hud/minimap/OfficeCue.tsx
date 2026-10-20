"use client";

import { LOBBY } from "@/experience/config";
import { useOfficeSignal } from "@/experience/floors/lobby/office/officeSignal";

const TONE = "var(--color-pink)";

/**
 * The minimap's Needs Kurniadi cue: a pulsing ring at the office stop, or a pip on the rim pointing at it (design 5.3).
 * It ships in the office watch chunk (`watchChunk.ts`): `MapLayers` draws it once that chunk loaded, never imports it.
 */
export function OfficeCue({ center, radius }: { center: { x: number; z: number } | null; radius: number }) {
  const on = useOfficeSignal((s) => s.needsKurniadi);
  if (!on) return null;
  const stop = LOBBY.officeWing.stop;
  const dx = center ? stop.x - center.x : 0;
  const dz = center ? stop.z - center.z : 0;
  const d = Math.hypot(dx, dz);
  if (!center || d <= radius - 2) {
    return (
      <g data-map="office-cue">
        <circle data-cue="ring" cx={stop.x} cy={stop.z} r={3.2} fill="none" stroke={TONE} strokeWidth={1.2} className="office-cue" vectorEffect="non-scaling-stroke" />
      </g>
    );
  }
  const k = (radius - 2) / d;
  return (
    <g data-map="office-cue">
      <circle data-cue="pip" cx={center.x + dx * k} cy={center.z + dz * k} r={1.6} fill={TONE} className="office-cue" />
    </g>
  );
}
