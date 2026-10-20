import { LOBBY } from "../../../config";
import type { Vec2 } from "../../../types";
import { OFFICE_SLOTS } from "../officeShell";

/** The Needs Kurniadi beacon (design 2026-10-20 section 5.3): a tall column plus three bands rising it, on the hall's stage program. */
export const BEACON = { h: 26, r: 0.8, bands: 3, period: 1.6, band: 0.3, slots: 5 } as const;

export interface BeaconInstance {
  y: number;
  r: number;
  h: number;
  alpha: number;
}

/** 1.25 u behind the asking Rover (between it and the wall, so the column never hides it or its flag), or the wing plaza's centre when several Rovers ask. */
export function beaconOrigin(asking: readonly number[]): Vec2 {
  if (asking.length !== 1) return LOBBY.officeWing.plaza.center;
  const s = OFFICE_SLOTS[asking[0]];
  // Forward (sin yaw, cos yaw) points at the arc centre, so behind is the opposite way.
  return { x: s.rover.x - Math.sin(s.yaw) * 1.25, z: s.rover.z - Math.cos(s.yaw) * 1.25 };
}

/** The beacon's gain: 25% while the rover stands at the office stop (the flag carries the signal there). */
export const beaconGain = (atStop: boolean) => (atStop ? 0.25 : 1);

/** Column (0) and bands (1 to 3) at time `t`; instance 4 (stage B's beam) is left as is. Reduced motion: bands fixed at a quarter, a half and three quarters of the way up. */
export function beaconInstances(t: number, reduced: boolean, out: BeaconInstance[]): void {
  Object.assign(out[0], { y: 0, r: BEACON.r, h: BEACON.h, alpha: 0.9 });
  for (let i = 0; i < BEACON.bands; i++) {
    const u = reduced ? (i + 1) / (BEACON.bands + 1) : (t / BEACON.period + i / BEACON.bands) % 1;
    Object.assign(out[1 + i], { y: u * (BEACON.h - BEACON.band), r: BEACON.r * (1.4 + u * 2.6), h: BEACON.band, alpha: reduced ? 0.7 : 1 - u });
  }
}
