import { Color, Euler, Matrix4, Quaternion, Vector3 } from "three";
import type { OfficeProgress, OfficeState } from "@/lib/office/protocol";
import type { OfficeSlot } from "../officeLayout";
import { DESK_SCREEN, OFFICE_ROVER, OFFICE_STATE_STYLE, type OfficePose } from "./officeVisual";

/**
 * Instance matrices and quad corners for the office Rovers, written in place every frame the office is in view
 * (no allocation: module temporaries). Chest, head, two arms and the antenna stalk share one instanced mesh,
 * the treads another; the faces and desk screens are corners of one merged quad mesh; the antenna tips, the
 * halos and the progress dots are one instanced holo mesh.
 */
export const PARTS_PER_ROVER = 5;
export const TREADS_PER_ROVER = 2;
export const GLOW_PER_ROVER = 2 + OFFICE_ROVER.progress.count;
/** The HTML chip floats this high above the Rover's spot (above the antenna). */
export const CHIP_LIFT = 2.75;

const M = new Matrix4();
const A = new Matrix4();
const B = new Matrix4();
const Q = new Quaternion();
const E = new Euler(0, 0, 0, "YXZ");
const V = new Vector3();
const S = new Vector3();
const T = new Vector3();
const ONE = new Vector3(1, 1, 1);
const C = new Color();
const FLAT = new Quaternion().setFromEuler(new Euler(-Math.PI / 2, 0, 0));
const SLEEP_TIP = "#3b3f5c";
type Part = readonly [number, number, number, number, number, number];

/** The Rover's frame: its spot, turned to face the arc centre, plus the pose (bob, pitch, sway, roll). */
export function roverFrame(slot: OfficeSlot, p: OfficePose, out: Matrix4): Matrix4 {
  E.set(p.rx, slot.yaw + p.ry, p.rz, "YXZ");
  return out.compose(T.set(slot.rover.x, p.y, slot.rover.z), Q.setFromEuler(E), ONE);
}

function box(frame: Matrix4, part: Part, target: Float32Array, index: number): void {
  A.compose(V.set(part[0], part[1], part[2]), Q.identity(), S.set(part[3], part[4], part[5]));
  M.multiplyMatrices(frame, A).toArray(target, index * 16);
}

export function writeRover(frame: Matrix4, p: OfficePose, parts: Float32Array, slot: number, treads: Float32Array): void {
  const R = OFFICE_ROVER;
  const at = slot * PARTS_PER_ROVER;
  box(frame, R.chest, parts, at);
  box(frame, R.head, parts, at + 1);
  const arms: readonly [number, number][] = [
    [-1, p.armL],
    [1, p.armR],
  ];
  arms.forEach(([side, angle], i) => {
    // Shoulder pivot: turn about x, then the arm reaches forward half its length.
    A.makeTranslation(side * R.shoulder.x, R.shoulder.y, R.shoulder.z);
    A.multiply(B.makeRotationX(angle));
    A.multiply(B.makeTranslation(0, 0, R.arm.d / 2));
    A.multiply(B.makeScale(R.arm.w, R.arm.h, R.arm.d));
    M.multiplyMatrices(frame, A).toArray(parts, (at + 2 + i) * 16);
  });
  box(frame, R.stalk, parts, at + 4);
  box(frame, R.treads[0], treads, slot * TREADS_PER_ROVER);
  box(frame, R.treads[1], treads, slot * TREADS_PER_ROVER + 1);
}

/** Four corners (bottom left, bottom right, top right, top left, counter-clockwise from the front) of a w x h quad facing the frame's +z. */
function writeQuad(frame: Matrix4, cx: number, cy: number, cz: number, w: number, h: number, positions: Float32Array, quad: number): void {
  const xs = [-w / 2, w / 2, w / 2, -w / 2];
  const ys = [-h / 2, -h / 2, h / 2, h / 2];
  for (let k = 0; k < 4; k++) V.set(cx + xs[k], cy + ys[k], cz).applyMatrix4(frame).toArray(positions, (quad * 4 + k) * 3);
}

export function writeFace(frame: Matrix4, positions: Float32Array, quad: number): void {
  const f = OFFICE_ROVER.face;
  writeQuad(frame, 0, f.y, f.z, f.w, f.h, positions, quad);
}

const DESK = new Matrix4();
export function writeDeskScreen(slot: OfficeSlot, positions: Float32Array, quad: number): void {
  E.set(0, slot.yaw, 0, "YXZ");
  DESK.compose(T.set(slot.desk.x, 0, slot.desk.z), Q.setFromEuler(E), ONE);
  DESK.multiply(A.makeTranslation(DESK_SCREEN.x, DESK_SCREEN.y, DESK_SCREEN.z));
  DESK.multiply(A.makeRotationY(DESK_SCREEN.toe));
  writeQuad(DESK, 0, 0, 0, DESK_SCREEN.w, DESK_SCREEN.h, positions, quad);
}

/**
 * One Rover's glow instances: the antenna tip (turned to the camera; dim when asleep), the halo on the floor, and
 * the progress dots around it (CI jobs done of total; a moving run of four while tests or a CI wait without numbers run).
 */
export function writeGlow(
  slot: OfficeSlot,
  frame: Matrix4,
  state: OfficeState,
  progress: OfficeProgress | null,
  tipScale: number,
  t: number,
  reduced: boolean,
  camera: { x: number; z: number },
  matrices: Float32Array,
  colors: Float32Array,
): void {
  const R = OFFICE_ROVER;
  const base = slot.slot * GLOW_PER_ROVER;
  const tone = OFFICE_STATE_STYLE[state].color;
  const asleep = state === "asleep";
  V.set(R.tip.x, R.tip.y, R.tip.z).applyMatrix4(frame);
  E.set(0, Math.atan2(camera.x - V.x, camera.z - V.z), 0, "YXZ");
  M.compose(V, Q.setFromEuler(E), S.setScalar(R.tip.size * tipScale)).toArray(matrices, base * 16);
  C.set(asleep ? SLEEP_TIP : tone).toArray(colors, base * 3);
  M.compose(T.set(slot.rover.x, R.halo.y, slot.rover.z), FLAT, S.setScalar(R.halo.size)).toArray(matrices, (base + 1) * 16);
  C.set(tone).multiplyScalar(asleep ? 0.08 : 0.35).toArray(colors, (base + 1) * 3);
  const n = R.progress.count;
  const show = state === "ci" || state === "testing";
  const lit = state === "ci" && progress && progress.total > 0 ? Math.round((progress.done / progress.total) * n) : -1;
  const head = reduced ? 0 : Math.floor(t * 6) % n;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    T.set(slot.rover.x + Math.sin(a) * R.progress.r, R.progress.y, slot.rover.z + Math.cos(a) * R.progress.r);
    M.compose(T, FLAT, S.setScalar(show ? R.progress.size : 0)).toArray(matrices, (base + 2 + i) * 16);
    const on = lit >= 0 ? i < lit : (i - head + n) % n < 4;
    C.set(tone).multiplyScalar(on ? 1 : 0.15).toArray(colors, (base + 2 + i) * 3);
  }
}

/** The chip anchor above the Rover (it follows the bob and the hop). */
export function chipAnchor(frame: Matrix4, out: { x: number; y: number; z: number }): void {
  V.set(0, CHIP_LIFT, 0).applyMatrix4(frame);
  out.x = V.x;
  out.y = V.y;
  out.z = V.z;
}
