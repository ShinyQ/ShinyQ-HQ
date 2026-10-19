/**
 * Rover idle behaviour (pure): after `delay` seconds without input the rover plays a short scripted
 * sequence (look around, blink, a hop or a spin, one beep), then waits a random gap and plays another.
 * Any activity or loss of eligibility resets the wait. The caller owns smoothing of the raw yaw and spin.
 */

export const IDLE = { delay: 15, gapMin: 8, gapMax: 14, lookYaw: 0.6 } as const;

export type IdleAction = "look" | "blink" | "hop" | "spin" | "beep";

export interface IdleStep {
  action: IdleAction;
  at: number;
  dur: number;
}

export const IDLE_SEQUENCES: readonly (readonly IdleStep[])[] = [
  [
    { action: "blink", at: 0, dur: 0.2 },
    { action: "look", at: 0.4, dur: 2.2 },
    { action: "hop", at: 2.8, dur: 0.6 },
    { action: "blink", at: 3.2, dur: 0.2 },
    { action: "beep", at: 3.6, dur: 0.3 },
  ],
  [
    { action: "look", at: 0, dur: 2.4 },
    { action: "blink", at: 2.6, dur: 0.2 },
    { action: "spin", at: 3, dur: 1 },
    { action: "beep", at: 4.2, dur: 0.3 },
  ],
  [
    { action: "beep", at: 0, dur: 0.3 },
    { action: "blink", at: 0.4, dur: 0.2 },
    { action: "look", at: 0.8, dur: 2 },
    { action: "blink", at: 3, dur: 0.2 },
    { action: "hop", at: 3.4, dur: 0.6 },
  ],
  [
    { action: "spin", at: 0, dur: 1 },
    { action: "blink", at: 1.2, dur: 0.2 },
    { action: "look", at: 1.6, dur: 2.2 },
    { action: "beep", at: 4, dur: 0.3 },
    { action: "blink", at: 4.4, dur: 0.2 },
  ],
];

export interface IdleState {
  primed: boolean;
  seenSeq: number;
  /** Time at which the next sequence may start. */
  startAt: number;
  /** Index into IDLE_SEQUENCES while a sequence runs, else -1. */
  active: number;
  last: number;
  start: number;
  /** Index of the next step to fire. */
  next: number;
  dir: 1 | -1;
  beeped: boolean;
  action: IdleAction | null;
}

export function createIdleState(): IdleState {
  return { primed: false, seenSeq: 0, startAt: 0, active: -1, last: -1, start: 0, next: 0, dir: 1, beeped: false, action: null };
}

export interface IdleInput {
  t: number;
  seq: number;
  eligible: boolean;
  reduced: boolean;
  delay: number;
  random: () => number;
}

export interface IdleOutput {
  action: IdleAction | null;
  headYaw: number;
  spin: number;
  blink: boolean;
  hop: boolean;
  beep: boolean;
}

const zero = (): IdleOutput => ({ action: null, headYaw: 0, spin: 0, blink: false, hop: false, beep: false });

const easeInOut = (p: number) => (p < 0.5 ? 2 * p * p : 1 - 2 * (1 - p) * (1 - p));

const sequenceEnd = (steps: readonly IdleStep[]) => Math.max(...steps.map((s) => s.at + s.dur));

export function stepIdle(s: IdleState, i: IdleInput): IdleOutput {
  const out = zero();
  if (!s.primed) {
    s.primed = true;
    s.seenSeq = i.seq;
    s.startAt = i.t + i.delay;
  }
  if (i.seq !== s.seenSeq || !i.eligible) {
    s.seenSeq = i.seq;
    s.startAt = i.t + i.delay;
    s.active = -1;
    s.beeped = false;
    s.action = null;
    return out;
  }

  if (s.active < 0) {
    if (i.t < s.startAt) return out;
    const n = IDLE_SEQUENCES.length;
    let pick = s.last < 0 ? Math.floor(i.random() * n) : Math.floor(i.random() * (n - 1));
    pick = Math.min(pick, s.last < 0 ? n - 1 : n - 2);
    if (s.last >= 0 && pick >= s.last) pick += 1;
    s.active = pick;
    s.last = pick;
    s.start = i.t;
    s.next = 0;
    s.dir = i.random() < 0.5 ? -1 : 1;
    s.action = null;
  }

  const steps = IDLE_SEQUENCES[s.active];
  const elapsed = i.t - s.start;

  if (elapsed >= sequenceEnd(steps)) {
    s.active = -1;
    s.action = null;
    s.startAt = i.t + IDLE.gapMin + i.random() * (IDLE.gapMax - IDLE.gapMin);
    return out;
  }

  while (s.next < steps.length && elapsed >= steps[s.next].at) {
    const step = steps[s.next++];
    let fired = true;
    if (step.action === "blink") out.blink = true;
    else if (i.reduced) fired = false;
    else if (step.action === "hop") out.hop = true;
    else if (step.action === "beep") {
      if (s.beeped) fired = false;
      else {
        s.beeped = true;
        out.beep = true;
      }
    }
    if (fired) s.action = step.action;
  }

  for (let k = 0; k < s.next; k++) {
    const step = steps[k];
    const p = (elapsed - step.at) / step.dur;
    if (p < 0 || p >= 1 || i.reduced) continue;
    if (step.action === "look") out.headYaw = IDLE.lookYaw * Math.sin(2 * Math.PI * p) * Math.sin(Math.PI * p);
    else if (step.action === "spin") out.spin = s.dir * 2 * Math.PI * easeInOut(p);
  }
  out.action = s.action;
  return out;
}

export interface EligibleInput {
  phase: string;
  missionRunning: boolean;
  ride: boolean;
  beam: boolean;
  picker: boolean;
  driving: boolean;
  speed: number;
  cameraBlend: number;
  askFace: boolean;
}

export function idleEligible(i: EligibleInput): boolean {
  return (
    i.phase === "explore" &&
    !i.missionRunning &&
    !i.ride &&
    !i.beam &&
    !i.picker &&
    !i.driving &&
    !i.askFace &&
    i.speed < 0.05 &&
    i.cameraBlend <= 0.01
  );
}
