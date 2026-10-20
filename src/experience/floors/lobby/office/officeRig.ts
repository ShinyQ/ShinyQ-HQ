import { Color, Euler, Matrix4, Quaternion, Vector3 } from "three";
import type { OfficeProgress, OfficeState } from "@/lib/office/protocol";
import type { OfficeSlot } from "../officeLayout";
import { CREW_GLOW } from "./crewFx";
import { DESK_SCREEN, OFFICE_ROVER, OFFICE_STATE_STYLE, type OfficePose } from "./officeVisual";

/**
 * Instance matrices and quad corners for the office Rovers, written in place every frame the office is in view
 * (no allocation in the write functions: module temporaries and constant tables; `glowKey` builds a short string). Chest, head, two arms, the antenna stalk and the flag pole share one
 * instanced mesh, the treads another; the faces, desk screens and flag plates are corners of one merged quad mesh;
 * the antenna tips, the halos and the progress dots are one instanced holo mesh.
 */
export const PARTS_PER_ROVER = 6;
export const TREADS_PER_ROVER = 2;
/** Glow instances per Rover: the rig's 18 (tip, halo, 16 progress dots, indexes `base` to `base + 17`), then the crew's (`crewFx.ts`). */
export const GLOW_PER_ROVER = 2 + OFFICE_ROVER.progress.count + CREW_GLOW.count;
/** The flag pole (in the parts mesh) and plate (a quad on the atlas's flag cell), held in the raised left hand. */
export const FLAG = { pole: { w: 0.06, h: 1.2 }, plate: { w: 0.6, h: 0.4 } } as const;

const M = new Matrix4();
const A = new Matrix4();
const B = new Matrix4();
const Q = new Quaternion();
const E = new Euler(0, 0, 0, "YXZ");
const V = new Vector3();
const S = new Vector3();
const T = new Vector3();
const ACROSS = new Vector3();
const ONE = new Vector3(1, 1, 1);
const C = new Color();
const FLAT = new Quaternion().setFromEuler(new Euler(-Math.PI / 2, 0, 0));
const SLEEP_TIP = "#3b3f5c";
/** Quad corner signs: bottom left, bottom right, top right, top left. */
const QUAD_X = [-0.5, 0.5, 0.5, -0.5] as const;
const QUAD_Y = [-0.5, -0.5, 0.5, 0.5] as const;
type Part = readonly [number, number, number, number, number, number];

/** The Rover's frame: its spot plus the pose's offsets on its own axes, turned to face the arc centre plus the pose's turn. */
export function roverFrame(slot: OfficeSlot, p: OfficePose, out: Matrix4): Matrix4 {
  const c = Math.cos(slot.yaw);
  const s = Math.sin(slot.yaw);
  // Local x is (cos yaw, -sin yaw) and local z (sin yaw, cos yaw) in floor x and z.
  T.set(slot.rover.x + p.x * c + p.z * s, p.y, slot.rover.z - p.x * s + p.z * c);
  E.set(p.rx, slot.yaw + p.ry + p.yaw, p.rz, "YXZ");
  return out.compose(T, Q.setFromEuler(E), ONE);
}

/** The left hand's point in the Rover's frame for an arm angle (the arm's far end). */
function hand(angle: number, out: Vector3): Vector3 {
  const R = OFFICE_ROVER;
  return out.set(-R.shoulder.x, R.shoulder.y - Math.sin(angle) * R.arm.d, R.shoulder.z + Math.cos(angle) * R.arm.d);
}

function box(frame: Matrix4, part: Part, target: Float32Array, index: number): void {
  A.compose(V.set(part[0], part[1], part[2]), Q.identity(), S.set(part[3], part[4], part[5]));
  M.multiplyMatrices(frame, A).toArray(target, index * 16);
}

function arm(frame: Matrix4, side: number, angle: number, parts: Float32Array, index: number): void {
  const R = OFFICE_ROVER;
  // Shoulder pivot: turn about x, then the arm reaches forward half its length.
  A.makeTranslation(side * R.shoulder.x, R.shoulder.y, R.shoulder.z);
  A.multiply(B.makeRotationX(angle));
  A.multiply(B.makeTranslation(0, 0, R.arm.d / 2));
  A.multiply(B.makeScale(R.arm.w, R.arm.h, R.arm.d));
  M.multiplyMatrices(frame, A).toArray(parts, index * 16);
}

export function writeRover(frame: Matrix4, p: OfficePose, parts: Float32Array, slot: number, treads: Float32Array): void {
  const R = OFFICE_ROVER;
  const at = slot * PARTS_PER_ROVER;
  box(frame, R.chest, parts, at);
  box(frame, R.head, parts, at + 1);
  arm(frame, -1, p.armL, parts, at + 2);
  arm(frame, 1, p.armR, parts, at + 3);
  box(frame, R.stalk, parts, at + 4);
  hand(p.armL, ACROSS);
  const h = FLAG.pole.h * p.flag;
  A.compose(V.set(ACROSS.x, ACROSS.y + h / 2, ACROSS.z), Q.identity(), S.set(p.flag > 0 ? FLAG.pole.w : 0, h, p.flag > 0 ? FLAG.pole.w : 0));
  M.multiplyMatrices(frame, A).toArray(parts, (at + 5) * 16);
  box(frame, R.treads[0], treads, slot * TREADS_PER_ROVER);
  box(frame, R.treads[1], treads, slot * TREADS_PER_ROVER + 1);
}

