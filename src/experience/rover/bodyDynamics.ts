/**
 * Boost body dynamics (pure): the rover squats (nose up) as the boost kicks in and under boosted
 * acceleration, dips (nose down) when braking out of a boost, leans into turns with yaw rate times
 * speed, and buzzes a little at boost top speed (full tier). Every response is weighted by an envelope
 * that follows the boost level and decays slowly, so normal driving keeps exactly the old pose.
 * Angles are small (a few degrees) so the rover stays recognisable.
 */

export interface Spring {
  x: number;
  v: number;
}

const deg = (d: number) => (d * Math.PI) / 180;

export const BODY = {
  /** Spring stiffness (rad/s): critically damped, settles in about 0.4 s. */
  omega: 12,
  /** Pitch per u/s^2 of acceleration (rad). Boost acceleration (36 u/s^2) gives about 3 degrees. */
  pitchPerAccel: deg(3) / 36,
  /** Nose up under acceleration (rad, applied as negative x rotation). */
  maxSquat: deg(3.5),
  /** Nose down under braking (rad). */
  maxDip: deg(2.5),
  /** Extra roll per (rad/s x u/s) of yaw rate times speed: full turn at 18 u/s gives 3 degrees. */
  rollPerYawSpeed: deg(3) / (3.5 * 18),
  maxRoll: deg(3),
  /** Envelope decay per second after the boost ends, so the braking dip still shows. */
  envelopeDecay: 1.5,
  /** Acceleration smoothing rate (1/s) and clamp (u/s^2); teleports and stops never spike the pose. */
  accelSmoothing: 10,
  maxAccel: 60,
  maxYawRate: 5,
  /** Body buzz at top speed: height (u), roll (rad), frequencies (Hz). */
  buzzAmp: 0.006,
  buzzRoll: 0.004,
  buzzHzY: 23,
  buzzHzRoll: 31,
};

/** Exact critically damped spring step toward `target`; stable for any dt, no overshoot from rest. */
export function springStep(s: Spring, target: number, omega: number, dt: number): void {
  if (dt <= 0) return;
  const x0 = s.x - target;
  const e = Math.exp(-omega * dt);
  const temp = (s.v + omega * x0) * dt;
  s.v = (s.v - omega * temp) * e;
  s.x = target + (x0 + temp) * e;
}

export interface BodyState {
  /** Body pitch, rad (negative is nose up). */
  pitch: Spring;
  /** Extra roll on top of the base tilt, rad. */
  roll: Spring;
  envelope: number;
  accel: number;
  lastSpeed: number;
  lastHeading: number;
  primed: boolean;
  buzzY: number;
  buzzRoll: number;
}

export function createBodyState(): BodyState {
  return { pitch: { x: 0, v: 0 }, roll: { x: 0, v: 0 }, envelope: 0, accel: 0, lastSpeed: 0, lastHeading: 0, primed: false, buzzY: 0, buzzRoll: 0 };
}

export interface BodyInput {
  speed: number;
  heading: number;
  /** Eased boost level 0 to 1. */
  level: number;
  dt: number;
  /** Effect clock (s), for the buzz. */
  t: number;
  /** Off under reduced motion: everything relaxes to the plain pose. */
  enabled: boolean;
  /** Full tier only. */
  buzz: boolean;
  /** Boosted top speed (u/s). */
  topSpeed: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

export function stepBody(s: BodyState, input: BodyInput): void {
  const { speed, heading, level, dt, t, enabled } = input;
  if (dt <= 0) return;
  if (!s.primed) {
    s.lastSpeed = speed;
    s.lastHeading = heading;
    s.primed = true;
  }
  const rawAccel = clamp((speed - s.lastSpeed) / dt, -BODY.maxAccel, BODY.maxAccel);
  s.accel += (rawAccel - s.accel) * Math.min(1, dt * BODY.accelSmoothing);
  const yawRate = clamp(wrap(heading - s.lastHeading) / dt, -BODY.maxYawRate, BODY.maxYawRate);
  s.lastSpeed = speed;
  s.lastHeading = heading;

  s.envelope = enabled ? Math.max(clamp(level, 0, 1), s.envelope - BODY.envelopeDecay * dt) : 0;
  const e = s.envelope;
  const pitchTarget = e > 0 ? e * clamp(-s.accel * BODY.pitchPerAccel, -BODY.maxSquat, BODY.maxDip) : 0;
  const rollTarget = e > 0 ? e * clamp(-yawRate * speed * BODY.rollPerYawSpeed, -BODY.maxRoll, BODY.maxRoll) : 0;
  // A body at rest with a zero target stays exactly at rest (normal driving keeps the old pose).
  if (pitchTarget !== 0 || s.pitch.x !== 0 || s.pitch.v !== 0) springStep(s.pitch, pitchTarget, BODY.omega, dt);
  if (rollTarget !== 0 || s.roll.x !== 0 || s.roll.v !== 0) springStep(s.roll, rollTarget, BODY.omega, dt);
  s.pitch.x = clamp(s.pitch.x, -BODY.maxSquat, BODY.maxDip);
  s.roll.x = clamp(s.roll.x, -BODY.maxRoll, BODY.maxRoll);

  if (enabled && input.buzz && level > 0) {
    const k = level * smoothstep(0.85, 1, speed / Math.max(1e-3, input.topSpeed));
    s.buzzY = Math.sin(t * 2 * Math.PI * BODY.buzzHzY) * BODY.buzzAmp * k;
    s.buzzRoll = Math.sin(t * 2 * Math.PI * BODY.buzzHzRoll) * BODY.buzzRoll * k;
  } else {
    s.buzzY = 0;
    s.buzzRoll = 0;
  }
}
