import { Color, Matrix4, Quaternion, Vector3 } from "three";
import { COLORS, LOBBY } from "../../../config";
import { OFFICE, officeDockPad, officeTowerColumn, officeTowerYaw, officeWallRect } from "../officeLayout";
import { OFFICE_SLOTS } from "../officeShell";
import { OFFICE_ROVER_HEAD_TOP } from "./chipRows";
import { PIPE_GLOW, PIPE_PARTS, TOWER } from "./crewFx";
import { PACKAGE_START } from "./officeRig";
import { STATUS_COLOR } from "./officeVisual";
import type { PipeEvent } from "./pipeline";

/**
 * The CI pipeline's effects (office scene chunk), written in place into the office glow mesh (`PIPE_GLOW`) and parts
 * mesh (`PIPE_PARTS` from `PACKAGE_START`): packets from a desk (or the wall) to the tower, bursts on a lane, the crown
 * over the column, packages from a desk (or the tower) to the dock's stack, and the dock ring. No allocation in `write`:
 * module temporaries and fixed pools.
 */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** The highest any pipeline effect flies (u): the wall's top, so from the office stop nothing rises into the chip row (5.7b). */
export const FX_CEILING = OFFICE.wall.bottom + OFFICE.wall.h + OFFICE.wall.frame;

/**
 * Durations (s), shapes, dot sizes (u) and peak gains, sized to read from the office stop on desktop (owner decision
 * 2026-10-21: the packets, bursts and crown about 1.6 to 2 times part B's first cut): packets arc 1.5 s up to 2 u, 4 dots
 * `step` u apart; packages 2.5 s; bursts widen from 0.3 u to 1.6 u over 0.6 s; the crown (a flat ring `r` u over the
 * column) flashes 1 s; a failed deploy pulses the dock ring 0.8 s, a running deploy shimmers it at 0.5 Hz.
 */
export const PIPE_FX = {
  packet: { s: 1.5, lift: 2, size: 0.24, gain: 2.2, step: 0.13 },
  package: { s: 2.5 },
  burst: { s: 0.6, r0: 0.3, r1: 1.6, size: 0.22, gain: 2.4 },
  crown: { s: 1, r: 0.95, size: 0.32, gain: 3 },
  deployFailed: { s: 0.8 },
  shimmerHz: 0.5,
} as const;

/** A point `u` (0 to 1) along a parabola from `a` to `b` that rises `lift` u over the straight line at its middle (writes `out`). */
export function arcPoint(a: Vec3, b: Vec3, u: number, lift: number, out: Vec3): Vec3 {
  out.x = a.x + (b.x - a.x) * u;
  out.y = a.y + (b.y - a.y) * u + 4 * u * (1 - u) * lift;
  out.z = a.z + (b.z - a.z) * u;
  return out;
}

/** The lift (at most `want`) that keeps an arc from `a` to `b` under `FX_CEILING`. */
export const arcLift = (a: Vec3, b: Vec3, want: number): number => Math.max(0, Math.min(want, FX_CEILING - Math.max(a.y, b.y)));

const W = LOBBY.officeWing;
const COL = officeTowerColumn(W);
const FACE = officeTowerYaw(W);
/** The column's lane face: `OUT` u along its normal, its dots spread along `AX`. */
const OUT = OFFICE.tower.column / 2 + 0.02;
const AX = { x: Math.cos(FACE), z: -Math.sin(FACE) };
const PAD = officeDockPad(W);
const WALL = officeWallRect(W);
const WALL_MID: Vec3 = { x: (WALL.minX + WALL.maxX) / 2, y: OFFICE.wall.bottom + OFFICE.wall.h / 2, z: WALL.minZ };
const MID_LANE = (TOWER.lanes - 1) / 2;
const UP = new Vector3(0, 1, 0);
const M = new Matrix4();
const Q = new Quaternion();
const V = new Vector3();
const S = new Vector3();
const C = new Color();
const A: Vec3 = { x: 0, y: 0, z: 0 };
const B: Vec3 = { x: 0, y: 0, z: 0 };
const P: Vec3 = { x: 0, y: 0, z: 0 };
const CYAN = new Color(COLORS.cyan);
const VIOLET = new Color(COLORS.violet);
const GREEN = new Color(COLORS.green);
const RED = new Color(STATUS_COLOR.failure);
/** Where unused instances rest at zero scale (on the office, so the meshes' computed bounds stay on it). */
const GLOW_REST = lanePoint(MID_LANE, { x: 0, y: 0, z: 0 });
const PART_REST: Vec3 = { x: PAD.x, y: OFFICE.dock.pad, z: PAD.z };
const SIZE = PIPE_PARTS.size;

/** The middle of tower lane `lane` (fractional for the middle lane) on the column's stop-facing face. */
function lanePoint(lane: number, out: Vec3): Vec3 {
  out.x = COL.x + Math.sin(FACE) * OUT;
  out.y = OFFICE.tower.plinth + TOWER.base + lane * TOWER.gap;
  out.z = COL.z + Math.cos(FACE) * OUT;
  return out;
}

