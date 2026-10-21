import { Color, Euler, Matrix4, Quaternion, Vector3 } from "three";
import { STATE_TONE } from "@/lib/office/model";
import type { OfficeState } from "@/lib/office/protocol";
import { LOBBY } from "../../../config";
import { OFFICE, OFFICE_SEAT_COUNT, officeTowerColumn, officeTowerYaw, type OfficeSlot } from "../officeLayout";
import { confettiAt, CREW, DRONES, dronePoint, sparkAt, trailAt, TRAIL_SIZE, type CrewFx, type FxPoint } from "./crew";
import type { OfficeView } from "./officeModel";
import { OFFICE_ROVER } from "./officeVisual";

/**
 * The crew's glow effects and the CI tower's lane dots, written in place into the office glow mesh (no allocation in
 * the write functions: module temporaries and constant tables; the key functions build a short string).
 */

/** Crew instances per Rover in the glow mesh, after the 18 the rig writes (tip, halo, 16 progress dots); `cores`: the helper drones' glowing cores. */
export const CREW_GLOW = { sparks: 0, trail: 5, confetti: 8, charge: 14, desk: 15, cores: 16, count: 20 } as const;
/** The rig's own instances per Rover (`writeGlow`): the tip, the halo and the progress dots. */
const RIG_GLOW = 2 + OFFICE_ROVER.progress.count;

const M = new Matrix4();
const Q = new Quaternion();
const V = new Vector3();
const S = new Vector3();
const C = new Color();
const UP = new Vector3(0, 1, 0);
const P: FxPoint = { x: 0, y: 0, z: 0, a: 0 };
const FLAT = new Quaternion().setFromEuler(new Euler(-Math.PI / 2, 0, 0));
const SPARK = "#a5f3fc";
const CHARGE = "#67e8f9";
const CONFETTI = ["#34d399", "#22d3ee", "#fbbf24", "#f472b6", "#a78bfa", "#ffffff"] as const;
/**
 * The charge pad: a flat glow ellipse `w` across and `d` deep (u) under the docked Rover, centred where it stands (its
 * front edge meets the desk's back edge, so no part of it lies under the desk) and wider than the Rover (0.75 u half
 * width), so it shows on both sides of it from the office stop. `y` lies over the halo (0.03), the progress dots (0.04) and
 * the corner pads' tops (`OFFICE.tower.plinth`, `OFFICE.dock.pad`), which the end Rovers' pads reach over.
 */
export const CHARGE_PAD = { w: 3.2, d: 2.2, y: 0.12 } as const;
/**
 * On a lifted row (the back row's riser) a docked Rover stands `OFFICE.rover.radius - CREW.dock.back` u in front of the
 * riser's back edge, less than half the pad's depth: there the pad loses this much (0.45 u) off its back and its centre
 * moves half of it toward the desk, so it ends at the riser's back edge and its front edge still meets the desk's.
 */
export const CHARGE_PAD_TRIM = Math.max(0, CREW.dock.back + CHARGE_PAD.d / 2 - OFFICE.rover.radius);

function dot(frame: Matrix4, p: FxPoint, size: number, color: string, gain: number, i: number, matrices: Float32Array, colors: Float32Array): void {
  V.set(p.x, p.y, p.z).applyMatrix4(frame);
  M.compose(V, Q.identity(), S.setScalar(p.a > 0 ? size : 0)).toArray(matrices, i * 16);
  C.set(color).multiplyScalar(gain * p.a).toArray(colors, i * 3);
}

/**
 * A helper drone's core: a glow dot at the drone's centre, turned to the camera, twice the body's width, in its Rover's
 * state tone (`gain`; dim on the lite tier), so the body hides its middle and it reads as a glowing rim and core.
 */
export const DRONE_CORE = { size: 0.6, gain: 1.4, lite: 0.5 } as const;
const NOWHERE = { x: 0, z: 0 };

/**
 * Writes one Rover's 20 crew instances (hidden ones scaled to 0). `frame` is the Rover's frame from `roverFrame`: the
 * sparks, the thought trail, the confetti and the `drones` helper drones' cores (`DRONE_CORE`, turned to `cam`, the
 * camera's floor position) ride on it. The charge pad lies on the floor under the docked Rover (`CHARGE_PAD`, trimmed on the riser: `CHARGE_PAD_TRIM`) and the desk light on the desk, so
 * neither follows the Rover's pitch, slump or turn.
 */