/** Four corners (bottom left, bottom right, top right, top left, counter-clockwise from the front) of a w x h quad facing the frame's +z. */
function writeQuad(frame: Matrix4, cx: number, cy: number, cz: number, w: number, h: number, positions: Float32Array, quad: number): void {
  for (let k = 0; k < 4; k++) V.set(cx + QUAD_X[k] * w, cy + QUAD_Y[k] * h, cz).applyMatrix4(frame).toArray(positions, (quad * 4 + k) * 3);
}

export function writeFace(frame: Matrix4, positions: Float32Array, quad: number): void {
  const f = OFFICE_ROVER.face;
  writeQuad(frame, 0, f.y, f.z, f.w, f.h, positions, quad);
}

/** The flag plate at the pole's top, waving about the pole by `p.wave`; collapsed to a point while lowered. */
export function writeFlag(frame: Matrix4, p: OfficePose, positions: Float32Array, quad: number): void {
  hand(p.armL, ACROSS);
  const top = ACROSS.y + FLAG.pole.h * p.flag;
  A.copy(frame).multiply(B.makeTranslation(ACROSS.x, top - FLAG.plate.h / 2, ACROSS.z)).multiply(B.makeRotationY(p.wave)).multiply(B.makeTranslation(-FLAG.plate.w / 2, 0, 0.01));
  const k = p.flag > 0.98 ? 1 : 0;
  writeQuad(A, 0, 0, 0, FLAG.plate.w * k, FLAG.plate.h * k, positions, quad);
}

const DESK = new Matrix4();
export function writeDeskScreen(slot: OfficeSlot, positions: Float32Array, quad: number): void {
  E.set(0, slot.yaw, 0, "YXZ");
  DESK.compose(T.set(slot.desk.x, 0, slot.desk.z), Q.setFromEuler(E), ONE);
  DESK.multiply(A.makeTranslation(DESK_SCREEN.x, DESK_SCREEN.y, DESK_SCREEN.z));
  DESK.multiply(A.makeRotationY(DESK_SCREEN.toe));
  writeQuad(DESK, 0, 0, 0, DESK_SCREEN.w, DESK_SCREEN.h, positions, quad);
}

/** CI dots lit from done of total, clamped to the ring; -1 when the ring shows the moving run instead. */
function litDots(state: OfficeState, progress: OfficeProgress | null): number {
  const n = OFFICE_ROVER.progress.count;
  if (state !== "ci" || !progress || progress.total <= 0) return -1;
  return Math.min(n, Math.max(0, Math.round((progress.done / progress.total) * n)));
}

/** The moving run's first dot (fixed under reduced motion). */
const dotHead = (reduced: boolean, t: number): number => (reduced ? 0 : Math.floor(t * 6) % OFFICE_ROVER.progress.count);

/**
 * Changes whenever `writeGlow`'s tone, lit dot count or moving-run head would change (state, progress, reduced
 * motion and time), so the frame loop can skip glow colour writes when neither this key nor the pose changed.
 * The camera-turned tip is not keyed: it must still be rewritten when the camera moves (Task 9 handles that).
 */
export function glowKey(state: OfficeState, progress: OfficeProgress | null, reduced: boolean, t: number): string {
  if (state !== "ci" && state !== "testing") return state;
  const lit = litDots(state, progress);
  return lit >= 0 ? `${state}:lit${lit}` : `${state}:run${dotHead(reduced, t)}`;
}

/**
 * One Rover's glow instances: the antenna tip (turned to the camera; dim when asleep), the halo on the floor, and
 * the progress dots around it (CI jobs done of total; a moving run of four while tests or a CI wait without numbers run).
 * `gain` scales the tip and halo colours.
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
  gain = 1,
): void {
  const R = OFFICE_ROVER;
  const base = slot.slot * GLOW_PER_ROVER;
  const tone = OFFICE_STATE_STYLE[state].color;
  const asleep = state === "asleep";
  V.set(R.tip.x, R.tip.y, R.tip.z).applyMatrix4(frame);
  E.set(0, Math.atan2(camera.x - V.x, camera.z - V.z), 0, "YXZ");
  M.compose(V, Q.setFromEuler(E), S.setScalar(R.tip.size * tipScale)).toArray(matrices, base * 16);
  C.set(asleep ? SLEEP_TIP : tone).multiplyScalar(gain).toArray(colors, base * 3);
  M.compose(T.set(slot.rover.x, R.halo.y, slot.rover.z), FLAT, S.setScalar(R.halo.size)).toArray(matrices, (base + 1) * 16);
  C.set(tone).multiplyScalar(asleep ? 0.08 : 0.35 * gain).toArray(colors, (base + 1) * 3);
  const n = R.progress.count;
  const show = state === "ci" || state === "testing";
  const lit = litDots(state, progress);
  const head = dotHead(reduced, t);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    T.set(slot.rover.x + Math.sin(a) * R.progress.r, R.progress.y, slot.rover.z + Math.cos(a) * R.progress.r);
    M.compose(T, FLAT, S.setScalar(show ? R.progress.size : 0)).toArray(matrices, (base + 2 + i) * 16);
    const on = lit >= 0 ? i < lit : (i - head + n) % n < 4;
    C.set(tone).multiplyScalar(on ? 1 : 0.15).toArray(colors, (base + 2 + i) * 3);
  }
}