/** A desk's Rover head top (`from` a slot), else `fallback`. */
function deskOr(from: number, fallback: Vec3, out: Vec3): Vec3 {
  const s = OFFICE_SLOTS[from];
  if (!s) return Object.assign(out, fallback);
  out.x = s.rover.x;
  out.y = s.lift + OFFICE_ROVER_HEAD_TOP;
  out.z = s.rover.z;
  return out;
}

/** Stack box `k` on the dock pad: 3 per row along x, rows piled up. */
function stackAt(k: number, out: Vec3): Vec3 {
  out.x = PAD.x + ((k % PIPE_PARTS.perRow) - 1) * SIZE * 1.15;
  out.y = OFFICE.dock.pad + SIZE / 2 + Math.floor(k / PIPE_PARTS.perRow) * SIZE;
  out.z = PAD.z;
  return out;
}

/** A glow dot at `p` turned to the office stop; hidden (zero scale) when `gain` is not positive. */
function dot(m: Float32Array, c: Float32Array, i: number, p: Vec3, size: number, color: Color, gain: number): void {
  M.compose(V.set(p.x, p.y, p.z), Q.setFromAxisAngle(UP, Math.atan2(W.stop.x - p.x, W.stop.z - p.z)), S.setScalar(gain > 0 ? size : 0)).toArray(m, i * 16);
  C.copy(color).multiplyScalar(Math.max(0, gain)).toArray(c, i * 3);
}

const hide = (m: Float32Array, c: Float32Array, i: number) => dot(m, c, i, GLOW_REST, 0, CYAN, 0);

/** 8 dots on a ring of radius `r` around `o`: flat over the floor, else upright in the tower's face plane. */
function ring(m: Float32Array, c: Float32Array, i: number, o: Vec3, r: number, flat: boolean, size: number, color: Color, gain: number): void {
  for (let k = 0; k < 8; k++) {
    const x = Math.cos((k * Math.PI) / 4) * r;
    const y = Math.sin((k * Math.PI) / 4) * r;
    P.x = o.x + (flat ? y : AX.x * x);
    P.y = o.y + (flat ? 0 : y);
    P.z = o.z + (flat ? x : AX.z * x);
    dot(m, c, i + k, gain > 0 ? P : GLOW_REST, size, color, gain);
  }
}

function box(parts: Float32Array, i: number, p: Vec3 | null): void {
  M.compose(V.set(p?.x ?? PART_REST.x, p?.y ?? PART_REST.y, p?.z ?? PART_REST.z), Q.identity(), S.setScalar(p ? SIZE : 0)).toArray(parts, i * 16);
}

interface Slot {
  t0: number;
  /** The desk slot (-1: the wall or the tower), the lane, or 0. */
  at: number;
  ok: boolean;
}

const pool = (n: number): Slot[] => Array.from({ length: n }, () => ({ t0: -Infinity, at: 0, ok: true }));
/** The progress (0 to 1 while it plays) of the effect in `s`, `d` s long. */
const progress = (s: Slot, t: number, d: number): number => (t - s.t0) / d;
const live = (u: number) => u >= 0 && u < 1;
const still = () => false;
const COUNT = { packet: "packets", burst: "bursts", crown: "crowns", package: "packages", deployFailed: "deployFailed" } as const;
const CROWN: Vec3 = { x: COL.x, y: OFFICE.tower.plinth + OFFICE.tower.h + 0.4, z: COL.z };
const DOCK: Vec3 = { x: PAD.x, y: OFFICE.dock.pad + 0.2, z: PAD.z };

/** The pipeline effects' state: fixed pools, played by `play`, drawn by `write` when `key` changes. */
export class PipelineFx {
  /** What played since mount (the probe's `pipe`). */
  readonly counts = { packets: 0, bursts: 0, crowns: 0, packages: 0, deployFailed: 0 };
  private packets = pool(PIPE_GLOW.packets);
  private bursts = pool(PIPE_GLOW.bursts);
  private crown = pool(1)[0];
  private pkg = pool(1)[0];
  private failed = pool(1)[0];
  /** The scene time the last moving effect ends. */
  private until = -Infinity;

  /** Starts `e` at scene time `t` (a new effect takes its pool's oldest slot); under reduced motion no packet, burst or crown, and a package lands at once. */
  play(e: PipeEvent, t: number, reduced: boolean): void {
    const k = e.kind;
    if (reduced && (k === "packet" || k === "burst" || k === "crown")) return;
    this.counts[COUNT[k]]++;
    if (k === "package" && reduced) return void (this.pkg.t0 = -Infinity);
    const pools = k === "packet" ? this.packets : k === "burst" ? this.bursts : [k === "crown" ? this.crown : k === "package" ? this.pkg : this.failed];
    let s = pools[0];
    for (const x of pools) if (x.t0 < s.t0) s = x;
    s.t0 = t;
    s.at = k === "packet" || k === "package" ? (typeof e.from === "number" ? e.from : -1) : k === "burst" ? e.lane : 0;
    s.ok = "ok" in e ? e.ok : true;
    if (!reduced) this.until = Math.max(this.until, t + PIPE_FX[k].s);
  }