export function writeCrewGlow(slot: OfficeSlot, frame: Matrix4, state: OfficeState, fx: CrewFx, t: number, phase: number, reduced: boolean, matrices: Float32Array, colors: Float32Array, drones = 0, lite = false, cam: { x: number; z: number } = NOWHERE): void {
  const base = slot.slot * (RIG_GLOW + CREW_GLOW.count) + RIG_GLOW;
  const tone = STATE_TONE[state];
  for (let i = 0; i < 5; i++) {
    sparkAt(i, t, phase, reduced, P);
    if (fx.sparks === 0) P.a = 0;
    dot(frame, P, 0.09, SPARK, 1.4, base + CREW_GLOW.sparks + i, matrices, colors);
  }
  for (let j = 0; j < 3; j++) {
    trailAt(j, t, reduced, P);
    P.a *= fx.trail;
    dot(frame, P, TRAIL_SIZE[j], tone, 1, base + CREW_GLOW.trail + j, matrices, colors);
  }
  for (let j = 0; j < 6; j++) {
    if (fx.confetti < 0) P.a = 0;
    else confettiAt(j, fx.confetti, P);
    dot(frame, P, 0.1, CONFETTI[j], 1.3, base + CREW_GLOW.confetti + j, matrices, colors);
  }
  const charge = base + CREW_GLOW.charge;
  const trim = slot.lift > 0 ? CHARGE_PAD_TRIM : 0;
  V.setFromMatrixPosition(frame);
  V.set(V.x + (Math.sin(slot.yaw) * trim) / 2, slot.lift + CHARGE_PAD.y, V.z + (Math.cos(slot.yaw) * trim) / 2);
  const pad = fx.charge > 0 ? 1 : 0;
  M.compose(V, Q.setFromAxisAngle(UP, slot.yaw).multiply(FLAT), S.set(CHARGE_PAD.w * pad, (CHARGE_PAD.d - trim) * pad, pad)).toArray(matrices, charge * 16);
  C.set(CHARGE).multiplyScalar(fx.charge).toArray(colors, charge * 3);
  // The desk light: a long flat glow along the desk's far edge, in the state tone (dims to 10% asleep).
  const desk = base + CREW_GLOW.desk;
  const edge = OFFICE.desk.d / 2 - 0.05;
  V.set(slot.desk.x + Math.sin(slot.yaw) * edge, slot.lift + OFFICE.desk.top + 0.01, slot.desk.z + Math.cos(slot.yaw) * edge);
  M.compose(V, Q.setFromAxisAngle(UP, slot.yaw).multiply(FLAT), S.set(slot.deskW * 0.85, 0.12, 1)).toArray(matrices, desk * 16);
  C.set(tone).multiplyScalar(0.6 * fx.deskLight).toArray(colors, desk * 3);
  for (let i = 0; i < DRONES.max; i++) {
    dronePoint(i, drones, t, phase, reduced, P);
    const at = base + CREW_GLOW.cores + i;
    V.set(P.x, P.y, P.z).applyMatrix4(frame);
    M.compose(V, Q.setFromAxisAngle(UP, Math.atan2(cam.x - V.x, cam.z - V.z)), S.setScalar(P.a > 0 ? DRONE_CORE.size : 0)).toArray(matrices, at * 16);
    C.set(tone).multiplyScalar((lite ? DRONE_CORE.lite : DRONE_CORE.gain) * P.a).toArray(colors, at * 3);
  }
}

/** Changes when the helper drones would move or show differently: "" without drones, their count (and the tier) parked under reduced motion, a 30 Hz tick in full motion. */
export function droneKey(drones: number, t: number, reduced: boolean, lite: boolean): string {
  const n = Math.min(drones, DRONES.max);
  if (n <= 0) return "";
  return reduced ? `d${n}${lite ? "l" : ""}` : `d${n}:${Math.floor(t * 30)}`;
}

/** Changes when any crew instance would change: animated effects tick at 30 Hz, the charge in tenths, the flicker by its gain. */
export function crewGlowKey(state: OfficeState, fx: CrewFx, t: number, reduced: boolean): string {
  if (reduced) return `${state}:${fx.confetti >= 0 ? 1 : 0}`;
  if (state === "asleep") return `asleep:${Math.round(fx.charge * 10)}`;
  if (state === "failed") return `failed:${fx.flicker}`;
  if (fx.sparks || fx.trail || fx.confetti >= 0) return `${state}:${Math.floor(t * 30)}`;
  return state;
}

