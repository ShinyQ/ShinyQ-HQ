import { LOBBY } from "../../../config";
import type { Vec2 } from "../../../types";
import { OFFICE } from "../officeLayout";
import { OFFICE_SLOTS } from "../officeShell";

/**
 * The Needs Kurniadi beacon (design 2026-10-20 section 5.3): a tall column plus three flat rings pulsing up it, on the hall's
 * stage program. The rings (`band` u tall, `grow` times the column's radius from the bottom to the top of their climb) rise
 * the lowest `rise` u every `period` s: the part of the column a desktop sees from the spawn. `stop`: its look at the
 * office stop (`beaconGain`).
 */
export const BEACON = { h: 26, r: 0.8, bands: 3, period: 1.6, band: 0.4, rise: 8, grow: [2.2, 3.8], slots: 5, stop: { bands: 0.3, reach: 2 } } as const;

/** Alpha gains of the column and the bands, and how high the bands climb (u). */
export interface BeaconGain {
  column: number;
  bands: number;
  reach: number;
}

export interface BeaconInstance {
  y: number;
  r: number;
  h: number;
  alpha: number;
}

/**
 * On the floor behind the asking Rover (between it and the wall, so the column never hides it or its flag): 1.25 u behind
 * a front-row Rover, and just past the riser's back edge behind a back-row Rover (`OFFICE.rover.radius + BEACON.r`, 1.8 u:
 * the riser ends at the Rover's footprint, so the whole base stands on the floor, never overhanging the riser); the wing
 * plaza's centre when several Rovers ask or the asking seat has no desk in the layout. Writes into `out` (the frame passes
 * one object, so nothing allocates per frame).
 */
export function beaconOrigin(asking: readonly number[], out: Vec2 = { x: 0, z: 0 }): Vec2 {
  const s = asking.length === 1 ? OFFICE_SLOTS[asking[0]] : undefined;
  if (!s) {
    out.x = LOBBY.officeWing.plaza.center.x;
    out.z = LOBBY.officeWing.plaza.center.z;
    return out;
  }
  const back = s.lift > 0 ? OFFICE.rover.radius + BEACON.r : 1.25;
  // Forward (sin yaw, cos yaw) points at the arc centre, so behind is the opposite way.
  out.x = s.rover.x - Math.sin(s.yaw) * back;
  out.z = s.rover.z - Math.cos(s.yaw) * back;
  return out;
}

const FULL: BeaconGain = { column: 1, bands: 1, reach: BEACON.rise };
const STOP: BeaconGain = { column: 0, ...BEACON.stop };

/**
 * The beacon's look: whole away from the stop (the Lobby, the lead road, the wing); at the office stop the column hides and
 * only the bands stay, at 30%, climbing no higher than the asking Rover's head (2 u), so nothing crosses the screen wall
 * or the HUD there: the Rover's raised flag carries the signal.
 */
export const beaconGain = (atStop: boolean): BeaconGain => (atStop ? STOP : FULL);

/**
 * Column (0) and rings (1 to 3) at time `t`, the rings climbing to `reach` (u, `BEACON.rise` by default), widening, fading
 * in over their first fifth and out as they climb; instance 4 (the deploy beam, `BEAM.slot`) is left as is. Reduced motion: rings fixed
 * at a quarter, a half and three quarters of the way up.
 */
export function beaconInstances(t: number, reduced: boolean, out: BeaconInstance[], reach: number = BEACON.rise): void {
  Object.assign(out[0], { y: 0, r: BEACON.r, h: BEACON.h, alpha: 0.9 });
  const [r0, r1] = BEACON.grow;
  for (let i = 0; i < BEACON.bands; i++) {
    const u = reduced ? (i + 1) / (BEACON.bands + 1) : (t / BEACON.period + i / BEACON.bands) % 1;
    Object.assign(out[1 + i], { y: u * (reach - BEACON.band), r: BEACON.r * (r0 + u * (r1 - r0)), h: BEACON.band, alpha: reduced ? 0.7 : Math.min(1, u * 5) * (1 - u) });
  }
}

/**
 * The production deploy beam (design 6.3), the beacon mesh's instance `slot`: a green column `h` u tall and `r` u wide
 * over the ship dock for `s` seconds from the moment a client first sees a fresh deploy success, rising over `rise` s
 * and fading over the last `fade` s. At the office stop it stops at `stopH` (the wall's top), so it never crosses the
 * chip row or the HUD there.
 */
export const BEAM = { slot: 4, h: 40, r: 1.1, s: 8, rise: 0.6, fade: 1.5, stopH: OFFICE.wall.bottom + OFFICE.wall.h + OFFICE.wall.frame } as const;

/** Which deploy the beam showed last and when it started (scene seconds); kept across a cleared signal, so a deploy fires once. */
export interface BeamClock {
  deployAt: number | null;
  t0: number;
}

/** Seconds into the beam at scene time `t`, or null when none shows: a `deployAt` the clock has not seen starts one now. */
export function beamSince(deployAt: number | null, t: number, clock: BeamClock): number | null {
  if (deployAt !== null && deployAt !== clock.deployAt) {
    clock.deployAt = deployAt;
    clock.t0 = t;
  }
  if (clock.deployAt === null || t - clock.t0 >= BEAM.s) return null;
  return t - clock.t0;
}

/** Instance `BEAM.slot` at `since` seconds into the beam (zero size without one). Reduced motion: full height and steady for the 8 s. */
export function beamInstance(since: number | null, reduced: boolean, atStop: boolean, out: BeaconInstance): void {
  if (since === null) {
    Object.assign(out, { y: 0, r: 0, h: 0, alpha: 0 });
    return;
  }
  const rise = reduced ? 1 : Math.min(1, since / BEAM.rise);
  const fade = reduced || since <= BEAM.s - BEAM.fade ? 1 : (BEAM.s - since) / BEAM.fade;
  Object.assign(out, { y: 0, r: BEAM.r, h: (atStop ? BEAM.stopH : BEAM.h) * rise, alpha: (reduced ? 0.6 : 0.95) * fade });
}