  /** Changes only when the picture does: a 30 Hz tick while an effect moves (never under reduced motion), the stack count, the dock ring's state (8 Hz while it shimmers). */
  key(t: number, merged: number, deploying: boolean, reduced: boolean): string {
    const ring = live(progress(this.failed, t, PIPE_FX.deployFailed.s)) ? "f" : deploying ? (reduced ? "s" : `s${Math.floor(t * 8)}`) : "";
    return `${!reduced && t < this.until ? Math.floor(t * 30) : "-"}|${Math.min(PIPE_PARTS.stack, merged)}|${ring}`;
  }

  /** Writes every pipeline instance: the glow block in `PIPE_GLOW`'s order, the packages from `PACKAGE_START`; reduced motion (even mid-effect) hides what moves. */
  write(t: number, merged: number, deploying: boolean, reduced: boolean, m: Float32Array, c: Float32Array, parts: Float32Array): void {
    const on = reduced ? still : live;
    let i = PIPE_GLOW.start;
    for (const s of this.packets) {
      const u = progress(s, t, PIPE_FX.packet.s);
      deskOr(s.at, WALL_MID, A);
      lanePoint(MID_LANE, B);
      const lift = arcLift(A, B, PIPE_FX.packet.lift);
      const step = PIPE_FX.packet.step / Math.hypot(B.x - A.x, B.y - A.y, B.z - A.z);
      for (let j = 0; j < PIPE_GLOW.packetDots; j++, i++) {
        const v = u - j * step;
        if (on(u) && v >= 0) dot(m, c, i, arcPoint(A, B, v, lift, P), PIPE_FX.packet.size, CYAN, PIPE_FX.packet.gain * (1 - j * 0.18));
        else hide(m, c, i);
      }
    }
    const { r0, r1, size, gain } = PIPE_FX.burst;
    for (const s of this.bursts) {
      const u = progress(s, t, PIPE_FX.burst.s);
      ring(m, c, i, lanePoint(s.at, B), r0 + u * (r1 - r0), false, size, s.ok ? GREEN : RED, on(u) ? (1 - u) * gain : 0);
      i += PIPE_GLOW.burstDots;
    }
    const cu = progress(this.crown, t, PIPE_FX.crown.s);
    ring(m, c, i, CROWN, PIPE_FX.crown.r, true, PIPE_FX.crown.size, this.crown.ok ? GREEN : RED, on(cu) ? Math.sin(Math.PI * cu) * PIPE_FX.crown.gain : 0);
    i += PIPE_GLOW.crown;
    // The flying package (a parts box with a violet core and trail) lands as the next box on the stack.
    const pu = progress(this.pkg, t, PIPE_FX.package.s);
    const flying = on(pu);
    const stacked = Math.min(PIPE_PARTS.stack, merged);
    const shown = flying ? Math.max(0, stacked - 1) : stacked;
    deskOr(this.pkg.at, lanePoint(MID_LANE, B), A);
    stackAt(Math.min(shown, PIPE_PARTS.stack - 1), B);
    const lift = arcLift(A, B, Infinity);
    const e = pu * pu * (3 - 2 * pu);
    for (let j = 0; j < PIPE_GLOW.trail; j++, i++) {
      const v = e - (j + 1) * 0.03;
      if (flying && v >= 0) dot(m, c, i, arcPoint(A, B, v, lift, P), 0.12 - j * 0.012, VIOLET, 1 - j / 7);
      else hide(m, c, i);
    }
    arcPoint(A, B, e, lift, P);
    box(parts, PACKAGE_START, flying ? P : null);
    dot(m, c, i++, flying ? P : GLOW_REST, SIZE * 1.6, VIOLET, flying ? 1.4 : 0);
    for (let k = 0; k < PIPE_PARTS.stack; k++, i++) {
      const on = k < shown;
      box(parts, PACKAGE_START + PIPE_PARTS.flying + k, on ? stackAt(k, P) : null);
      dot(m, c, i, on ? P : GLOW_REST, SIZE * 1.4, VIOLET, on ? 0.9 : 0);
    }
    const fu = progress(this.failed, t, PIPE_FX.deployFailed.s);
    const shimmer = reduced ? 0.9 : 0.6 + 0.4 * Math.sin(Math.PI * 2 * PIPE_FX.shimmerHz * t);
    ring(m, c, i, DOCK, 1.6, true, 0.18, live(fu) ? RED : VIOLET, live(fu) ? (reduced ? 1.2 : Math.sin(Math.PI * fu) * 1.8) : deploying ? shimmer : 0);
  }
}
/** The rest state (nothing playing, no stack, the ring dark): every pipeline instance at zero scale on the office. */
export const restPipeline = (m: Float32Array, c: Float32Array, parts: Float32Array): void => new PipelineFx().write(0, 0, false, true, m, c, parts);