/**
 * The tower's LED matrix after the ten Rovers' glow (`start`: the glow instance count derives from the seat count): up
 * to 24 lanes of 8 dots, bottom to top, over most of the slim column's stop-facing face (`base` over the plinth, `gap`
 * between lanes: 0.5 u to 8.78 u of its 9.1 u), `across` apart within a lane (0.91 u of its 1.2 u face). Idle dots stay a
 * dim visible grid (`idle`), a run's pending lanes a little brighter, done lanes bright green, the next lane chasing.
 */
export const TOWER = { lanes: 24, dots: 8, start: OFFICE_SEAT_COUNT * (RIG_GLOW + CREW_GLOW.count), base: 0.4, gap: 0.36, across: 0.13, size: { lit: 0.11, idle: 0.09 }, idle: 0.35, pending: 0.6, done: 1.2 } as const;

export interface TowerLanes {
  total: number;
  done: number;
  running: boolean;
}

/** Stage A (v1 data): the newest running public run's progress as anonymous lanes (scaled to 24 past 24 jobs); dark without one. */
export function towerLanes(view: OfficeView): TowerLanes {
  let run: OfficeView["github"][number] | null = null;
  for (const g of view.github) if (g.kind === "run" && g.status === "running" && (!run || g.at > run.at)) run = g;
  if (!run) return { total: 0, done: 0, running: false };
  const jobs = run.progress?.total ?? 1;
  const total = Math.min(TOWER.lanes, jobs);
  const done = Math.min(jobs, run.progress?.done ?? 0);
  return { total, done: jobs > TOWER.lanes ? Math.floor((done * total) / jobs) : done, running: true };
}

const COL = officeTowerColumn(LOBBY.officeWing);
/** The column's stop-facing side (the column is turned to face the office stop, `officeShell.ts`). */
const FACE = officeTowerYaw(LOBBY.officeWing);
const FACE_Q = new Quaternion().setFromAxisAngle(UP, FACE);
const IDLE = "#64748b";

/** Writes the lane dots on the column's stop-facing side: done lanes green, the next lane chasing, the rest a dim grid. */
export function writeTower(lanes: TowerLanes, t: number, reduced: boolean, matrices: Float32Array, colors: Float32Array): void {
  const cx = Math.cos(FACE);
  const sx = -Math.sin(FACE);
  const fx = Math.sin(FACE);
  const fz = Math.cos(FACE);
  const out = OFFICE.tower.column / 2 + 0.02;
  const head = reduced ? 0 : Math.floor(t * 8) % TOWER.dots;
  for (let lane = 0; lane < TOWER.lanes; lane++) {
    const shown = lane < lanes.total;
    const chasing = shown && lanes.running && lane === lanes.done;
    for (let d = 0; d < TOWER.dots; d++) {
      const i = TOWER.start + lane * TOWER.dots + d;
      const across = (d - (TOWER.dots - 1) / 2) * TOWER.across;
      V.set(COL.x + cx * across + fx * out, OFFICE.tower.plinth + TOWER.base + lane * TOWER.gap, COL.z + sx * across + fz * out);
      M.compose(V, FACE_Q, S.setScalar(shown ? TOWER.size.lit : TOWER.size.idle)).toArray(matrices, i * 16);
      const color = lane < lanes.done ? "#34d399" : chasing ? "#a78bfa" : IDLE;
      const on = lane < lanes.done ? TOWER.done : chasing ? (d === head ? 1.4 : 0.5) : shown ? TOWER.pending : TOWER.idle;
      C.set(color).multiplyScalar(on).toArray(colors, i * 3);
    }
  }
}

/** Changes when `writeTower` would write other colours: the lanes, and the chasing dot while a lane is chasing. */
export function towerKey(lanes: TowerLanes, t: number, reduced: boolean): string {
  const chasing = lanes.running && lanes.done < lanes.total;
  return `${lanes.total}:${lanes.done}:${lanes.running}:${reduced || !chasing ? 0 : Math.floor(t * 8) % TOWER.dots}`;
}
